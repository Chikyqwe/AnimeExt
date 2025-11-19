const { saveUser, getAllUsers, addAnimeUIDs, getAnimeUIDs, checkToken, anulatedNotification } = require('../services/postgresqlbaseService');
const crypto = require('crypto');

async function getUUID(req, res) {
    try {
        const { token, timestamp } = req.body.parameters;
        if (!token || !timestamp) {
            return res.status(400).json({ error: "Faltan parámetros obligatorios" });
        }

        // Generar UUID
        const uuid = crypto.randomUUID();

        // Verificar token
        const verification = await checkToken(token);
        if (verification.status === false) {
            return res.status(409).json({ error: "Token ya registrado", uuid: verification.uuid });
        }

        // Guardar usuario
        await saveUser({ uuid, token, timestamp });

        return res.status(200).json({ uuid });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
}
async function registeranime(req, res) {
    try {
        const { uuid, uids } = req.body.parameters;

        // Validar que uids sea un array de objetos
        if (!uuid || !Array.isArray(uids)) {
            return res.status(400).json({
                error: "Formato incorrecto: uids debe ser un array de objetos [{ uid, ep }]"
            });
        }

        // Convertir array de objetos → JSON tipo diccionario
        const mapped = {};
        for (const item of uids) {
            if (!item.uid || item.ep === undefined) continue;
            mapped[item.uid] = item.ep;
        }

        // Guardar en base de datos como JSONB fusionado
        const updated = await addAnimeUIDs(uuid, mapped);

        if (!updated) {
            return res.status(404).json({ error: "UUID no encontrado" });
        }

        return res.status(200).json({
            message: "Animelist actualizada.",
            uids: updated
        });

    } catch (err) {
        console.error("registeranime error:", err);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
}
async function getUsers(req, res) {
    try {
        const users = await getAllUsers();
        return res.status(200).json({ users });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
}

async function getanimes(req, res) {
    try {
        const { uuid } = req.body.parameters;
        if (!uuid) {
            return res.status(400).json({ error: "Faltan parámetros obligatorios" });
        }

        // Obtener UIDs
        const uids = await getAnimeUIDs(uuid);
        return res.status(200).json({ uids });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
}

async function anulNot(req, res) {
    try {
        const { uuid, uid } = req.body.parameters;
        if (!uuid || !uid) {
            return res.status(400).json({ error: "Faltan parámetros obligatorios" });
        }

        // Anular notificación
        const result = await anulatedNotification(uuid, uid);
        if (!result) {
            return res.status(404).json({ error: "UUID no encontrado" });
        }

        return res.status(200).json({ message: "Notificación anulada." });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error interno del servidor" });
    }
}

module.exports = { getUUID, registeranime, getanimes, getUsers, anulNot };
