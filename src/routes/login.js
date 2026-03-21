const { sendCaptcha, signup, login } = require('../controllers/loginController');
const router = require('express').Router();

router.post('/api/auth/captcha', sendCaptcha);
router.post('/api/auth/signup', signup);
router.post('/api/auth/login', login);

module.exports = router;