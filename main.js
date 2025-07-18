// main.js

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const readline = require('readline');

console.log('[INFO] Iniciando AnimeExt...');

// Verificar existencia de package.json
const packagePath = path.join(__dirname, 'package.json');
if (!fs.existsSync(packagePath)) {
  console.error('[ERROR] No se encontró package.json en el directorio actual.');
  process.exit(1);
}

const packageJson = require(packagePath);
console.log(`[INFO] Versión de AnimeExt: ${packageJson.version}`);

// Verificación de dependencias
const dependencies = packageJson.dependencies ? Object.keys(packageJson.dependencies) : [];
const missingDependencies = [];

for (const dep of dependencies) {
  try {
    require.resolve(dep, { paths: [__dirname] });
  } catch (e) {
    missingDependencies.push(dep);
  }
}

if (missingDependencies.length > 0) {
  console.warn(`[WARN] Faltan dependencias: ${missingDependencies.join(', ')}`);

  // Preguntar al usuario si desea instalarlas
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  rl.question('[INFO] ¿Desea instalar las dependencias faltantes? (s/n): ', (answer) => {
    rl.close();

    if (answer.trim().toLowerCase() === 's') {
      console.log('[INFO] Intentando instalar dependencias faltantes automáticamente...');
      try {
        execSync(`npm install ${missingDependencies.join(' ')}`, { stdio: 'inherit' });
        console.log('[INFO] Dependencias instaladas correctamente. Reinicia el script.');
      } catch (e) {
        console.error('[ERROR] Falló la instalación automática de dependencias.');
        process.exit(1);
      }
    } else {
      console.error('[ERROR] No se pueden encontrar las dependencias requeridas. Por favor instálelas y reinicie el script.');
    }

    process.exit(0); // finalizar en ambos casos para reinicio manual
  });

} else {
  console.log('[INFO] Todas las dependencias requeridas están instaladas.');

  // Iniciar el servidor
  try {
    require('./src/server');
    console.log('[INFO] Servidor AnimeExt iniciado correctamente.');
  } catch (err) {
    console.error('[ERROR] Falló al iniciar el servidor:', err.message);
    process.exit(1);
  }
}
// Nota: Este script asume que el entorno de Node.js está configurado correctamente y que las dependencias están en package.json. 