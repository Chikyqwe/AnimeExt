const { getUUID, registeranime, getanimes, anulNot, getUsers } = require('../controllers/notificationController');

const express = require('express');
const router = express.Router();

router.post('/api/user/add/subscription', registeranime);
router.post('/api/user/get/subscription', getanimes);
router.post('/api/user/rm/subscription', anulNot);


module.exports = router;
