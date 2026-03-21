require('dotenv').config();
const nodemailer = require('nodemailer');

// ─── Transporter singleton (no recrear en cada envío) ────────────────────────
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

// ─── Tipos de email soportados ───────────────────────────────────────────────
const EMAIL_TYPES = {
  CAPTCHA: 'captcha',
  ALERT:   'alert',
  WELCOME: 'welcome'
};

// ─── Templates ───────────────────────────────────────────────────────────────
const templates = {

  [EMAIL_TYPES.CAPTCHA]: (content) => ({
    subject: '🔐 AnimeEXT: Tu código de verificación',
    html: layout({
      accent:  '#e84545',
      icon:    '🔑',
      title:   'Código de verificación',
      intro:   'Usa este código para continuar. Expira en <strong>10 minutos</strong>.',
      body:    `<div style="background:#1c1c26;border-radius:10px;padding:24px;font-size:36px;font-weight:700;text-align:center;letter-spacing:10px;color:#f0f0f5;">${content}</div>`,
      footer:  'Si no solicitaste este código, ignora este mensaje.'
    })
  }),

  [EMAIL_TYPES.ALERT]: (content) => ({
    subject: '⚠️ ALERTA DE SISTEMA: AnimeEXT Memory Leak',
    html: layout({
      accent:  '#ef4444',
      icon:    '⚠️',
      title:   'Alerta crítica del sistema',
      intro:   'El servidor ha detectado un consumo de memoria elevado y se ha reiniciado automáticamente.',
      body:    `<div style="background:#1c1c26;border-radius:8px;padding:16px;font-size:13px;color:#f0f0f5;font-family:monospace;white-space:pre-wrap;word-break:break-all;">${content}</div>`,
      footer:  'Este mensaje fue generado automáticamente por el sistema de monitoreo.'
    })
  }),

  [EMAIL_TYPES.WELCOME]: (content) => ({
    subject: '👋 Bienvenido a AnimeEXT',
    html: layout({
      accent:  '#e84545',
      icon:    '🎌',
      title:   `¡Hola, ${content}!`,
      intro:   'Tu cuenta ha sido creada exitosamente. Ya puedes suscribirte a tus animes favoritos y recibir notificaciones de nuevos episodios.',
      body:    `<div style="text-align:center;padding:8px 0;"><a href="${process.env.APP_URL || '#'}" style="display:inline-block;background:#e84545;color:#fff;text-decoration:none;padding:12px 32px;border-radius:8px;font-weight:600;font-size:14px;">Ir a AnimeEXT</a></div>`,
      footer:  'Si no creaste esta cuenta, contacta al soporte.'
    })
  })
};

// ─── Layout base HTML ────────────────────────────────────────────────────────
function layout({ accent, icon, title, intro, body, footer }) {
  return `
<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#0a0a0f;font-family:'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:520px;">

        <!-- Header -->
        <tr><td style="padding-bottom:24px;text-align:center;">
          <span style="font-size:32px;font-weight:900;letter-spacing:4px;color:${accent};">ANIME</span><span style="font-size:32px;font-weight:900;letter-spacing:4px;color:#f0f0f5;">EXT</span>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#13131a;border-radius:16px;border:1px solid rgba(255,255,255,0.07);padding:32px 28px;">

          <!-- Icon + title -->
          <p style="font-size:28px;margin:0 0 6px;">${icon}</p>
          <h2 style="margin:0 0 12px;font-size:20px;color:#f0f0f5;font-weight:600;">${title}</h2>
          <p style="margin:0 0 24px;font-size:14px;color:#9090a8;line-height:1.6;">${intro}</p>

          <!-- Content -->
          ${body}

          <!-- Divider -->
          <div style="border-top:1px solid rgba(255,255,255,0.07);margin:28px 0 16px;"></div>

          <!-- Footer -->
          <p style="margin:0;font-size:12px;color:#6b6b80;line-height:1.5;">${footer}</p>
          <p style="margin:8px 0 0;font-size:11px;color:#4a4a5a;">Generado el ${new Date().toLocaleString('es-MX')}</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Función principal ───────────────────────────────────────────────────────
/**
 * @param {string} to         - Email destino
 * @param {string} content    - Contenido dinámico (código, username, detalle de alerta…)
 * @param {string} type       - EMAIL_TYPES.CAPTCHA | ALERT | WELCOME  (default: CAPTCHA)
 */
async function SendEmail(to, content, type = EMAIL_TYPES.CAPTCHA) {

  // Retrocompatibilidad: si se pasa `true` como tercer arg (versión vieja con isAlert)
  if (type === true)  type = EMAIL_TYPES.ALERT;
  if (type === false) type = EMAIL_TYPES.CAPTCHA;

  const builder = templates[type];
  if (!builder) {
    console.error(`[email] Tipo desconocido: ${type}`);
    return false;
  }

  const { subject, html } = builder(content);

  try {
    await transporter.sendMail({
      from: `"AnimeEXT" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html
    });
    console.log(`[email] ✓ Enviado (${type}) → ${to}`);
    return true;
  } catch (error) {
    console.error(`[email] ✗ Error (${type}) → ${to}:`, error.message);
    return false;
  }
}

module.exports = SendEmail;
module.exports.EMAIL_TYPES = EMAIL_TYPES;