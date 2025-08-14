const express = require('express');
const axios = require('axios');

const app = express();
const port = 2021;

app.get('/', async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).send('Parámetro "url" requerido');

  try {
    // Axios con timeout, headers y sin fallar por status >= 400
    const response = await axios.get(url, {
      timeout: 3000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PHP Fetcher/1.0)'
      },
      validateStatus: () => true, // equivale a ignore_errors
      httpsAgent: new (require('https').Agent)({ rejectUnauthorized: false }) // ignora SSL
    });

    res.set('Content-Type', 'text/html; charset=UTF-8');
    res.status(response.status).send(response.data);
  } catch (e) {
    res.status(500).send('No se pudo obtener la página o tardó demasiado');
  }
});

app.listen(port, () => console.log(`Servidor corriendo en http://localhost:${port}`));
