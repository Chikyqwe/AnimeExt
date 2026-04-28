const { axiosGet } = require('../helpersCore');

module.exports = async function getJWPlayerFile(pageUrl) {
  try {
    const { data: html } = await axiosGet(pageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'
      },
      timeout: 10000
    });

    const match = html.match(/file:\s*['"]([^'"]+\.mp4[^'"]*)['"]/i);

    if (match && match[1]) {
      const videoUrl = match[1];
      if (videoUrl.toLowerCase().includes('novideo.mp4')) {
        return  { status: 708, mjs: 'Video No encontrado',server: 'yu' };
      }
      return { url: videoUrl };
    }

    throw new Error('No se encontró URL del archivo MP4');
  } catch (err) {
    console.error('[getJWPlayerFile] Error:', err && err.message ? err.message : err);
    return  { status: 702, mjs: err.message, server:'yu' };
  }
}

