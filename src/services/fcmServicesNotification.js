// fcmService.js
const admin = require('firebase-admin');
const path = require('path');

// Cargar credenciales de Firebase
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

/**
 * Envía una notificación push a un token específico
 * @param {string} token - Token del dispositivo destino
 * @param {object} options - Opciones de la notificación
 * @param {string} options.title - Título de la notificación
 * @param {string} options.body - Texto de la notificación
 * @param {string} [options.image] - URL de imagen (opcional)
 * @returns {Promise<string>} - Respuesta de Firebase
 */
async function sendNotification(token, { title, body, image, uid = 'default' }) {
  const message = {
    token,
    notification: {
      title,
      body,
      image
    },
    android: {
      priority: 'high',
      notification: {
        icon: 'ic_launcher', // nombre del recurso sin extensión
        color: '#333333',
        channelId: 'default_channel'
      }
    },
    data: {
      uid: String(uid),
      status: 'done'
    }
  };

  try {
    const response = await admin.messaging().send(message);
    console.log('[NOTI] Notificación enviada correctamente:', response);
    return response;
  } catch (error) {
    console.error('[NOTI] Error enviando notificación:', error);
    throw error;
  }
}

module.exports = { sendNotification };
