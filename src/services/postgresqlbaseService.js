require('dotenv').config();
const supabase = require('./supabaseService'); // usa service_role key
const crypto = require('crypto');

const USERS_TABLE = process.env.USERS_TABLE || 'users';
const USERS_T_TABLE = process.env.USERS_T_TABLE || 'users_t';

// -------------------- USERS --------------------

// Crear o actualizar usuario
async function saveUser({ uuid, token, timestamp }) {
    // Upsert en users
    const { data, error } = await supabase
        .from(USERS_TABLE)
        .upsert({
            uuid,
            token,
            timestamp,
            anime_uids: {}
        })
        .select('uuid')
        .single();

    if (error) throw error;

    // Insert en users_t solo si no existe
    const { error: tError } = await supabase
        .from(USERS_T_TABLE)
        .insert({ uuid, token })
        .select();

    if (tError) {
        console.warn("No se pudo insertar en users_t:", tError.message);
    }

    return data.uuid;
}

// Obtener usuario por UUID
async function getUser(uuid) {
    const { data, error } = await supabase
        .from(USERS_TABLE)
        .select('*')
        .eq('uuid', uuid)
        .single();

    if (error) return null;
    return data;
}

// Obtener todos los usuarios
async function getAllUsers() {
    const { data, error } = await supabase
        .from(USERS_TABLE)
        .select('*');

    if (error) throw error;
    return data;
}

// -------------------- JSONB --------------------

// Agregar/merge anime_uids usando RPC
async function addAnimeUIDs(uuid, obj = {}) {
    const { error } = await supabase.rpc("add_anime_uids", {
        user_id: uuid,
        patch: obj
    });

    if (error) throw error;
    return true;
}

// Obtener anime_uids de un usuario
async function getAnimeUIDs(uuid) {
    const { data, error } = await supabase
        .from(USERS_TABLE)
        .select('anime_uids')
        .eq('uuid', uuid)
        .single();

    if (error) throw error;
    return data?.anime_uids || {};
}

// Borrar un UID dentro del JSON usando RPC
async function anulatedNotification(uuid, uid) {
    const { error } = await supabase.rpc("remove_anime_uid", {
        user_id: uuid,
        uid_key: String(uid)
    });

    if (error) throw error;
    return true;
}

// -------------------- USERS_T --------------------

// Verificar si un token ya fue usado
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

// -------------------- Helpers --------------------

// Generar UUID v4
function generateUUID() {
    return crypto.randomUUID();
}

module.exports = {
    saveUser,
    getUser,
    addAnimeUIDs,
    getAnimeUIDs,
    checkToken,
    getAllUsers,
    anulatedNotification,
    generateUUID
};
