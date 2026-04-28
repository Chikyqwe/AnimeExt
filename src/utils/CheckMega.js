const axios = require('axios');

function interpretarErrorCodigo(data) {
  const e = (typeof data === 'object' && data !== null && 'e' in data) ? data.e : data;
  switch (e) {
    case -6: return 'Clave incorrecta o archivo movido';
    case -9: return 'Archivo eliminado o no disponible';
    case -11: return 'Clave incompleta o inválida';
    default: return `Error desconocido (${e})`;
  }
}

async function verificarArchivoMega(id, key) {
  const url = 'https://g.api.mega.co.nz/cs?id=1';
  const payload = [{ a: 'g', g: 1, p: id, n: key }];

  try {
    const res = await axios.post(url, payload);
    const data = res.data[0];

    if (data && typeof data === 'object' && data.g) {
      return { disponible: true, link: data.g };
    } else if (typeof data === 'object' && data !== null && 'e' in data) {
      return { disponible: false, motivo: interpretarErrorCodigo(data), detalle: data };
    } else if (typeof data === 'number') {
      return { disponible: false, motivo: interpretarErrorCodigo(data), detalle: data };
    } else {
      return { disponible: false, motivo: 'Respuesta desconocida', detalle: data };
    }
  } catch (err) {
    return { disponible: false, motivo: 'Error conexión API', detalle: err.message };
  }
}

function parseMegaUrl(url) {
  const regexes = [
    /mega\.nz\/(?:file|embed)\/([^#]+)#(.+)/,                      // Formato nuevo
    /mega\.nz\/#!([a-zA-Z0-9\-_]+)!([a-zA-Z0-9\-_]+)/              // Formato antiguo
  ];

  for (const regex of regexes) {
    const match = url.match(regex);
    if (match) {
      return { id: match[1], key: match[2] };
    }
  }

  throw new Error('URL MEGA inválida o no soportada');
}


async function verificarLinksMega(links) {
  for (const url of links) {
    console.log(`\n[INFO] Verificando: ${url}`);
    try {
      const { id, key } = parseMegaUrl(url);
      const resultado = await verificarArchivoMega(id, key);

      if (resultado.disponible) {
        console.log('[SUCCESS] Archivo disponible.');
      } else {
        console.log(`[FAIL] No disponible: ${resultado.motivo}`);
        if (resultado.detalle) console.log('Detalles:', resultado.detalle);
      }
    } catch (e) {
      console.log(`[FAIL] URL inválida: ${e.message}`);
    }
  }
}

// Exportamos las funciones para que puedan usarse desde otro módulo
module.exports = {
  interpretarErrorCodigo,
  verificarArchivoMega,
  parseMegaUrl,
  verificarLinksMega
};
