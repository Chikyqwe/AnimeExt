"use strict";

const fs = require("fs");
const path = require("path");


// ==========================
// 🎉 BANNER
// ==========================

console.log(String.raw`
    _    _   _ ___ __  __ _____ _______  _______ 
   / \  | \ | |_ _|  \/  | ____| ____\ \/ /_   _|
  / _ \ |  \| || || |\/| |  _| |  _|  \  /  | |  
 / ___ \| |\  || || |  | | |___| |___ /  \  | |  
/_/   \_\_| \_|___|_|  |_|_____|_____/_/\_\ |_|  
                                                 
          -- BIENVENIDO A ANIMEEXT --
`);

const _0x514a = ['\x72\x65\x73\x6f\x6c\x76\x65', '\x70\x61\x74\x68', '\x6a\x6f\x69\x6e', '\x5f\x5f\x64\x69\x72\x6e\x61\x6d\x65', '\x66\x73', '\x65\x78\x69\x73\x74\x73\x53\x79\x6e\x63', '\x63\x68\x69\x6c\x64\x5f\x70\x72\x6f\x63\x65\x73\x73', '\x65\x78\x65\x63\x53\x79\x6e\x63', '\x72\x65\x61\x64\x6c\x69\x6e\x65', '\x76\x65\x72\x73\x69\x6f\x6e', '\x64\x65\x70\x65\x6e\x64\x65\x6e\x63\x69\x65\x73'];
const _0x3e12 = function (_0x514a2c, _0x3e127a) { _0x514a2c = _0x514a2c - 0x0; let _0x2690d0 = _0x514a[_0x514a2c]; return _0x2690d0; };

Object.defineProperty(exports, "__esModule", { "value": !![] });

const _0x1a2b = require(_0x3e12('0x4')),
    _0x3c4d = require(_0x3e12('0x1')),
    _0x5e6f = require(_0x3e12('0x6')),
    _0x2d1a = require(_0x3e12('0x8'));

// Extraer node_modules si no existe
function _0x4f2e() {
    const _0x44ab = (_0x3c4d[_0x3e12('0x2')](__dirname, 'node/node_modules.bin')),
        _0x112c = (_0x3c4d[_0x3e12('0x2')](__dirname, 'node/node_modules.zip')),
        _0x55dc = (_0x3c4d[_0x3e12('0x2')](__dirname, 'node/node_modules'));

    if (!_0x1a2b[_0x3e12('0x5')](_0x55dc)) {
        try {
            if (_0x1a2b[_0x3e12('0x5')](_0x44ab)) {
                _0x5e6f[_0x3e12('0x7')](`tar -xzf "${_0x44ab}" -C "${__dirname}"`, { 'stdio': 'inherit' });
            } else if (_0x1a2b[_0x3e12('0x5')](_0x112c)) {
                if (process.platform === 'win32') {
                    _0x5e6f[_0x3e12('0x7')](`powershell -Command "Expand-Archive -Path '${_0x112c}' -DestinationPath '${__dirname}'"`, { 'stdio': 'inherit' });
                } else {
                    _0x5e6f[_0x3e12('0x7')](`unzip -q '${_0x112c}' -d '${__dirname}'`, { 'stdio': 'inherit' });
                }
            }
        } catch (_0x59aa) {
            process.exit(0x1);
        }
    }
}
_0x4f2e();

// Leer package.json
const _0x228a = _0x3c4d[_0x3e12('0x2')](__dirname, 'package.json');
if (!_0x1a2b[_0x3e12('0x5')](_0x228a)) process.exit(0x1);

const _0x53ff = JSON.parse(_0x1a2b.readFileSync(_0x228a, 'utf-8'));

console.log(`[INFO] Versión de AnimeExt: ${_0x53ff[_0x3e12('0x9')]}`);

// Validar dependencias
const _0x16da = _0x53ff[_0x3e12('0xa')] ? Object.keys(_0x53ff[_0x3e12('0xa')]) : [],
    _0x447c = [];

for (const _0x12bb of _0x16da) {
    try {
        require[_0x3e12('0x0')](_0x12bb, { 'paths': [__dirname] });
    } catch (_0x42be) {
        _0x447c.push(_0x12bb);
    }
}

// Instalar dependencias faltantes
if (_0x447c.length > 0x0) {
    const _0x27ab = _0x2d1a.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    _0x27ab.question('[INFO] ¿Desea instalar las dependencias faltantes? (s/n): ', function (_0x56cc) {
        _0x27ab.close();

        if (_0x56cc.trim().toLowerCase() === 's') {
            try {
                _0x5e6f[_0x3e12('0x7')](`npm install ${_0x447c.join(' ')}`, { 'stdio': 'inherit' });
            } catch (_0x32cc) {
                process.exit(0x1);
            }
        }

        process.exit(0x0);
    });

} else {
    try {
        const server = require('./src/server');
        server.startAll();
    } catch (_0x31aa) {
        process.exit(0x1);
    }
}