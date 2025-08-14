var readline = require("readline");
console.log('[INFO] Iniciando AnimeExt...');
// Verificar existencia de package.json
var packagePath = path.join(__dirname, 'package.json');
if (!fs.existsSync(packagePath)) {
    console.error('[ERROR] No se encontró package.json en el directorio actual.');
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
