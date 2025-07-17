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

```
├── AnimeExt
│   ├── .gitignore
│   ├── anim.js
│   ├── jsons
│   │   └── anime_list.json
│   ├── main.js
|   ├── README.md
|   ├── LICENSE
│   ├── package-lock.json
│   ├── package.json
│   ├── public
│   │   ├── 404.html
│   │   ├── error406.html
│   │   ├── iframe.html
│   │   ├── img
│   │   │   ├── 404.png
│   │   │   └── logo.png
│   │   ├── index.html
│   │   ├── maintenance.html
│   │   ├── player.html
│   │   ├── privacy-policy.html
│   │   └── static
│   │       ├── index.js
│   │       └── player.js
│   ├── src
│   │   ├── app.js
│   │   ├── config
│   │   │   └── index.js
│   │   ├── middleware
│   │   │   └── maintenanceBlock.js
│   │   ├── routes
│   │   │   ├── api.js
│   │   │   ├── maintenance.js
│   │   │   ├── player.js
│   │   │   └── views.js
│   │   ├── server.js
│   │   ├── services
│   │   │   ├── browserlessExtractors.js
│   │   │   ├── jsonService.js
│   │   │   ├── maintenanceService.js
│   │   │   └── queueService.js
│   │   └── utils
│   │       ├── CheckMega.js
|   |       ├── helpers.js
|   |       └── wakeUp.js
│   └── worker-mantenimiento.js

```

Licencia
========

Este proyecto está licenciado bajo los términos de la Licencia MIT.  
Consulta el archivo `LICENSE` para más información.

Autoría
=======

Desarrollado por **Chikiyinyang@dev**
<!-- Anime, streaming, Node.js, m3u8, browserless, scraper, reproductor -->
