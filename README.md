<p align="center">
  <img src="./public/img/logo.svg" alt="AnimeEXT Logo" width="900" />
</p>

![Node.js >=22](https://img.shields.io/badge/Node.js-%3E%3D22-blue)
![Npm >=10](https://img.shields.io/badge/Npm-%3E%3D10-red)
![Licencia](https://img.shields.io/github/license/Chikyqwe/AnimeExt?color=yellow)

AnimeExt es un servidor web diseñado para la visualización de anime mediante streaming directo desde fuentes públicas.

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
   http://localhost:{PORT}
   ```


Consideraciones
===============

- Este proyecto no almacena ni redistribuye contenido multimedia.
- Todos los enlaces de reproducción son obtenidos en tiempo real desde fuentes públicas mediante navegación automatizada.
- AnimeExt está diseñado únicamente con fines educativos, de prueba o desarrollo personal.
- El uso de este software para propósitos comerciales o de redistribución puede violar los términos de uso de terceros.
- AnimeExt no esta monetizado, ni contiene anuncios por si mismo, reproductores de terceros , pueden contener anuncios y/o rastreadores.

# 📂 Estructura del proyecto:

- 📄 [.env](.env)
- 📄 [.gitignore](.gitignore)
- 📄 [LICENSE](LICENSE)
- 📄 [main.js](main.js)
- 📄 [main.ts](main.ts)
- 📄 [package-lock.json](package-lock.json)
- 📄 [package.json](package.json)
- 📄 [README.md](README.md)
- 📁 [jsons](jsons/)
  - 📄 [anime_list.json](jsons/anime_list.json)
  - 📄 [lastep.json](jsons/lastep.json)
  - 📄 [report_error.json](jsons/report_error.json)
  - 📄 [UnitID.json](jsons/UnitID.json)
- 📁 [public](public/)
  - 📄 [404.html](public/404.html)
  - 📄 [index.html](public/index.html)
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
    - 📄 [infy.js](public/static/infy.js)
    - 📄 [player.js](public/static/player.js)
    - 📄 [styles_404.css](public/static/styles_404.css)
    - 📄 [styles_index.css](public/static/styles_index.css)
    - 📄 [styles_player.css](public/static/styles_player.css)
    - 📄 [styles.css](public/static/styles.css)
- 📁 [src](src/)
  - 📄 [app.js](src/app.js)
  - 📄 [server.js](src/server.js)
  - 📁 [config](src/config/)
    - 📄 [index.js](src/config/index.js)
  - 📁 [maintenimance](src/maintenimance/)
    - 📄 [anim_helper.js](src/maintenimance/anim_helper.js)
    - 📄 [anim.js](src/maintenimance/anim.js)
    - 📄 [lastep.js](src/maintenimance/lastep.js)
    - 📄 [worker-mantenimiento.js](src/maintenimance/worker-mantenimiento.js)
  - 📁 [middlewares](src/middlewares/)
    - 📄 [maintenanceBlock.js](src/middleware/maintenanceBlock.js)
  - 📁 [routes](src/routes/)
    - 📄 [api.js](src/routes/api.js)
    - 📄 [maintenance.js](src/routes/maintenance.js)
    - 📄 [player.js](src/routes/player.js)
    - 📄 [views.js](src/routes/views.js)
  - 📁 [services](src/services/)
    - 📄 [jsonService.js](src/services/jsonService.js)
    - 📄 [maintenanceService.js](src/services/maintenanceService.js)
  - 📁 [test](src/test/)
    - 📄 [CheckAnimeList.js](src/test/CheckAnimeList.js)
    - 📄 [link.js](src/test/link.js)
  - 📁 [utils](src/utils/)
    - 📄 [CheckMega.js](src/utils/CheckMega.js)
    - 📄 [helpers.js](src/utils/helpers.js)
    - 📄 [token.js](src/utils/token.js)
    - 📄 [wakeUp.js](src/utils/wakeUp.js)

Licencia
========

Este proyecto está licenciado bajo los términos de la Licencia MIT.  
Consulta el archivo `LICENSE` para más información.

Autoría
=======

Desarrollado por **Chikiqwe**
<!-- Anime, streaming, Node.js, m3u8, browserless, scraper, reproductor -->