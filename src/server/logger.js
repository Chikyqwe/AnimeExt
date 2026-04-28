"use strict";

const log = (...args) => console.log('[LOG]', ...args);
const warn = (...args) => console.warn('[WARN]', ...args);
const error = (...args) => console.error('[ERROR]', ...args);

module.exports = { log, warn, error };