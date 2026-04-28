const { axiosGet } = require('../helpersCore')
const qs = require('qs');
const cheerio = require('cheerio');

module.exports = async function burstcloudExtractor(pageUrl) {
  console.log(`[BURSTCLOUD] Extrayendo video desde: ${pageUrl}`);
  try {
    const { data: html } = await withRetries(() =>
      axiosGet(pageUrl, {
        headers: { 'User-Agent': UA_FIREFOX },
        timeout: 8000
      })
    );

    const $ = cheerio.load(html);
    const fileId = $('#player').attr('data-file-id');
    if (!fileId) throw new Error('No se encontró el data-file-id');

    const postData = qs.stringify({ fileId });
    const postResponse = await axiosPost(
      'https://www.burstcloud.co/file/play-request/',
      postData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'Origin': 'https://www.burstcloud.co',
          'Referer': pageUrl,
          'X-Requested-With': 'XMLHttpRequest'
        },
        timeout: 8000
      }
    );

    const cdnUrl = postResponse.data?.purchase?.cdnUrl;
    if (!cdnUrl) throw new Error('No se encontró cdnUrl en la respuesta');

    console.log(`[BURSTCLOUD] CDN URL encontrada: ${cdnUrl}`);
    return { url: cdnUrl };
  } catch (err) {
    console.error('[BURSTCLOUD] Error:', err && err.message ? err.message : err);
    return { status: 710,mjs: err.message, server: 'bc'};
  }
}
