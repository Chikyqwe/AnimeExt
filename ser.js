const express = require('express');
const axios = require('axios');
const app = express();
const PORT = 3000;

// Para procesar datos del formulario
app.use(express.urlencoded({ extended: true }));

// Formulario inicial
app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>Fetch desde servidor</title>
        <style>
          body { font-family: sans-serif; padding: 20px; background: #f9f9f9; }
          form { margin-bottom: 20px; }
          input[type="text"] { width: 400px; padding: 8px; }
          button { padding: 8px 12px; }
          pre {
            background: #333;
            color: #0f0;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
          }
        </style>
      </head>
      <body>
        <h1>Introduce una URL para hacer GET</h1>
        <form method="POST" action="/fetch">
          <input type="text" name="url" placeholder="https://api.ejemplo.com/datos" required />
          <button type="submit">Consultar</button>
        </form>
      </body>
    </html>
  `);
});

// Procesa la URL y muestra el resultado
app.post('/fetch', async (req, res) => {
  const url = req.body.url;
  try {
    const response = await axios.get(url);
    const data = JSON.stringify(response.data, null, 2); // Formateado

    res.send(`
      <html>
        <head>
          <title>Resultado de ${url}</title>
          <style>
            body { font-family: sans-serif; padding: 20px; background: #f9f9f9; }
            pre {
              background: #333;
              color: #0f0;
              padding: 15px;
              border-radius: 5px;
              overflow-x: auto;
              white-space: pre-wrap;
            }
            a { display: inline-block; margin-top: 20px; text-decoration: none; color: #007BFF; }
          </style>
        </head>
        <body>
          <h2>Respuesta de: <code>${url}</code></h2>
          <pre>${data}</pre>
          <a href="/">← Volver</a>
        </body>
      </html>
    `);
  } catch (err) {
    res.send(`
      <html>
        <head>
          <title>Error</title>
        </head>
        <body>
          <h2>Error al consultar: ${url}</h2>
          <pre>${err.message}</pre>
          <a href="/">← Volver</a>
        </body>
      </html>
    `);
  }
});

app.listen(PORT, () => {
  console.log(`Servidor en http://localhost:${PORT}`);
});
