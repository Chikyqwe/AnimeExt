"use strict";
// main.ts
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var path = require("path");
var child_process_1 = require("child_process");
var readline = require("readline");
console.log('[INFO] Iniciando AnimeExt...');
// Verificar existencia de package.json
var packagePath = path.join(__dirname, 'package.json');
if (!fs.existsSync(packagePath)) {
    console.error('[ERROR] No se encontró package.json en el directorio actual.');
    process.exit(1);
}
var packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
console.log("[INFO] Versi\u00F3n de AnimeExt: ".concat(packageJson.version));
// Verificación de dependencias
var dependencies = packageJson.dependencies ? Object.keys(packageJson.dependencies) : [];
var missingDependencies = [];
for (var _i = 0, dependencies_1 = dependencies; _i < dependencies_1.length; _i++) {
    var dep = dependencies_1[_i];
    try {
        require.resolve(dep, { paths: [__dirname] });
    }
    catch (e) {
        missingDependencies.push(dep);
    }
}
if (missingDependencies.length > 0) {
    console.warn("[WARN] Faltan dependencias: ".concat(missingDependencies.join(', ')));
    // Preguntar al usuario si desea instalarlas
    var rl_1 = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl_1.question('[INFO] ¿Desea instalar las dependencias faltantes? (s/n): ', function (answer) {
        rl_1.close();
        if (answer.trim().toLowerCase() === 's') {
            console.log('[INFO] Intentando instalar dependencias faltantes automáticamente...');
            try {
                (0, child_process_1.execSync)("npm install ".concat(missingDependencies.join(' ')), { stdio: 'inherit' });
                console.log('[INFO] Dependencias instaladas correctamente. Reinicia el script.');
            }
            catch (e) {
                console.error('[ERROR] Falló la instalación automática de dependencias.');
                process.exit(1);
            }
        }
        else {
            console.error('[ERROR] No se pueden encontrar las dependencias requeridas. Por favor instálelas y reinicie el script.');
        }
        process.exit(0); // finalizar en ambos casos para reinicio manual
    });
}
else {
    console.log('[INFO] Todas las dependencias requeridas están instaladas.');
    // Iniciar el servidor
    try {
        require('./src/server');
        console.log('[INFO] Servidor AnimeExt iniciado correctamente.');
    }
    catch (err) {
        if (err instanceof Error) {
            console.error('[ERROR] Falló al iniciar el servidor:', err.message);
        }
        else {
            console.error('[ERROR] Falló al iniciar el servidor:', err);
        }
        process.exit(1);
    }
}
