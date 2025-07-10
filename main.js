// En tu servidor (Node.js con Express)
const express = require("express");
const app = express();

app.use(express.raw({ limit: '100mb', type: '*/*' })); // Aceptar datos grandes

app.post("/upload", (req, res) => {
  console.log(`Recibido bloque de ${req.body.length} bytes`);
  res.sendStatus(200);
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Servidor escuchando en /upload");
});
