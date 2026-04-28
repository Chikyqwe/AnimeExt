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

            const gid = Buffer.from(absoluteUrl).toString('base64url');
            const f = Buffer.from(referer).toString('base64url');
            return `https://animeext-m5lt.onrender.com/api/hls?gid=${gid}&f=${f}&Did=1`;
        })
        .join('\n');

    return result;
}
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
async function jk(url) {
    try {
        const html = (await axiosGet(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': url
            }
        })).data;
        // 1. sacar m3u8 directo del player
        const m = html.match(/hls\.loadSource\(['"]([^'"]+\.m3u8[^'"]*)['"]\)/i);
        if (!m) return { status: 701, mjs: 'no m3u8', server: 'jkum' };

        const m3u8 = m[1];

        // 2. pedir master
        const master = (await axiosGet(m3u8, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': url
            }
        })).data;

        const base = m3u8.slice(0, m3u8.lastIndexOf('/') + 1);
        const bestUrl = best(master, base) || m3u8;

        // 3. pedir mejor calidad
        const raw = (await axiosGet(bestUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0',
                'Referer': url
            }
        })).data;

        // 4. reescribir
        const content = rewriteM3U8(raw, bestUrl, url);

        return {
            status: 200,
            url: url,
            content
        };

    } catch (err) {
        return { status: 701, mjs: err.message, server: 'jkum' };
    }
}