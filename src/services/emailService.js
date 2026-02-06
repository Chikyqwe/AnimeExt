require("dotenv").config();
const nodemailer = require("nodemailer");

/**
 * Función versátil para enviar correos (Códigos o Alertas de Sistema)
 */
async function SendEmail(to, content, isAlert = false) {
  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS
    }
  });

  const subject = isAlert 
    ? "⚠️ ALERTA DE SISTEMA: AnimeEXT Memory Leak" 
    : "AnimeEXT: Tu código de seguridad temporal";

  const htmlTemplate = `
    <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
      <h2 style="color: ${isAlert ? '#ef4444' : '#4f46e5'};">
        ${isAlert ? 'Reinicio por Consumo de Memoria' : 'Código de Verificación'}
      </h2>
      <p>${isAlert ? 'El servidor ha alcanzado un umbral crítico y se ha reiniciado.' : 'Tu código es:'}</p>
      <div style="background: #f3f4f6; padding: 20px; font-size: 24px; font-weight: bold; text-align: center;">
        ${content}
      </div>
      <p style="font-size: 12px; color: #666; margin-top: 20px;">
        Generado el: ${new Date().toLocaleString()}
      </p>
    </div>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to,
    subject: subject,
    html: htmlTemplate
  };

  try {
    await transporter.sendMail(mailOptions);
    return true;
  } catch (error) {
    console.error("[email] Error:", error);
    return false;
  }
}

module.exports = SendEmail;