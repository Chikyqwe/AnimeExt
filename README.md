<p align="center">
  <img src="./public/img/logo.svg" alt="AnimeEXT Logo" width="900" />
</p>

![Node.js >=22](https://img.shields.io/badge/Node.js-%3E%3D22-blue)
![Npm >=10](https://img.shields.io/badge/Npm-%3E%3D10-red)
![Licencia](https://img.shields.io/github/license/Chikyqwe/AnimeExt?color=yellow)

AnimeExt es un servidor web diseñado para la visualización de anime mediante streaming directo desde fuentes públicas. El sistema automatiza la obtención de enlaces , integra una lógica personalizada de reproducción y ofrece vistas organizadas para facilitar su uso.

Funcionalidades
===============

- Reproducción embebida de anime desde enlaces `.m3u8`, y `.mp4`
- Automatización de scraping con browserless
- Modo mantenimiento activable desde vistas internas
- Gestión dinámica de archivos JSON por catálogo
- Carga segura de imágenes externas mediante proxy
- Estructura modular orientada a estabilidad y escalabilidad

Instalación
===========

1. Instala las dependencias:

   ```bash
   npm install
   ```

2. Inicia el servidor:

   ```bash
   npm start
   ```

3. Abre el navegador en:

   ```
   http://localhost:2015
   ```

Uso básico
==========

- Accede al home `/` para explorar las vistas disponibles.
- Consulta `/api/servers` para obtener la lista de servidores de una url.
- Use `/api?url=` para obtener los enlaces a videos.
- Usa `/proxy-image?url=` para mostrar imágenes sin exponer dominios externos.
- Supervisa la cola de scraping desde `/queue-status`.
- Use `/status` para obtener informacion del status.

Consideraciones
===============

- Este proyecto no almacena ni redistribuye contenido multimedia.
- Todos los enlaces de reproducción son obtenidos en tiempo real desde fuentes públicas mediante navegación automatizada.
- AnimeExt está diseñado únicamente con fines educativos, de prueba o desarrollo personal.
- El uso de este software para propósitos comerciales o de redistribución puede violar los términos de uso de terceros.
- AnimeExt no esta monetizado, ni contiene anuncios por si mismo, reproductores de terceros , pueden contener anuncios y/o rastreadores.

Estructura del proyecto
=======================
# 📂 Estructura del proyecto: `AnimeExt`

- 📄 [.gitignore](.gitignore)
- 📄 [anim.js](anim.js)
- 📄 [eafo.js](eafo.js)
- 📄 [LICENSE](LICENSE)
- 📄 [main.js](main.js)
- 📄 [package-lock.json](package-lock.json)
- 📄 [package.json](package.json)
- 📄 [README.md](README.md)
- 📄 [worker-mantenimiento.js](worker-mantenimiento.js)
- 📁 [jsons](jsons/)
  - 📄 [anime_list.json](jsons/anime_list.json)
  - 📄 [report_error.json](jsons/report_error.json)
  - 📄 [UnitID.json](jsons/UnitID.json)
- 📁 [public](public/)
  - 📄 [404.html](public/404.html)
  - 📄 [iframe.html](public/iframe.html)
  - 📄 [index.html](public/index.html)
  - 📄 [list.html](public/list.html)
  - 📄 [maintenance.html](public/maintenance.html)
  - 📄 [pass.html](public/pass.html)
  - 📄 [player.html](public/player.html)
  - 📄 [privacy-policy.html](public/privacy-policy.html)
  - 📁 [img](public/img/)
    - 📄 [404.png](public/img/404.png)
    - 📄 [favicon.png](public/img/favicon.png)
    - 📄 [logo.svg](public/img/logo.svg)
  - 📁 [static](public/static/)
    - 📄 [functions_index.js](public/static/functions_index.js)
    - 📄 [functions_player.js](public/static/functions_player.js)
    - 📄 [index.js](public/static/index.js)
    - 📄 [player.js](public/static/player.js)
    - 📄 [styles_404.css](public/static/styles_404.css)
    - 📄 [styles_index.css](public/static/styles_index.css)
    - 📄 [styles_player.css](public/static/styles_player.css)
- 📁 [src](src/)
  - 📄 [app.js](src/app.js)
  - 📄 [server.js](src/server.js)
  - 📁 [config](src/config/)
    - 📄 [index.js](src/config/index.js)
  - 📁 [middleware](src/middleware/)
    - 📄 [maintenanceBlock.js](src/middleware/maintenanceBlock.js)
  - 📁 [routes](src/routes/)
    - 📄 [api.js](src/routes/api.js)
    - 📄 [maintenance.js](src/routes/maintenance.js)
    - 📄 [player.js](src/routes/player.js)
    - 📄 [views.js](src/routes/views.js)
  - 📁 [services](src/services/)
    - 📄 [browserlessExtractors.js](src/services/browserlessExtractors.js)
    - 📄 [jsonService.js](src/services/jsonService.js)
    - 📄 [maintenanceService.js](src/services/maintenanceService.js)
    - 📄 [queueService.js](src/services/queueService.js)
  - 📁 [utils](src/utils/)
    - 📄 [CheckMega.js](src/utils/CheckMega.js)
    - 📄 [helpers.js](src/utils/helpers.js)
    - 📄 [wakeUp.js](src/utils/wakeUp.js)
- 📁 [test](test/)
  - 📄 [link.js](test/link.js)

Licencia
========

Este proyecto está licenciado bajo los términos de la Licencia MIT.  
Consulta el archivo `LICENSE` para más información.

Autoría
=======

Desarrollado por **Chikiyinyang@dev**
<!-- Anime, streaming, Node.js, m3u8, browserless, scraper, reproductor -->