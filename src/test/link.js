const { extractAllVideoLinks } = require('../services/browserlessExtractors');
const { getAnimeById, buildEpisodeUrl } = require('../services/jsonService');
const readline = require('readline');

async function getVideoLinks(animeId, episode, mirror = 1) {
    const anime = getAnimeById(animeId);
    if (!anime) throw new Error('Anime no encontrado');

    const pageUrl = buildEpisodeUrl(anime, episode, mirror);
    if (!pageUrl) throw new Error('URL de episodio no válida');

    const videos = await extractAllVideoLinks(pageUrl);
    return videos;
}

function askQuestion(query) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(query, answer => {
        rl.close();
        resolve(answer);
    }));
}

async function main() {
    // Extraer args (ignorar node y script.js)
    const args = process.argv.slice(2);

    let animeId = args[0];
    let episode = args[1];
    let mirror = args[2] ? parseInt(args[2], 10) : undefined;

    // Si no tiene animeId, pregunta
    if (!animeId) animeId = await askQuestion('Ingrese el ID del anime: ');
    if (!episode) episode = await askQuestion('Ingrese el episodio: ');

    // Validar mirror, si no existe o es inválido, preguntar
    if (![1, 2, 3].includes(mirror)) {
        const mirrorInput = await askQuestion('Ingrese el mirror (1, 2 o 3): ');
        mirror = parseInt(mirrorInput, 10);
        if (![1, 2, 3].includes(mirror)) {
            console.error('Mirror inválido. Debe ser 1, 2 o 3.');
            process.exit(1);
        }
    }

    try {
        const videos = await getVideoLinks(animeId, episode, mirror);
        console.log(`Enlaces de video para el anime ID ${animeId}, episodio ${episode}, mirror ${mirror}:`);
        console.log(videos);
    } catch (error) {
        console.error('Error al obtener los enlaces de video:', error.message);
    }
}

main();
