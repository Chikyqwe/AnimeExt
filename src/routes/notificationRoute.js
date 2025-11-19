const { getUUID, registeranime, getanimes, getUsers } = require('../controllers/notificationController');

const express = require('express');
const router = express.Router();

router.post('/notification/getUUID', getUUID);
router.post('/notification/subscribe', registeranime);
router.post('/notification/subscriptions', getanimes);
router.post('/notification/anulatedSub', anulNot);

module.exports = router;
