const axios = require('axios');
const qs = require('qs');
const cheerio = require('cheerio');
const { URL } = require('url');
const { unpack, detect } = require('unpacker');

/* =========================
   CONFIG
========================= */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0';

const ax = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent': UA,
    'Accept-Encoding': 'gzip, deflate, br',
    'Accept': '*/*'
  }
});

/* =========================
   UTILS
========================= */

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function retry(fn, max = 3, base = 400) {
  let err;
  for (let i = 0; i < max; i++) {
    try { return await fn(); }
    catch (e) {
      err = e;
      await sleep(base * (i + 1));
    }
  }
  throw err;
}

async function get(url, opt = {}) {
  return retry(async () => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), (opt.timeout || 10000) + 100);
    try {
      return await ax.get(url, { ...opt, signal: c.signal });
    } finally {
      clearTimeout(t);
    }
  }, opt.retries);
}

async function post(url, data, opt = {}) {
  return retry(async () => {
    const c = new AbortController();
    const t = setTimeout(() => c.abort(), (opt.timeout || 10000) + 100);
    try {
      return await ax.post(url, data, { ...opt, signal: c.signal });
    } finally {
      clearTimeout(t);
    }
  }, opt.retries);
}

function b64(str) {
  try {
    str = str.replace(/-/g, '+').replace(/_/g, '/');
    while (str.length % 4) str += '=';
    return Buffer.from(str, 'base64').toString('utf8');
  } catch {
    return null;
  }
}

function fix(u) {
  try {
    const x = new URL(u);
    if (x.hostname.includes('obeywish.com')) {
      x.hostname = 'asnwish.com';
    }
    return x.href;
  } catch {
    return u;
  }
}

function obj(str) {
  return JSON.parse(
    str
      .replace(/(\w+):/g, '"$1":')
      .replace(/'/g, '"')
  );
}

/* =========================
   PAGE EXTRACTORS
========================= */

function exAnimeID($) {
  const out = [];

  $('#partes .parte').each((_, el) => {
    let raw = $(el).attr('data');
    if (!raw) return;

    try {
      raw = raw.replace(/'/g, '"');
      const j = JSON.parse(raw);
      if (!j.v) return;

      const html = j.v
        .replace(/\\u003C/g, '<')
        .replace(/\\u003E/g, '>')
        .replace(/\\u002F/g, '/');

      const m = html.match(/src="([^"]+)"/i);
      if (!m) return;

      const url = fix(m[1]);
      out.push({
        server: new URL(url).hostname,
        type: 'embed',
        url
      });
    } catch {}
  });

  return out;
}

function exAnimeYTX($) {
  const out = [];

  $('select.mirror option').each((_, el) => {
    const v = $(el).attr('value');
    if (!v) return;

    const h = b64(v);
    if (!h) return;

    const $i = cheerio.load(h);
    const src = $i('iframe').attr('src');
    if (!src) return;

    const url = fix(src);
    out.push({
      server: new URL(url).hostname,
      type: 'embed',
      url
    });
  });

  return out;
}

function exGeneric($) {
  const out = [];

  $('script').each((_, el) => {
    const s = $(el).html();
    if (!s) return;

    const m = s.match(/var\s+videos\s*=\s*(\[.*?\]|\{[\s\S]*?\});/s);
    if (!m) return;

    try {
      const j = JSON.parse(m[1].replace(/\\\//g, '/'));

      if (j.SUB) {
        j.SUB.forEach(v => out.push({
          server: v.server || v[0],
          type: 'embed',
          url: fix(v.url || v.code || v[1])
        }));
      } else if (Array.isArray(j)) {
        j.forEach(v => out.push({
          server: v[0],
          type: 'embed',
          url: fix(v[1])
        }));
      }
    } catch {}
  });

  return out;
}

/* =========================
   MAIN PAGE PARSER
========================= */

async function extractAll(pageUrl) {
  let html;

  try {
    html = (await get(pageUrl, { timeout: 8000 })).data;
  } catch {
    return [];
  }

  const $ = cheerio.load(html);

  if (/animeid/i.test(pageUrl)) return exAnimeID($);
  if (/animeytx/i.test(pageUrl)) return exAnimeYTX($);
  return exGeneric($);
}

/* =========================
   M3U8 / STREAMWISH
========================= */

function best(master, base) {
  const l = master.split('\n');
  let r = null, s = 0;

  for (let i = 0; i < l.length; i++) {
    const m = /RESOLUTION=(\d+)x(\d+)/.exec(l[i]);
    if (m && l[i + 1] && !l[i + 1].startsWith('#')) {
      const n = m[1] * m[2];
      if (n > s) {
        s = n;
        r = new URL(l[i + 1], base).href;
      }
    }
  }
  return r;
}

async function redir(u) {
  const dmca = ["hgplaycdn.com","habetar.com","yuguaab.com","guxhag.com"];
  const main = ["kravaxxa.com","davioad.com","haxloppd.com"];

  const x = new URL(u);
  const d = dmca[Math.floor(Math.random() * dmca.length)];
  return `https://${d}${x.pathname}${x.search}`;
}

async function exM3U8(url) {
  const r = await redir(url);
  const html = (await get(r)).data;

  const m = html.match(/<script[^>]*>([\s\S]*?eval\(function\(p,a,c,k,e,d\)[\s\S]*?)<\/script>/i);
  if (!m || !detect(m[1])) return [];

  const js = unpack(m[1]);
  const l = js.match(/var\s+links\s*=\s*(\{[\s\S]*?\});/i);
  if (!l) return [];

  const links = obj(l[1]);
  if (!links.hls4) return [];

  const master = links.hls4.startsWith('/')
    ? new URL(links.hls4, r).href
    : links.hls4;

  const txt = (await get(master)).data;
  const base = master.slice(0, master.lastIndexOf('/') + 1);
  const bestUrl = best(txt, base) || master;

  return [{
    server: 'streamwish',
    type: 'hls',
    url: bestUrl
  }];
}

/* =========================
   BURSTCLOUD
========================= */

async function exBC(url) {
  const html = (await get(url)).data;
  const $ = cheerio.load(html);
  const id = $('#player').attr('data-file-id');
  if (!id) return [];

  const r = await post(
    'https://www.burstcloud.co/file/play-request/',
    qs.stringify({ fileId: id }),
    {
      headers: {
        'X-Requested-With': 'XMLHttpRequest',
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    }
  );

  const cdn = r.data?.purchase?.cdnUrl;
  if (!cdn) return [];

  return [{ server: 'burstcloud', type: 'mp4', url: cdn }];
}

/* =========================
   JWPLAYER MP4
========================= */

async function exMP4(url) {
  const html = (await get(url)).data;
  const m = html.match(/file:\s*['"]([^'"]+\.mp4[^'"]*)/i);
  if (!m) return [];
  if (m[1].includes('novideo.mp4')) return [];
  return [{ server: 'jwplayer', type: 'mp4', url: m[1] }];
}

/* =========================
   ROUTER
========================= */

const map = {
  yourupload: exMP4,
  yu: exMP4,
  streamwish: exM3U8,
  sw: exM3U8,
  obeywish: exM3U8,
  swiftplayers: exM3U8,
  burstcloud: exBC,
  bc: exBC
};

const getEx = (n) => map[n.toLowerCase()];

/* ========================= */

module.exports = {
  extractAllVideoLinks: extractAll,
  getExtractor: getEx
};
