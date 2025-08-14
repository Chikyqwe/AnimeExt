// server.js
const express = require('express');
const axios = require('axios');

const app = express();
const port = 3000;

app.get('/', async (req, res) => {
  const url = req.query.url;

  if (!url) {
    return res.status(400).send('Debes pasar el parámetro url, ejemplo: /?url=https://example.com');
  }

  try {
    const response = await axios.get(url, {
      responseType: 'text',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Referer': url
      },
      validateStatus: () => true // <-- Esto permite obtener siempre la respuesta, incluso 403
    });

    res.set('Content-Type', 'text/html');
    res.status(response.status).send(response.data);
  } catch (error) {
    res.status(500).send('Error al obtener la página: ' + error.message);
  }
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
