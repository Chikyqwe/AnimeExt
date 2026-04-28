const { axiosGet } = require('../helpersCore');

module.exports = async function mp4(pageUrl) {
    try {
        const { data: html } = await axiosGet(pageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
            },
            timeout: 10000
        });
        // Busca en formato sources: ["url.mp4"]
        // Formato Clappr: sources: ["url.mp4"]
        let match = html.match(/sources:\s*\[\s*["']([^"']+\.mp4[^"']*)["']/i);

        // Formato Video.js: src: "url.mp4"
        if (!match) {
            match = html.match(/src:\s*["']([^"']+\.mp4[^"']*)["']/i);
        }

        if (match && match[1]) {
            const videoUrl = match[1];
            if (videoUrl.toLowerCase().includes('novideo.mp4')) {
                return { status: 707, mjs: 'Video No encontrado', server: 'mp4' };
            }
            return { url: videoUrl };
        }

        throw new Error('No se encontró URL del archivo MP4');
    } catch (err) {
        console.error('[mp4] Error:', err && err.message ? err.message : err);
        return { status: 707, mjs: err.message, server: 'mp4' };
    }
}

