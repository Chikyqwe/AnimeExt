# Documentación Oficial de AnimeExt

**AnimeExt** es un servidor y middleware robusto en Node.js, escrito meticulosamente para buscar, raspar, convertir y servir contenido multimedia de anime mediante REST API y servicios proxy automatizados. Este backend permite realizar un puente invisible y seguro entre clientes frontend y servidores distribuidores de streaming.

## 📁 1. Arquitectura del Proyecto

```text
/home/chiky/AnimeExt
├── main.js                 # Entrypoint y wrapper. Levanta el servidor, valida módulos y sobreescribe System Logs.
├── src/
│   ├── app.js              # Inicializa Express, WebSockets, CORS, y el Auto-Loader de Rutas.
│   ├── server.js           # Orquesta la conexión directa del http app.listen globalmente.
│   ├── config/             # Variables de entorno y ajustes duros del proxy y puertos.
│   ├── controllers/        # Controladores lógicos (videoController, animeController).
│   ├── core/
│   │   ├── cache/          # Sistema robusto de almacenamiento Key-Value (MemCache, TextStore FS, etc.).
│   │   ├── resolvers/      # Lógicas de bypass y desencriptado para servidores terceros (sw, voe, jkum).
│   ├── routes/             # Enrutamiento puro express (ej. api.js exportando endpoints).
│   ├── jobs/               # Tareas y Cron Jobs programados (Firebase messaging, checkers).
│   └── utils/              # Archivos de soporte y status.
└── tmp/data                # Archivos generados dinámicamente por la caché TextStore.
```

## 🔌 2. Referencia de API

A continuación verás en detalle los endpoints consumibles desde cualquier frontend.

### Rutas de Catálogo (`animeController.js`)
Endpoints para explorar el registro de AnimeExt.

* `GET /anime/list?p={page}`: Devuelve lista paginada del catálogo. Si envías `p=all`, descarga el JSON nativo pesado a través de buffer.
* `GET /anime/last`: Trae los últimos episodios que se agregaron al sistema.
* `POST /anime/search`: Recibe `{ "query": "string" }` y devuelve una lista filtrada.
* `GET /api/info?uid=XXXX`: Envía el `uid` para pedir toda la info (sinopsis, géneros, temporadas) y además, una lista estructurada de episodios de ese UID en específico.

### Rutas de Media (`videoController.js`)
Maneja toda la inteligencia de scrapping y provisión.

* **POST /api/play**: Realiza la recolección de los servidores reales para un episodio.
  > Requerimiento del cuerpo JSON: `{ uid: XXXX, ep: 1, m: "auto" }`. (el `m` determina el mirror; si va en "auto" usa el server primario). Devuelve un `MediaID` (`mid`) que vive expuesto sólo por 15 minutos.
* **GET /api/getMedia/:mid**: Una vez tienes el `mid`, la app le hace un GET a esta ruta. Automáticamente decide si es un MP4 que devolverá en texto plano JSON, o un HLS (lista M3U8) interceptado donde inyecta directamente nuestro Proxy interno.
* **GET /api/stream?gid=[hash]**: Se trata de un Proxy directo. En vez de soltar un `URL.mp4` al cliente, `/getMedia` delega aquí enviando un Hash. Internamente el backend desencripta el hash de Cache y hace el streaming proxy ocultando el origen del MP4 real.
* **GET /api/hls?gid=[base64url]&f=[base64url]**: Punto vital. Resuelve los pedacitos `.ts` de streaming, reensamblando M3U8. El `gid` y `f` mantienen cifrada en `base64url` el enlace y referer, por lo cual los "ojos ajenos" jamás verán peticiones yendo a `streamwish` sino que verán puras peticiones abstractas yendo a este mismo Endpoint seguro.

## 🧠 3. Sistema de Resolución y Scraping

La "Magia" de AnimeExt reside en los Resolvers de la capa de Core (`src/core/resolvers/`):
* **VOE (`voe.js`)**: Realiza ingeniería inversa sobre Ofuscación ROT13 asimétrica y arrays desplazados en reversa. Extrae del HTML inicial inyectado un string crudo y saca tanto un HLS en bruto como posibles MP4.
* **StreamWish (`sw.js`)**: Realiza auto-unpacking via expresión regular del archiconocido `p,a,c,k,e,d` provisto universalmente, recuperando el array en formato JSON y escogiendo internamente calidades según heurísticas.
* **JK (`jkum.js`)**: Lee embebedores directos interceptando los metacaracteres.

> En absolutamente todos los M3U8 procesados, se inyecta la función `rewriteM3U8`, la cual reemplazará todos los strings absolutos del archivo a una ruta protegida e ininteligible hacia nuestro propio Express para resguardar la identidad del host origen.

## 💾 4. Sistemas de Almacenamiento Caché

La aplicación administra su disco duro inteligentemente:
1. `MemCache` & `TextCache`: Los payloads pesados y urls directas M3U8 no consumen base de datos externa. Tienen un TTL por defecto de `15 Minutos`, evitando hacer más lentas las solicitudes concurrentes al extractor y evitando bloqueos de IPs (AntiBot) hacia la nube.
2. `Global Registry` (`cacheStorage.js`): Control de purgas periódicas mediante Cron para no apilar `.json` y sobreusar el HD de la máquina donde esté hosteada (e.g. Render).

## 📄 5. Main.js Wrap

`main.js` no hace simplemente de index. Secuestra `process.stdout.write` mediante su método nativo para **grabar asíncronamente absolutamente todo el tráfico de la consola** dentro del log estático central `animeext.log`. Maneja bloqueos y caídas en memoria segura interceptando los eventos `process.exit()` y `SIGINT`.
