const { supabase } = require('../services/supabase/supabase');
const SupaInterface = require('../services/supabase/supabaseInt');
const supa = new SupaInterface(supabase);
const { sendNotification } = require('../services/fcmServicesNotification');
const crypto = require('crypto');

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getUserByToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.replace('Bearer ', '').trim();
  const results = await supa.search.users.token(token);
  return results && results.length > 0 ? results[0] : null;
}

// ─── Registrar / actualizar FCM token del dispositivo ───────────────────────

async function registerFcmToken(req, res) {
  try {
    const user = await getUserByToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: 'No autorizado.' });

    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ error: 'fcmToken requerido.' });

    await supa.write.users.token(user.id, fcmToken);

    return res.json({ message: 'Token FCM registrado correctamente.' });
  } catch (err) {
    console.error('[registerFcmToken]', err);
    return res.status(500).json({ error: 'Error interno.' });
  }
}

// ─── Enviar notificación a un usuario específico (admin / sistema) ───────────

async function sendToUser(req, res) {
  try {
    const { uuid, title, body, image } = req.body;
    if (!uuid || !title || !body) {
      return res.status(400).json({ error: 'uuid, title y body son requeridos.' });
    }

    const results = await supa.search.users.uuid(uuid);
    if (!results || results.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado.' });
    }

    const user = results[0];
    if (!user.token) {
      return res.status(400).json({ error: 'El usuario no tiene token FCM registrado.' });
    }

    await sendNotification(user.token, { title, body, image, uid: user.uuid });

    return res.json({ message: 'Notificación enviada.' });
  } catch (err) {
    console.error('[sendToUser]', err);
    return res.status(500).json({ error: 'Error interno.' });
  }
}

// ─── Suscribir / desuscribir anime para notificaciones ──────────────────────

async function subscribeAnime(req, res) {
  try {
    const user = await getUserByToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: 'No autorizado.' });

    const { animeId } = req.body;
    if (!animeId) return res.status(400).json({ error: 'animeId requerido.' });

    const currentUids = user.subscriptions || {};
    if (currentUids[animeId] !== undefined) {
      return res.status(409).json({ error: 'Ya estás suscrito a ese anime.' });
    }

    const updatedUids = { ...currentUids, [animeId]: 0 };
    await supa.write.users.subscriptions(user.id, updatedUids);

    return res.json({ message: `Suscrito a anime ${animeId}.`, subscriptions: updatedUids });
  } catch (err) {
    console.error('[subscribeAnime]', err);
    return res.status(500).json({ error: 'Error interno.' });
  }
}

async function unsubscribeAnime(req, res) {
  try {
    const user = await getUserByToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: 'No autorizado.' });

    const { animeId } = req.body;
    if (!animeId) return res.status(400).json({ error: 'animeId requerido.' });

    const currentUids = user.subscriptions || {};
    if (currentUids[animeId] === undefined) {
      return res.status(404).json({ error: 'No estás suscrito a ese anime.' });
    }

    delete currentUids[animeId];
    await supa.write.users.subscriptions(user.id, currentUids);

    return res.json({ message: `Desuscrito de anime ${animeId}.`, subscriptions: currentUids });
  } catch (err) {
    console.error('[unsubscribeAnime]', err);
    return res.status(500).json({ error: 'Error interno.' });
  }
}

// ─── Obtener lista de animes suscritos ───────────────────────────────────────

async function getSubscriptions(req, res) {
  try {
    const user = await getUserByToken(req.headers.authorization);
    if (!user) return res.status(401).json({ error: 'No autorizado.' });

    return res.json({ subscriptions: user.subscriptions || {} });
  } catch (err) {
    console.error('[getSubscriptions]', err);
    return res.status(500).json({ error: 'Error interno.' });
  }
}

module.exports = {
  registerFcmToken,
  sendToUser,
  subscribeAnime,
  unsubscribeAnime,
  getSubscriptions
};