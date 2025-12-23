const { requestRegisterToken, confirmRegistration, login} = require('../controllers/loginController');
const router = require('express').Router();

router.post('/api/auth/get-security-token', requestRegisterToken);
router.post('/api/auth/register', confirmRegistration);
router.post('/api/auth/login', login);

module.exports = router;
