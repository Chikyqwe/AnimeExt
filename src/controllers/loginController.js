const { saveUser, checkUserLogin, checkUserLoginByUUID } = require('../services/postgresqlbaseService');
const bcrypt = require('bcryptjs');

const crypto = require('crypto');
const SendEmail = require('../services/emailService');
const pendingTokens = new Map(); // email -> { token, expiresMs }

async function requestRegisterToken(req, res) {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: 'Email requerido' });

        const token = crypto.randomBytes(6).toString('hex');
        const expiresMs = Date.now() + 31 * 60 * 1000; // 3 minutos

        pendingTokens.set(email, { token, expiresMs });

        // usa el servicio de email provisto por el proyecto
        await SendEmail(email, token);

        return res.status(200).json({ message: 'Token enviado por email' });
    } catch (err) {
        console.error('requestRegisterToken', err);
        return res.status(500).json({ error: 'Error interno' });
    }
}

async function confirmRegistration(req, res) {
    console.log(pendingTokens)
    try {
        const { email, token, password, username, tokenFCM } = req.body;
        if (!email || !token || !password || !tokenFCM) return res.status(400).json({ error: 'Faltan campos' });
        console.log(email, token, password, username, Date.now());
        // Primero intentar verificar token en memoria
        const record = pendingTokens.get(email);
        console.log("Record obtenido:", record);
        let valid = false;
        if (record && record.token === token && record.expiresMs > Date.now()) {
            valid = true;
            pendingTokens.delete(email);
        }
        console.log("Validación token en memoria:", valid);
        if (!valid) return res.status(400).json({ error: 'Token inválido o expirado' });

        // hashear la contraseña con bcrypt
        const hashed = bcrypt.hashSync(password, 10); // 10 = salt rounds
        const newUuid = crypto.randomUUID();
        const user = {
            uuid: newUuid,
            email,
            token: tokenFCM || null,
            user_name: username || null,
            password_hash: hashed,
            timestamp: Date.now()
        };

        await saveUser(user);

        return res.status(201).json({ message: 'Usuario registrado' });
    } catch (err) {
        console.error('confirmRegistration', err);
        return res.status(500).json({ error: 'Error interno' });
    }
}
async function login(req, res) {
    try {
        const { type, email, password, uuid } = req.body;

        if (!type) {
            return res.status(400).json({ error: 'Tipo de login requerido' });
        }

        // 🔹 LOGIN POR UUID
        if (type === 'uuid') {

            if (!uuid) {
                return res.status(400).json({ error: 'UUID requerido' });
            }

            const loginResult = await checkUserLoginByUUID(uuid);

            if (loginResult.status !== "ok") {
                return res.status(401).json({ error: 'UUID inválido' });
            }

            return res.status(200).json({
                message: 'Autenticado',
                type: 'uuid',
                user: loginResult.user
            });
        }

        // 🔹 LOGIN POR PASSWORD
        if (type === 'password') {

            if (!email || !password) {
                return res.status(400).json({ error: 'Email y password requeridos' });
            }

            const loginResult = await checkUserLogin({ email, password });

            if (loginResult.status !== "ok") {
                return res.status(401).json({ error: 'Credenciales inválidas' });
            }

            return res.status(200).json({
                message: 'Autenticado',
                type: 'password',
                user: loginResult.user
            });
        }

        // ❌ Tipo desconocido
        return res.status(400).json({
            error: 'Tipo de login inválido'
        });

    } catch (err) {
        console.error('login', err);
        return res.status(500).json({ error: 'Error interno' });
    }
}


module.exports = {
    requestRegisterToken,
    confirmRegistration,
    login
};
