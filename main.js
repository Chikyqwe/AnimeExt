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
    const response = await axios.get(url, { responseType: 'text' });
    res.set('Content-Type', 'text/html');
    res.send(response.data);
  } catch (error) {
    res.status(500).send('Error al obtener la página: ' + error.message);
  }
});

app.listen(port, () => {
  console.log(`Servidor corriendo en http://localhost:${port}`);
});
