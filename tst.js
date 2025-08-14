const axios = require('axios');

(async () => {
  try {
    const url = 'https://yuguaab.com/e/o5p5ntjbz0l9';
    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'es-ES,es;q=0.9',
      }
    });

    // Regex para capturar el valor de 'link' dentro del script
    const match = html.match(/pickDirect\s*\([^,]+,\s*'([^']+)'\s*\)/);

    if (match && match[1]) {
      console.log('Link encontrado:', match[1]);
    } else {
      console.log('No se encontró el link en el HTML');
    }

  } catch (err) {
    console.error('Error al obtener el link:', err.message);
  }
})();
