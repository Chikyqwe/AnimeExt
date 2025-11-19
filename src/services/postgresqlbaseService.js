require('dotenv').config();
const { Pool } = require('pg');

const PG_URI = process.env.PG_URI;
const DB_NAME = process.env.DB_NAME; // opcional
const USERS_TABLE = process.env.USERS_TABLE || 'users';
const USERS_T_TABLE = process.env.USERS_T_TABLE || 'users_t';

if (!PG_URI) {
    throw new Error("PG_URI no está definida. Verifica tu archivo .env.");
}

const pool = new Pool({
    connectionString: PG_URI,
    ssl: true
});


// -------------------- USERS --------------------

// Crear o actualizar usuario
async function saveUser({ uuid, token, timestamp }) {
    if (!uuid || !token || !timestamp) {
        throw new Error("Faltan campos obligatorios: uuid, token o timestamp.");
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Upsert usuario en users
        const queryText = `
            INSERT INTO ${USERS_TABLE} (uuid, token, timestamp, anime_uids)
            VALUES ($1, $2, $3, '{}'::jsonb)
            ON CONFLICT (uuid)
            DO UPDATE SET token = EXCLUDED.token, timestamp = EXCLUDED.timestamp
            RETURNING uuid;
        `;
        const res = await client.query(queryText, [uuid, token, timestamp]);

        // Si se insertó un usuario nuevo, lo añadimos a users_t
        if (res.rows.length) {
            const uuidInserted = res.rows[0].uuid;
            await client.query(
                `INSERT INTO ${USERS_T_TABLE} (uuid, token) VALUES ($1, $2)
                 ON CONFLICT (uuid) DO NOTHING`,
                [uuidInserted, token]
            );
        }

        await client.query('COMMIT');
        return uuid;
    } catch (error) {
        await client.query('ROLLBACK');
        console.error("Error en operación de base de datos:", error.message);
        throw error;
    } finally {
        client.release();
    }
}

// Obtener usuario por UUID
async function getUser(uuid) {
    if (!uuid) throw new Error("Se requiere uuid para obtener usuario.");

    const { rows } = await pool.query(
        `SELECT uuid, token, timestamp, anime_uids FROM ${USERS_TABLE} WHERE uuid = $1`,
        [uuid]
    );
    return rows[0] || null;
}


// -------------------- ANIME_UIDS (objetos JSON dentro del usuario) --------------------

// Agregar UIDs a un usuario (sin duplicados, usando merge jsonb)
async function addAnimeUIDs(uuid, obj = {}) {
    if (!uuid || typeof obj !== "object" || Array.isArray(obj)) {
        throw new Error("Se requiere uuid y un objeto { uid: ep }.");
    }

    const query = `
        UPDATE ${USERS_TABLE}
        SET anime_uids = anime_uids || $2::jsonb
        WHERE uuid = $1
    `;

    const result = await pool.query(query, [uuid, JSON.stringify(obj)]);
    return result.rowCount;
}
// funcion para obtner todos los usuarios
async function getAllUsers() {
    const { rows } = await pool.query(
        `SELECT uuid, token, timestamp, anime_uids FROM ${USERS_TABLE}`
    );
    return rows;
}

// Obtener todos los UIDs del usuario
async function getAnimeUIDs(uuid) {
    if (!uuid) throw new Error("Se requiere uuid.");

    const { rows } = await pool.query(
        `SELECT anime_uids FROM ${USERS_TABLE} WHERE uuid = $1`,
        [uuid]
    );

    return rows[0]?.anime_uids || {};
}

async function anulatedNotification(uuid, uid) {
    if (!uuid || !uid) throw new Error("Se requiere uuid y uid.");

    const query = `
        UPDATE ${USERS_TABLE}
        SET anime_uids = anime_uids - $2
        WHERE uuid = $1
    `;

    const { rowCount } = await pool.query(query, [uuid, String(uid)]);
    return rowCount > 0;
}

// -------------------- USERS_T --------------------

// Verificar si un token ya fue usado
async function checkToken(token) {
    if (!token) throw new Error("Se requiere un token para verificar.");

    const { rows } = await pool.query(
        `SELECT uuid FROM ${USERS_T_TABLE} WHERE token = $1`,
        [token]
    );

    if (rows.length) {
        return { status: false, uuid: rows[0].uuid };
    } else {
        return { status: true };
    }
}

module.exports = {
    saveUser,
    getUser,
    addAnimeUIDs,
    getAnimeUIDs,
    checkToken,
    getAllUsers,
    anulatedNotification
};
