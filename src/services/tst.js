const sendSecurityCodeEmail = require("./emailService");

async function main() {
  const code = Math.floor(100000 + Math.random() * 900000).toString(); // o generas uno dinámico

  await sendSecurityCodeEmail("chikiyinyang@gmail.com", code);
}

main();
