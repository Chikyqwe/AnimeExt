// src/controllers/videoController.js
const http = require('http');
const https = require('https');
const { URL } = require('url');
const crypto = require('crypto');
const asyncHandler = require('../middlewares/asyncHandler');
const { TextCache } = require('../core/cache/cache');
const { Transform } = require('stream');
const apiQueue = require('../core/queue/queueService');
const { supabase } = require('../services/supabase/supabase');
const { default: axios } = require('axios');
const { HTTPS } = require('../config');

const { extractAllVideoLinks, getExtractor } = require('../core/core');
const { getJSONPath, getAnimeByUnitId, buildEpisodeUrl } = require('../services/jsonService');
const { proxyImage, streamVideo, downloadVideo, validateVideoUrl } = require('../utils/helpers');
const { parseMegaUrl, verificarArchivoMega } = require('../utils/CheckMega');

const cache = new TextCache({ ttlMs: 15 * 60 * 1000 });

// -------- Utils --------

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

async function getVid(server, url, mid, refresh = false) {
  const id = mid || generateKey(url);
  if (!refresh && cache.exists(id)) return { mid: id, Rc: cache.load(id) };

  const ex = getExtractor(server);
  if (!ex) throw new Error('Extractor no encontrado');

  const r = await ex(url);
  if (!r || r.status >= 700) throw new Error(r?.mjs || 'Extractor error');

  const best = Array.isArray(r) ? r[0] : r;
  const content = best?.content?.length ? best.content : best?.hls?.content;
  if (!content?.length) throw new Error('Contenido vacío');

  const Rc = cache.save(id, content);
  return { mid: id, Rc };
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
      } catch { }
    }
    out.push(it);
  }
  return out;
}

// -------- Routes --------

/**
 * POST /api/play
 * Body: { type, Did, uid, ep, s, m }
 * Reemplaza a GET /api/servers + GET /api/video
 * Devuelve: mirror, servers[], Sserver, url (/api/getMedia/:mid), mid, mtype, lang, timestamp, exp
 */
exports.play = asyncHandler(async (req, res) => {
  try {
    let { type = 'anime', Did, uid, ep, s = 'auto', m = 'auto', mirror, refresh } = req.body;
    uid = uid ? parseInt(uid) : undefined;
    ep = ep ? parseInt(ep) : undefined;

    if (m !== 'auto' && m !== '') {
      mirror = parseInt(m) || 1;
    } else if (mirror !== undefined && mirror !== 'auto' && mirror !== '') {
      mirror = parseInt(mirror) || 1;
    } else {
      mirror = 1;
    }
    const force = refresh === true || refresh === 'true';

    if (!uid) return res.status(400).json({ error: true, message: 'uid obligatorio' });
    if (!ep) return res.status(400).json({ error: true, message: 'ep obligatorio' });

    const anime = getAnimeByUnitId(uid);
    if (!anime?.unit_id) return res.status(404).json({ error: true, message: 'Anime no encontrado' });

    const episodeUrl = await buildEpisodeUrl(anime, ep, mirror);
    if (!episodeUrl) return res.status(404).json({ error: true, message: 'No se pudo construir URL del episodio' });

    const vids = await extractAllVideoLinks(episodeUrl);
    if (!vids || vids.status >= 700) {
      return res.status(404).json({ error: true, message: vids?.mjs || 'Error extractor' });
    }

    const valid = await filterV(vids);
    if (!valid.length) return res.status(404).json({ error: true, message: 'No hay servidores válidos' });

    // Selección de servidor
    const normalizedS = s !== 'auto' ? norm(s) : null;
    const sel = normalizedS ? valid.find(v => v.servidor === normalizedS) ?? valid[0] : valid[0];

    const serverNames = valid.map(v => v.servidor);
    const now = Math.floor(Date.now() / 1000);

    // Servidores HLS — devolver mid para /api/getMedia/:mid
    if (['sw', 'voe', 'streamwish'].includes(sel.servidor)) {
      const { mid, Rc } = await getVid(sel.servidor, sel.url, null, force);
      return res.json({
        type,
        mirror,
        servers: serverNames,
        Sserver: sel.servidor,
        url: `/api/getMedia/${mid}`,
        mid,
        lang: 'sub',
        mtype: 'hls',
        timestamp: now,
        exp: now + 15 * 60,
      });
    }

    // Servidores MP4 directos
    const ex = getExtractor(sel.servidor);
    const r = await ex(sel.url);
    if (!r || r.status >= 700) {
      return res.status(404).json({ error: true, message: r?.mjs || 'Error extractor' });
    }

    if (r.url) {
      const mid = generateKey(r.url);
      // Guardamos la url directa en cache para que /api/getMedia/:mid la devuelva
      cache.save(mid, r.url);
      return res.json({
        type,
        mirror,
        servers: serverNames,
        Sserver: sel.servidor,
        url: `/api/getMedia/${mid}`,
        mid,
        lang: 'sub',
        mtype: 'mp4',
        timestamp: now,
        exp: now + 15 * 60,
      });
    }

    return res.status(500).json({ error: true, message: 'Formato no reconocido' });
  } catch (e) {
    console.error('[play]', e);
    if (!res.headersSent) res.status(500).json({ error: true, message: e.message });
  }
});

/**
 * GET /api/getMedia/:p
 * Reemplaza a GET /api/get/hls/:uuid
 * Case 1: el mid apunta a contenido M3U8  → devuelve el m3u8 directo
 * Case 2: el mid apunta a una URL de video → devuelve { url: "/api/stream?gid=..." }
 */
exports.getMedia = asyncHandler(async (req, res) => {
  const mid = req.params.p;
  if (!cache.exists(mid)) {
    return res.status(403).json({ error: 'Contenido expirado. Solicite el video de nuevo.' });
  }

  const content = cache.load(mid);

  // Si el contenido comienza con http y NO tiene saltos de línea → es una URL directa (MP4)
  if (typeof content === 'string' && content.startsWith('http') && !content.includes('\n')) {
    const base = `${HTTPS ? 'https' : 'http'}://${req.get('host')}`;
    return res.json({
      url: `${base}/api/stream?gid=${mid}`,
    });
  }

  // Contenido M3U8
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.send(content);
});

/**
 * GET /api/stream?gid=<videoUrl o hash>
 * Renombrado desde ?videoUrl= → ?gid=
 * Mantiene compatibilidad con ?videoUrl= por retrocompatibilidad
 */
exports.stream = asyncHandler(async (req, res) => {
  const v = req.query.gid || req.query.v;
  if (!v) return res.status(400).json({ error: 'Falta parámetro "?gid" o "?v"' });

  let targetUrl = v;
  if (cache.exists(v)) {
    const cached = cache.load(v);
    if (typeof cached === 'string' && cached.startsWith('http')) {
      targetUrl = cached;
    }
  }

  streamVideo(targetUrl, req, res);
});

/**
 * GET /api/req?u=<url>&h=<headers JSON>
 * Renombrado desde ?url= → ?u=, agrega soporte de headers custom
 */
exports.reqProxy = asyncHandler(async (req, res) => {
  const u = req.query.u || req.query.url; // retrocompat
  if (!u) return res.status(400).json({ error: 'Falta parámetro u' });

  let extraHeaders = {};
  if (req.query.h) {
    try { extraHeaders = JSON.parse(req.query.h); } catch { /* headers inválidos, ignorar */ }
  }

  try {
    const { data } = await axios.get(u, {
      timeout: 10_000,
      headers: extraHeaders,
    });
    res.json(data);
  } catch (e) {
    console.error('[reqProxy]', e);
    res.status(500).json({ error: 'Error interno' });
  }
});

/**
 * GET /api/proxy?url=<ts url>&ref=<referer>
 * Renombrado desde /api/hlsProxy → /api/proxy (misma lógica, mismo nombre de params)
 */
exports.proxy = asyncHandler(async (req, res) => {
  let u = req.query.url;
  if (!u && req.query.gid) {
    try { u = Buffer.from(req.query.gid, 'base64url').toString('utf8'); } catch(e){}
  }
  if (!u) return res.status(400).json({ error: 'Falta url' });
  
  let r = req.query.ref;
  if (!r && req.query.f) {
    try { r = Buffer.from(req.query.f, 'base64url').toString('utf8'); } catch(e){}
  }
  
  const p = new URL(u), c = p.protocol === 'https:' ? https : http;
  const o = { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': r || '' } };

  const rq = c.get(u, o, (pr) => {
    res.writeHead(pr.statusCode, {
      'Content-Type': 'video/MP2T',
      'Access-Control-Allow-Origin': '*',
    });
    const cleaner = createVideoCleaner();
    pr.pipe(cleaner).pipe(res);
  });

  rq.on('error', e => {
    console.error('[proxy]', e.message);
    if (!res.headersSent) res.status(502).end();
  });
});

// -------- Misc (sin cambios de contrato) --------

exports.download = (req, res) => downloadVideo(req, res);

exports.queueStatus = (req, res) => {
  try {
    const p = apiQueue.getPendingCount();
    const t = apiQueue.getCurrentTask();
    res.json({
      pendingCount: p,
      currentTask: t ? { name: t.meta.name, startedAt: t.startedAt, meta: t.meta } : null,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Error interno' });
  }
};

exports.appV = asyncHandler(async (req, res) => {
  const ver = req.query.version ?? null;
  const { data: files, error } = await supabase.storage.from('AnimeExtApp').list('', { limit: 200 });
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
    if (!a) return res.status(404).json({ error: 'Versión no encontrada' });
    const { data: s, error: se } = await supabase.storage.from('AnimeExtApp').createSignedUrl(a.nombre, 60);
    if (se) throw se;
    return res.json({ url: s.signedUrl, nombre: a.nombre });
  }

  apk.sort((a, b) => require('semver').rcompare(a.version, b.version));
  res.json({ actual: apk[0] || null, anterior: apk[1] || null, anteriores: apk.slice(2) });
});

// -------- TS stream cleaner (sin cambios) --------

const createVideoCleaner = () => {
  let buffer = Buffer.alloc(0);
  let synced = false;

  return new Transform({
    transform(chunk, encoding, callback) {
      buffer = Buffer.concat([buffer, chunk]);

      while (buffer.length >= 188) {
        if (!synced) {
          let found = -1;
          for (let i = 0; i < buffer.length - 376; i++) {
            if (buffer[i] === 0x47 && buffer[i + 188] === 0x47 && buffer[i + 376] === 0x47) {
              found = i;
              break;
            }
          }
          if (found === -1) { buffer = buffer.slice(buffer.length - 376); break; }
          buffer = buffer.slice(found);
          synced = true;
        }
        if (buffer.length < 188) break;
        this.push(buffer.slice(0, 188));
        buffer = buffer.slice(188);
      }

      callback();
    },
  });
};