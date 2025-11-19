// episodeWorker.js
const path = require('path');
const { parentPort } = require('worker_threads');

const { getAllUsers, addAnimeUIDs } = require(path.join(__dirname, '../services/postgresqlbaseService'));
const { getEpisodes } = require(path.join(__dirname, '../utils/helpers'));
const { getAnimeByUnitId } = require(path.join(__dirname, '../services/jsonService'));
const { sendNotification } = require(path.join(__dirname, '../services/fcmServicesNotification'));

const pLimit = require('p-limit').default;
const limitAnime = pLimit(5); // máximo 5 promesas de anime simultáneas
const limitSource = pLimit(3); // máximo 3 promesas de fuente por anime

async function checkUserEpisodes() {
    try {
        const users = await getAllUsers();

        for (const user of users) {
            const animeUIDs = Object.keys(user.anime_uids);

            await Promise.all(animeUIDs.map(animeId => limitAnime(async () => {
                try {
                    const animeData = await getAnimeByUnitId(animeId);
                    if (!animeData) return;

                    const sources = ['FLV', 'TIO', 'ANIMEYTX'].filter(src => animeData.sources?.[src]);
                    const results = await Promise.all(sources.map(src => limitSource(async () => {
                        try {
                            const epData = await getEpisodes(animeData.sources[src]);
                            return { src, epData };
                        } catch {
                            return { src, epData: { episodes_count: 0, episodes: [] } };
                        }
                    })));

                    const bestSource = results.reduce((max, curr) =>
                        curr.epData.episodes_count > max.epData.episodes_count ? curr : max,
                        { src: null, epData: { episodes_count: 0, episodes: [] } }
                    );

                    if (!bestSource.src) return;

                    const lastSeenEpisode = user.anime_uids[animeId];
                    const totalEpisodes = bestSource.epData.episodes_count;

                    if (totalEpisodes > lastSeenEpisode && user.token) {
                        await sendNotification(user.token, {
                            title: animeData.title,
                            body: `Episodio ${totalEpisodes} ya disponible!`,
                            image: animeData.image || '',
                            uid: animeData.unit_id
                        });
                        // Actualizar episodio visto
                        await addAnimeUIDs(user.uuid, {
                            [animeId]: totalEpisodes
                        });
                    }

                } catch (e) {
                    console.warn(`[FCMService] Error revisando anime ${animeId} de usuario ${user.uuid}:`, e.message);
                }
            })));
        }

        // Forzar GC si Node lo permite (ejecutar con node --expose-gc)
        if (global.gc) global.gc();

    } catch (error) {
        console.error('[FCMService] Error revisando episodios:', error);
    }
}

// Recursivo en vez de setInterval
async function loop() {
    console.log(`[Worker] Revisando episodios... ${new Date().toISOString()}`);
    await checkUserEpisodes();
    setTimeout(loop, 15 * 60 * 1000); // 15 minutos
}

// Ejecutar al inicio
loop();
