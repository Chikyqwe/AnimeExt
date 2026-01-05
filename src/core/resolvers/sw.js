  const { axiosGet } = require('../helpersCore');
const { unpack, detect } = require('unpacker');
const { URL } = require('url');

// ---------- getRedirectUrl----------
function best(master, base) {
  const lines = master.split('\n');
  let bestUrl = null;
  let bestScore = 0;

  for (let i = 0; i < lines.length; i++) {
    const m = /RESOLUTION=(\d+)x(\d+)/.exec(lines[i]);
    if (!m) continue;

    const next = lines[i + 1];
    if (!next || next.startsWith('#')) continue;

    const score = m[1] * m[2];
    if (score > bestScore) {
      bestScore = score;
      bestUrl = new URL(next, base).href;
    }
  }
  return bestUrl;
}

async function redir(pageUrl) {
  try {
    const dmca = ["hgplaycdn.com", "habetar.com", "yuguaab.com", "guxhag.com", "auvexiug.com", "xenolyzb.com"];
    const main = ["kravaxxa.com","davioad.com","haxloppd.com","tryzendm.com","dumbalag.com"];
    const rules = ["dhcplay.com","hglink.to","test.hglink.to","wish-redirect.aiavh.com"];

    const url = new URL(pageUrl);
    const destination = rules.includes(url.hostname)
      ? main[Math.floor(Math.random() * main.length)]
      : dmca[Math.floor(Math.random() * dmca.length)];

    const finalURL = "https://" + destination + url.pathname + url.search;
    return finalURL;
  } catch (error) {
    console.error('Error al generar redirectUrl:', error && error.message ? error.message : error);
    return pageUrl;
  }
}

// ---------- extractM3u8 (mejor manejo de JSDOM y limpieza) ----------
function rewriteM3U8(m3u8, playlistUrl, referer) {
  const result = m3u8
    .split('\n')
    .map(line => {
      const l = line.trim();

      if (!l || l.startsWith('#')) return line;

      let absoluteUrl;

      if (/^https?:\/\//i.test(l)) {
        absoluteUrl = l;
      } else {
        try {
          absoluteUrl = new URL(l, playlistUrl).href;
        } catch (e) {
          return line;
        }
      }

      return `https://animeext-m5lt.onrender.com/proxy/hls?url=${encodeURIComponent(
        absoluteUrl
      )}&ref=${encodeURIComponent(referer)}`;
    })
    .join('\n');

  return result;
}

async function extractM3u8(pageUrl) {
  const fail = () => ({ status: 701, mjs:'general error', server: 'sw' });

  try {
    const finalUrl = await redir(pageUrl);
    console.log(`[M3U8 EXTRACTOR] URL redirigida: ${finalUrl}`);

    const html = (await axiosGet(finalUrl,{
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': '*/*',
          'Referer': finalUrl
        }
    })).data;
    const scriptMatch = html.match(
      /<script[^>]*type=['"]text\/javascript['"][^>]*>\s*(eval\(function\(p,a,c,k,e,d\)[\s\S]*?)<\/script>/i
    );
    if (!scriptMatch) return fail();

    const packedJs = scriptMatch[1];
    if (!detect(packedJs)) return fail();

    const unpacked = unpack(packedJs);
    const linksMatch = unpacked.match(/var\s+links\s*=\s*(\{[\s\S]*?\});/i);
    if (!linksMatch) return fail();

    let links;
    try {
      links = JSON.parse(linksMatch[1]);
    } catch {
      return fail();
    }

    const link = links.hls4 || links.hls3 || links.hls1 || links.hls2;
    if (!link) return fail();
    const masterUrl = link.startsWith('/')
      ? new URL(link, finalUrl).href
      : link;
    const playlist = (
      await axiosGet(masterUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': '*/*',
          'Referer': finalUrl
        }
      })
    ).data;
    const base = masterUrl.slice(0, masterUrl.lastIndexOf('/') + 1);
    const bestUrl = best(playlist, base) || masterUrl;
    const bestPlaylistRaw = (
      await axiosGet(bestUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0',
          'Accept': '*/*',
          'Referer': finalUrl
        }
      })
    ).data;
    const bestPlaylist = rewriteM3U8(bestPlaylistRaw, bestUrl, finalUrl);
    console.log(`[M3U8 EXTRACTOR] Mejor URL seleccionada: ${bestUrl}`);
    return {
      status: 200,
      url: finalUrl,
      content: bestPlaylist
    };

  } catch (err) {
    console.error('[M3U8 EXTRACTOR] Error:', err.message);
    return { status: 701, mjs: err.message, server: 'sw' };
  }
}

module.exports = { extractM3u8 };
