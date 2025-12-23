require('dotenv').config();
const supabase = require('./supabaseService'); // usa service_role key
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const USERS_TABLE = process.env.USERS_TABLE || 'users';
const USERS_T_TABLE = process.env.USERS_T_TABLE || 'users_t';

// -------------------- USERS --------------------

// Crear o actualizar usuario
async function saveUser({ email, password_hash, token, uuid, timestamp, user_name }) {

    const { data, error } = await supabase
        .from(USERS_TABLE)
        .upsert({
            uuid,
            email,
            password_hash,
            token,
            timestamp,
            user_name,
            anime_uids: {}
        })
        .select('uuid')
        .single();

    if (error) throw error;

    // Insertar en users_t solo si NO existe
    const { error: tError } = await supabase
        .from(USERS_T_TABLE)
        .insert({
            uuid,
            token
        })
        .select();

    if (tError) {
        console.warn("No se pudo insertar en users_t:", tError.message);
    }

    return data.uuid;
}


// -------------------- LOGIN FUNCTION --------------------

/**
 * Verifica email + password_hash (ya hasheada)
 * Si el login es correcto actualiza el token
 */
async function checkUserLogin({ email, password, newToken = null }) {

    const { data: user, error } = await supabase
        .from(USERS_TABLE)
        .select('*')
        .eq('email', email)
        .single();

    if (error || !user) {
        return { status: "user_not_found" };
    }

    const validPassword = bcrypt.compareSync(
        user.password_hash,
        password
    );

    if (!validPassword) {
        return { status: "invalid_password" };
    }

    if (newToken) {
        await supabase
            .from(USERS_TABLE)
            .update({ token: newToken })
            .eq('uuid', user.uuid);
    }

    return {
        status: "ok",
        user
    };
}


async function checkUserLoginByUUID(uuid) {

    const { data: user, error } = await supabase
        .from(USERS_TABLE)
        .select('*')
        .eq('uuid', uuid)
        .single();

    if (error || !user) {
        return { status: "user_not_found" };
    }

    return {
        status: "ok",
        user
    };
}


// -------------------- USERS QUERIES --------------------

async function getUser(uuid) {
    const { data, error } = await supabase
        .from(USERS_TABLE)
        .select('*')
        .eq('uuid', uuid)
        .single();

    if (error) return null;
    return data;
}

async function getAllUsers() {
    const { data, error } = await supabase
        .from(USERS_TABLE)
        .select('*');

    if (error) throw error;
    return data;
}


// -------------------- JSONB --------------------

async function addAnimeUIDs(uuid, obj = {}) {
    const { error } = await supabase.rpc("add_anime_uids", {
        user_id: uuid,
        patch: obj
    });

    if (error) throw error;
    return true;
}

async function getAnimeUIDs(uuid) {
    const { data, error } = await supabase
        .from(USERS_TABLE)
        .select('anime_uids')
        .eq('uuid', uuid)
        .single();

    if (error) throw error;
    return data?.anime_uids || {};
}

async function anulatedNotification(uuid, uid) {
    const { error } = await supabase.rpc("remove_anime_uid", {
        user_id: uuid,
        uid_key: String(uid)
    });

    if (error) throw error;
    return true;
}


// -------------------- USERS_T --------------------

async function checkToken(token) {
    const { data, error } = await supabase
        .from(USERS_T_TABLE)
        .select('uuid')
        .eq('token', token)
        .maybeSingle();

    if (error) throw error;

    if (data) return { status: false, uuid: data.uuid };
    return { status: true };
}


// -------------------- HELPERS --------------------

function generateUUID() {
    return crypto.randomUUID();
}

module.exports = {
    saveUser,
    checkUserLogin,
    getUser,
    addAnimeUIDs,
    getAnimeUIDs,
    checkToken,
    getAllUsers,
    anulatedNotification,
    generateUUID,
    checkUserLoginByUUID
};
