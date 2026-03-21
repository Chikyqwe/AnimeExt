const path = require('path');
const { parentPort } = require('worker_threads');
const pLimit = require('p-limit').default;

const { supabase } = require(path.join(__dirname, '../services/supabase/supabase'));
const SupaInterface = require(path.join(__dirname, '../services/supabase/supabaseInt'));
const supa = new SupaInterface(supabase);

const { getEpisodes } =
  require(path.join(__dirname, '../utils/helpers'));
const { getAnimeByUnitId } =
  require(path.join(__dirname, '../services/jsonService'));
const { sendNotification } =
  require(path.join(__dirname, '../services/fcmServicesNotification'));

const limitAnime  = pLimit(5);
const limitSource = pLimit(3);

const log = (msg) => parentPort?.postMessage({ type: 'log', msg });

// ─── Reemplaza getAllUsers (antes PostgreSQL) ─────────────────────────────────
async function getAllUsers() {
  const users = await supa.get.users();
  // Solo usuarios que tienen token FCM y al menos un anime suscrito
  return users.filter(u => u.token && u.anime_uids && Object.keys(u.anime_uids).length > 0);
}

// ─── Reemplaza addAnimeUIDs (antes PostgreSQL) ────────────────────────────────
async function updateAnimeUID(userId, animeId, episodeCount) {
  const user = await supa.get.users.anime_uids(userId);
  const current = user || {};
  const updated = { ...current, [animeId]: episodeCount };
  await supa.write.users.anime_uids(userId, updated);
}

// ─── Worker principal ─────────────────────────────────────────────────────────
async function checkUserEpisodes() {
  const users = await getAllUsers();
  log(`Usuarios a revisar: ${users.length}`);

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
          const total    = best.epData.episodes_count;

          if (total > lastSeen && user.token) {
            await sendNotification(user.token, {
              title: animeData.title,
              body:  `Episodio ${total} ya disponible`,
              image: animeData.image || '',
              uid:   animeData.unit_id
            });

            // Actualiza el contador en Supabase
            await updateAnimeUID(user.id, animeId, total);
            log(`[OK] ${animeData.title} → ep ${total} notificado a ${user.uuid}`);
          }

        } catch (e) {
          log(`[ERR] anime ${animeId} user ${user.uuid}: ${e.message}`);
        }
      })
    ));
  }
}

// ─── Entry point ──────────────────────────────────────────────────────────────
(async () => {
  try {
    log('Revisión de episodios iniciada');
    await checkUserEpisodes();
    if (global.gc) global.gc();
    log('Revisión finalizada');
    process.exit(0);
  } catch (e) {
    log(`Error fatal: ${e.message}`);
    process.exit(1);
  }
})();