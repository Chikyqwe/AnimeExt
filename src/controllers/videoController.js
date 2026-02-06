// src/controllers/videoController.js
const http = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto'); // Para generar IDs consistentes
const asyncHandler = require('../middlewares/asyncHandler');
const { TextCache } = require('../core/cache/cache');
const { v7: uuidv7 } = require('uuid');
const apiQueue = require('../core/queue/queueService');
const supabase = require("../services/supabaseService");
const { default: axios } = require('axios');

const { extractAllVideoLinks, getExtractor } = require('../core/core');
const { getJSONPath, getAnimeById, getAnimeByUnitId, buildEpisodeUrl } = require('../services/jsonService');
const { proxyImage, streamVideo, downloadVideo, validateVideoUrl } = require('../utils/helpers');
const { parseMegaUrl, verificarArchivoMega } = require('../utils/CheckMega');

// Aumentamos el TTL a 15 minutos para que la experiencia sea fluida
const cache = new TextCache({ ttlMs: 15 * 60 * 1000 }); 

// -------- Utils --------

/**
 * Crea una huella única para la URL. 
 * Esto asegura que la misma URL siempre devuelva el mismo UUID.
 */
function generateKey(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

function norm(name) {
  if (!name) return '';
  const n = name.toLowerCase();
  if (['yourupload', 'your-up', 'yu'].some(s => n.includes(s))) return 'yu';
  if (['burstcloud', 'bc'].some(s => n.includes(s))) return 'bc';
  if (['asnwish', 'obeywish', 'sw'].some(s => n.includes(s))) return 'sw';
  return n;
}

async function getVid(server, url, uuid, refresh = false) {
  // Si no nos pasan un uuid, generamos uno persistente basado en la URL
  const id = uuid || generateKey(url);
  
  // Si existe en cache y no pedimos refresh, devolvemos directo (Súper rápido)
  if (!refresh && cache.exists(id)) {
    return { uuid: id, Rc: cache.load(id) };
  }

  const ex = getExtractor(server);
  if (!ex) throw new Error('Extractor no encontrado');
  
  const r = await ex(url);
  if (!r || r.status >= 700) throw new Error(r?.mjs || 'Extractor error');
  
  const best = Array.isArray(r) ? r[0] : r;
  const content = best?.content?.length ? best.content : best?.hls?.content;
  
  if (!content?.length) throw new Error('Contenido vacío');

  const Rc = cache.save(id, content);
  return { uuid: id, Rc };
}

async function filterV(videos) {
  const out = [];
  for (const v of videos) {
    const s = norm(v.servidor);
    if (!getExtractor(s)) continue;
    const it = { servidor: s, label: v.label, name: v.name, url: v.url };

    if (typeof it.url === 'string' && it.url.includes('mega.nz')) {
      try {
        const { id, key } = parseMegaUrl(it.url);
        const r = await verificarArchivoMega(id, key);
        if (r?.disponible) it.url = `https://mega.nz/embed/${id}#${key}`;
        else continue;
      } catch {}
    }
    out.push(it);
  }
  return out;
}

// -------- Routes --------

// GET /api/servers
exports.servers = asyncHandler(async (req, res) => {
  let { url: u, uid, ep, mirror = 1, debug } = req.query;
  uid = uid ? parseInt(uid) : undefined;
  ep = ep ? parseInt(ep) : undefined;
  const dbg = debug === 'true';
  let anime = null, src = 'UNKNOWN';

  const send = (err, data = []) => {
    if (!dbg) return err ? res.json({ error: err }) : res.json(data);
    return res.json({ error: err, data, debug: { u, uid, ep, mirror, src, anime } });
  };

  try {
    if (!u && uid) {
      anime = getAnimeByUnitId(uid);
      if (!anime?.unit_id) return send(`Anime ${uid} no encontrado`);
      if (!ep) return send('ep obligatorio');
      u = await buildEpisodeUrl(anime, ep, mirror);
      if (!u) return send('No se pudo construir URL');
      if (anime.source) src = anime.source;
    }

    if (!u) return send('URL inválida');
    
    const vids = await extractAllVideoLinks(u);
    if (!vids || vids.status >= 700) return send({ error: true, code: vids.status, message: vids.mjs || 'Error extractor', server: 'main' });

    const valid = await filterV(vids);
    if (!valid.length) return send('No hay videos válidos');

    const enriched = valid.map(v => ({ ...v, src }));
    return send(null, enriched);
  } catch (e) {
    console.error('[servers]', e);
    return send('Error extracción: ' + e.message);
  }
});

// GET /api/video (API principal con caché persistente)
exports.api = asyncHandler(async (req, res) => {
  try {
    let { uid, ep, mirror = 1, server, url, m, ignoreVerify, uuid, refresh } = req.query;
    uid = uid ? parseInt(uid) : undefined;
    ep = ep ? parseInt(ep) : undefined;
    const srv = norm(server);
    const force = refresh === 'true';

    let anime = null;
    if (!url && uid) {
      anime = getAnimeByUnitId(uid);
      if (!anime?.unit_id) return res.status(404).json({ error: true, message: 'Anime no encontrado' });
      if (!ep) return res.status(400).json({ error: true, message: 'ep obligatorio' });
      url = await buildEpisodeUrl(anime, ep, mirror);
    }

    if (!url) return res.status(400).json({ error: true, message: 'URL inválida' });

    let vids = [];
    if (url && srv && m === 'true') vids = [{ servidor: srv, url }];
    else vids = await extractAllVideoLinks(url);
    
    if (!vids || vids.status >= 700) return res.status(404).json({ error: true, message: vids.mjs || 'Error extractor' });

    const valid = vids.map(v => ({ ...v, servidor: norm(v.servidor) }));
    let sel = srv ? valid.find(v => v.servidor === srv) : valid[0];

    if (!sel) return res.status(404).json({ error: true, message: 'Servidor no encontrado' });

    // --- SISTEMA DE CACHÉ UNIFICADO ---
    // Agregamos los servidores que suelen devolver listas HLS/M3U8
    if (['sw', 'voe', 'yu', 'bc'].includes(sel.servidor)) {
      const { uuid: id, Rc } = await getVid(sel.servidor, sel.url, uuid, force);
      return res.json({ 
        ok: true, 
        mediaurl: `https://${req.get('host')}/api/get/hls/${id}`, 
        uuid: id, 
        originalSize: Rc.originalSize, 
        compressedSize: Rc.compressedSize, 
        id: uid 
      });
    }

    // Fallback para extractores que devuelven URL directa (MP4)
    const ex = getExtractor(sel.servidor);
    const r = await ex(sel.url);
    if (!r || r.status >= 700) return res.status(404).json({ error: true, message: r?.mjs || 'Error extractor' });

    if (r.url) {
      let val = (ignoreVerify !== 'true') ? await validateVideoUrl(r.url) : null;
      return res.json({ url: r.url, baseUrl: sel.url, id: uid, verify_Instance: val });
    }

    return res.status(500).json({ error: true, message: 'Formato no reconocido' });
  } catch (e) {
    console.error('[api]', e);
    if (!res.headersSent) res.status(500).json({ error: true, message: e.message });
  }
});

// GET /api/get/hls/:uuid
exports.gethls = asyncHandler(async (req, res) => {
  const u = req.params.uuid;
  if (cache.exists(u)) {
    const m = cache.load(u);
    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.send(m);
  }
  res.status(403).json({ error: 'Contenido expirado. Solicite el video de nuevo.' });
});

// Los demás métodos (stream, download, queueStatus, appV, hlsProxy, reqProxy)
// se mantienen igual que en tu código original...
exports.stream = asyncHandler(async (req, res) => {
  const v = req.query.videoUrl;
  if (!v) return res.send(`<form><input name="videoUrl"/><button>Ver</button></form>`);
  streamVideo(v, req, res);
});

exports.reqProxy = asyncHandler(async (req, res) => {
  const u = req.query.url;
  if (!u) return res.status(400).json({ error: 'Falta url' });
  try { const { data } = await axios.get(u, { timeout: 10_000 }); res.json(data); }
  catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }); }
});

exports.download = (req, res) => downloadVideo(req, res);

exports.queueStatus = (req, res) => {
  try {
    const p = apiQueue.getPendingCount();
    const t = apiQueue.getCurrentTask();
    res.json({ pendingCount: p, currentTask: t ? { name: t.meta.name, startedAt: t.startedAt, meta: t.meta } : null });
  } catch (e) { console.error(e); res.status(500).json({ error: 'Error interno' }); }
};

exports.appV = asyncHandler(async (req, res) => {
  const ver = req.query.version ?? null;
  const { data: files, error } = await supabase.storage.from("AnimeExtApp").list("", { limit: 200 });
  if (error) throw error;

  const apk = files
    .filter(f => /^AnimeExt-(\d+(?:\.\d+)*)\.apk$/.test(f.name))
    .map(f => {
      const m = f.name.match(/^AnimeExt-(\d+(?:\.\d+)*)\.apk$/);
      const v = m[1];
      return { nombre: f.name, version: v, code: v.replace(/\./g, '') };
    });

  if (ver) {
    const a = apk.find(a => a.code === ver);
    if (!a) return res.status(404).json({ error: "Versión no encontrada" });
    const { data: s, error: se } = await supabase.storage.from("AnimeExtApp").createSignedUrl(a.nombre, 60);
    if (se) throw se;
    return res.json({ url: s.signedUrl, nombre: a.nombre });
  }

  apk.sort((a,b)=>require("semver").rcompare(a.version,b.version));
  res.json({ actual: apk[0]||null, anterior: apk[1]||null, anteriores: apk.slice(2) });
});

exports.hlsProxy = asyncHandler(async (req,res)=>{
  const u = req.query.url; if(!u) return res.status(400).json({error:'Falta url'});
  const r = req.query.ref;
  const p = new URL(u), c = p.protocol==='https:'?https:http;
  const o = { headers:{'User-Agent':'Mozilla/5.0','Accept':'*/*','Connection':'keep-alive', ...(r&&{Referer:r}) } };
  const rq = c.get(u,o,pr=>{
    res.writeHead(pr.statusCode,{'Content-Type':pr.headers['content-type']||'application/vnd.apple.mpegurl','Cache-Control':'no-store','Access-Control-Allow-Origin':'*'});
    pr.pipe(res,{end:true}); pr.on('end',()=>res.end());
  });
  rq.setTimeout(60000,()=>rq.destroy());
  rq.on('error',e=>{ console.error('[hlsProxy]',e.message); if(!res.headersSent) res.status(502).end('Error HLS'); });
  req.on('close',()=>rq.destroy());
});