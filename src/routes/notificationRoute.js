const {
  registerFcmToken,
  sendToUser,
  subscribeAnime,
  unsubscribeAnime,
  getSubscriptions
} = require('../controllers/notificationController');

const router = require('express').Router();

// Registrar token FCM del dispositivo (requiere Bearer token)
router.post('/api/notifications/register', registerFcmToken);

// Suscripciones de anime (requiere Bearer token)
router.get('/api/notifications/subscriptions', getSubscriptions);
router.post('/api/notifications/subscribe', subscribeAnime);
router.delete('/api/notifications/unsubscribe', unsubscribeAnime);

// Enviar notificación a usuario por UUID (uso interno / admin)
router.post('/api/notifications/send', sendToUser);

module.exports = router;