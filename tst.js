// Instala las dependencias si no las tienes:
// npm install axios cli-progress

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const cliProgress = require('cli-progress');

const urlEncoded = "https%3A%2F%2Fcdn.burstcloud.co%2Fa20250813yRh85r15CLE%2FTakopii-01.AnimeYT.es.mp4";
const videoUrl = decodeURIComponent(urlEncoded);

const outputFile = path.resolve(__dirname, 'Takopii-01.mp4');

// Crear la barra de progreso
const progressBar = new cliProgress.SingleBar({
  format: 'Descargando [{bar}] {percentage}% | {value}/{total} MB',
  barCompleteChar: '#',
  barIncompleteChar: '-',
  hideCursor: true
});

axios({
  method: 'get',
  url: videoUrl,
  responseType: 'stream',
  headers: {
    'Referer': 'https://burstcloud.co/',
    'Origin': 'https://burstcloud.co/'
  }
})
.then(response => {
  const totalLength = parseInt(response.headers['content-length']);
  let downloaded = 0;

  progressBar.start((totalLength / 1024 / 1024).toFixed(2), 0);

  const writer = fs.createWriteStream(outputFile);
  response.data.on('data', chunk => {
    downloaded += chunk.length;
    progressBar.update((downloaded / 1024 / 1024).toFixed(2));
  });

  response.data.pipe(writer);

  writer.on('finish', () => {
    progressBar.stop();
    console.log('Descarga completada:', outputFile);
  });

  writer.on('error', err => {
    progressBar.stop();
    console.error('Error al escribir archivo:', err);
  });
})
.catch(err => console.error('Error en la descarga:', err));
