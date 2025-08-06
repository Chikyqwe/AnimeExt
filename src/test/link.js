// import browselessExtractor.js
const { extractAllVideoLinks } = require('../services/browserlessExtractors');
const { getAnimeById, buildEpisodeUrl } = require('../services/jsonService');
const readline = require('readline');

// Función para obtener los enlaces de video
async function getVideoLinks(animeId, episode) {
    const anime = getAnimeById(animeId);
    if (!anime) throw new Error('Anime no encontrado');

    const pageUrl = buildEpisodeUrl(anime, episode);
    if (!pageUrl) throw new Error('URL de episodio no válida');

    const videos = await extractAllVideoLinks(pageUrl);
    return videos;
}
// llamar a la función para obtener los enlaces de video
async function main() {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl.question('Ingrese el ID del anime: ', async (animeId) => {
        rl.question('Ingrese el episodio: ', async (episode) => {
            try {
                const videos = await getVideoLinks(animeId, episode);
                console.log(`Enlaces de video para el anime ID ${animeId}, episodio ${episode}:`);
                console.log(videos);
            } catch (error) {
                console.error('Error al obtener los enlaces de video:', error.message);
            } finally {
                rl.close();
            }
        });
    });
}
// Ejecutar la función principal
main();