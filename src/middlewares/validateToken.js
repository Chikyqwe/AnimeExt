// src/middlewares/validateToken.js
const { buildComplexToken } = require('../utils/token');

module.exports = (req, res, next) => {
  const clientToken = req.headers['x-auth-token'];
  const key1 = req.cookies?._K0x1FLVTA0xAA1;
  const key2 = req.cookies?._K0x2FLVTA0xFF2;

  if (!clientToken || !key1 || !key2) {
    return res.status(401).json({ error: 'Faltan claves o token' });
  }

  const expectedToken = buildComplexToken(key1, key2);
  if (clientToken !== expectedToken) {
    return res.status(403).json({ error: 'Token inválido' });
  }

  next();
};
