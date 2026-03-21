"use strict";
// main.ts
Object.defineProperty(exports, "__esModule", { value: true });
var fs = require("fs");
var path = require("path");
var child_process_1 = require("child_process");
var readline = require("readline");

console.log('[INFO] Iniciando AnimeExt...');

// -----------------------
// Función para descomprimir node_modules.zip sin librerías externas
// -----------------------
function descomprimirNodeModules() {
    const tarPath = path.join(__dirname, 'node_modules.bin');
    const zipPath = path.join(__dirname, 'node_modules.zip');
    const nodeModulesPath = path.join(__dirname, 'node_modules');

    if (!fs.existsSync(nodeModulesPath)) {
        try {
            if (fs.existsSync(tarPath)) {
                console.log('[INFO] node_modules no encontrado. Descomprimiendo node_modules.tar.gz...');
                // Extraer con tar en Linux/macOS/Windows 10+
                child_process_1.execSync(`tar -xzf "${tarPath}" -C "${__dirname}"`, { stdio: 'inherit' });
                console.log('[INFO] node_modules descomprimido correctamente desde tar.gz.');
            } else if (fs.existsSync(zipPath)) {
                console.log('[INFO] node_modules no encontrado. Descomprimiendo node_modules.zip...');
                if (process.platform === 'win32') {
                    child_process_1.execSync(`powershell -Command "Expand-Archive -Path '${zipPath}' -DestinationPath '${__dirname}'"`, { stdio: 'inherit' });
                } else {
                    child_process_1.execSync(`unzip -q '${zipPath}' -d '${__dirname}'`, { stdio: 'inherit' });
                }
                console.log('[INFO] node_modules descomprimido correctamente desde zip.');
            } else {
                console.warn('[WARN] No se encontró node_modules ni archivo de respaldo (zip o tar.gz).');
            }
        } catch (err) {
            console.error('[ERROR] Falló la descompresión de node_modules:', err);
            process.exit(1);
        }
    }
}

// Llamar a la función antes de chequear dependencias
descomprimirNodeModules();

// -----------------------
// Verificar existencia de package.json
// -----------------------
var packagePath = path.join(__dirname, 'package.json');
if (!fs.existsSync(packagePath)) {
    console.error('[ERROR] No se encontró package.json en el directorio actual.');
    process.exit(1);
}
var packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf-8'));
console.log(`[INFO] Versión de AnimeExt: ${packageJson.version}`);

// -----------------------
// Verificación de dependencias
// -----------------------
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
    console.warn(`[WARN] Faltan dependencias: ${missingDependencies.join(', ')}`);
    var rl_1 = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    rl_1.question('[INFO] ¿Desea instalar las dependencias faltantes? (s/n): ', function (answer) {
        rl_1.close();
        if (answer.trim().toLowerCase() === 's') {
            console.log('[INFO] Intentando instalar dependencias faltantes automáticamente...');
            try {
                (0, child_process_1.execSync)(`npm install ${missingDependencies.join(' ')}`, { stdio: 'inherit' });
                console.log('[INFO] Dependencias instaladas correctamente. Reinicia el script.');
            }
            catch (e) {
                console.error('[ERROR] Falló la instalación automática de dependencias.');
                process.exit(1);
            }
        } else {
            console.error('[ERROR] No se pueden encontrar las dependencias requeridas. Por favor instálelas y reinicie el script.');
        }
        process.exit(0);
    });
} else {
    console.log('[INFO] Todas las dependencias requeridas están instaladas.');
    try {
        require('./src/server');
        console.log('[INFO] Servidor AnimeExt iniciado correctamente.');
    }
    catch (err) {
        if (err instanceof Error) {
            console.error('[ERROR] Falló al iniciar el servidor:', err.message);
        } else {
            console.error('[ERROR] Falló al iniciar el servidor:', err);
        }
        process.exit(1);
    }
}