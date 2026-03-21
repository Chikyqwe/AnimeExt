const { supabase } = require('../services/supabase/supabase');
const SupaInterface = require('../services/supabase/supabaseInt');
const supa = new SupaInterface(supabase);
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const SendEmail = require('../services/emailService');
const { getSubscriptions } = require('./notificationController');

// email -> { token, expiresMs }
const pendingTokens = new Map();

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateToken(length = 6) {
  return crypto.randomInt(100000, 999999).toString();
}

function isExpired(expiresMs) {
  return Date.now() > expiresMs;
}

// ─── CAPTCHA: envía código al email antes de continuar ───────────────────────

async function sendCaptcha(req, res) {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email requerido.' });

    const token = generateToken();
    const expiresMs = Date.now() + 10 * 60 * 1000; // 10 minutos

    pendingTokens.set(email, { token, expiresMs });

    const sent = await SendEmail(email, token);
    if (!sent) return res.status(500).json({ error: 'No se pudo enviar el correo.' });

    return res.json({ message: 'Código enviado. Revisa tu correo.' });
  } catch (err) {
    console.error('[captcha]', err);
    return res.status(500).json({ error: 'Error interno.' });
  }
}

// ─── SIGNUP ──────────────────────────────────────────────────────────────────

async function signup(req, res) {
  try {
    const { email, password, username, captchaToken } = req.body;
    let usrname = username; // Para evitar shadowing con el campo de la DB
    if (!email || !password || !usrname || !captchaToken) {
      return res.status(400).json({ error: 'Todos los campos son requeridos.' });
    }

    // Verificar captcha
    const pending = pendingTokens.get(email);
    if (!pending) return res.status(400).json({ error: 'Solicita primero un código de verificación.' });
    if (isExpired(pending.expiresMs)) {
      pendingTokens.delete(email);
      return res.status(400).json({ error: 'El código ha expirado. Solicita uno nuevo.' });
    }
    if (pending.token !== captchaToken) {
      return res.status(400).json({ error: 'Código incorrecto.' });
    }
    pendingTokens.delete(email);

    // Verificar si ya existe
    const existing = await supa.search.users.email(email);
    if (existing && existing.length > 0) {
      return res.status(409).json({ error: 'Ya existe una cuenta con ese email.' });
    }

    // Hashear contraseña y crear usuario
    const passwordHash = await bcrypt.hash(password, 12);
    const uuid = crypto.randomUUID();

    const created = await supa.create.users({
      uuid,
      email,
      usrname,
      password: passwordHash,
      token: null,
      subscriptions: {},
    });

    return res.status(201).json({
      message: 'Cuenta creada exitosamente.',
      user: { uuid, email, usrname }
    });
  } catch (err) {
    console.error('[signup]', err);
    return res.status(500).json({ error: 'Error interno.' });
  }
}

// ─── LOGIN ───────────────────────────────────────────────────────────────────

async function login(req, res) {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email y contraseña requeridos.' });
    }

    // Buscar usuario
    const results = await supa.search.users.email(email);
    if (!results || results.length === 0) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }
    const user = results[0];

    // Verificar contraseña
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ error: 'Credenciales incorrectas.' });
    }

    // Generar session token y guardarlo
    const sessionToken = crypto.randomBytes(32).toString('hex');
    await supa.write.users.token(user.id, {sessionToken});

    return res.json({
      message: 'Login exitoso.',
      token: sessionToken,
      user: {
        uuid: user.uuid,
        email: user.email,
        usrname: user.usrname
      }
    });
  } catch (err) {
    console.error('[login]', err);
    return res.status(500).json({ error: 'Error interno.' });
  }
}

module.exports = { sendCaptcha, signup, login };