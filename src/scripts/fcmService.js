const path = require('path');
const { parentPort } = require('worker_threads');
const pLimit = require('p-limit').default;

const { getAllUsers, addAnimeUIDs } =
  require(path.join(__dirname, '../services/postgresqlbaseService'));
const { getEpisodes } =
  require(path.join(__dirname, '../utils/helpers'));
const { getAnimeByUnitId } =
  require(path.join(__dirname, '../services/jsonService'));
const { sendNotification } =
  require(path.join(__dirname, '../services/fcmServicesNotification'));

const limitAnime = pLimit(5);
const limitSource = pLimit(3);

const log = (msg) => parentPort?.postMessage({ type: 'log', msg });

async function checkUserEpisodes() {
  const users = await getAllUsers();

  for (const user of users) {
    const animeUIDs = Object.keys(user.anime_uids || {});

    await Promise.all(animeUIDs.map(animeId =>
      limitAnime(async () => {
        try {
          const animeData = await getAnimeByUnitId(animeId);
          if (!animeData) return;

          const sources = ['FLV', 'TIO', 'ANIMEYTX']
            .filter(s => animeData.sources?.[s]);

          const results = await Promise.all(
            sources.map(src =>
              limitSource(async () => {
                try {
                  const epData = await getEpisodes(animeData.sources[src]);
                  return { src, epData };
                } catch {
                  return { src, epData: { episodes_count: 0 } };
                }
              })
            )
          );

          const best = results.reduce(
            (a, b) => b.epData.episodes_count > a.epData.episodes_count ? b : a,
            { epData: { episodes_count: 0 } }
          );

          const lastSeen = user.anime_uids[animeId] || 0;
          const total = best.epData.episodes_count;

          if (total > lastSeen && user.token) {
            await sendNotification(user.token, {
              title: animeData.title,
              body: `Episodio ${total} ya disponible`,
              image: animeData.image || '',
              uid: animeData.unit_id
            });

            await addAnimeUIDs(user.uuid, { [animeId]: total });
          }

        } catch (e) {
          log(`Error anime ${animeId} user ${user.uuid}: ${e.message}`);
        }
      })
    ));
  }
}

(async () => {
  try {
    log('Revisión de episodios iniciada');
    await checkUserEpisodes();

    if (global.gc) global.gc(); // opcional

    log('Revisión finalizada');
    process.exit(0); // 🔥 CLAVE
  } catch (e) {
    log(`Error fatal: ${e.message}`);
    process.exit(1);
  }
})();
