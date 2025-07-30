// src/middleware/maintenanceBlock.js

let isUpdating = false;
const requestLog = new Map();
const MAX_LOG_SIZE = 1000;

function setUpdatingStatus(status) {
  isUpdating = Boolean(status);
}

function getUpdatingStatus() {
  return isUpdating;
}

function maintenanceBlock(req, res, next) {
  const allowedPaths = ['/maintenance', '/up'];
  const now = new Date();
  const requestId = `${now.toISOString()}_${Math.random().toString(36).substr(2, 9)}`;

  // No registrar la ruta /reqs
  if (req.path !== '/reqs' && req.path !== '/favicon.ico') {
    requestLog.set(requestId, {
      path: req.path,
      method: req.method,
      timestamp: now,
      isUpdating,
    });

    if (requestLog.size > MAX_LOG_SIZE) {
      const oldestKey = requestLog.keys().next().value;
      requestLog.delete(oldestKey);
    }
  }

  if (isUpdating && !allowedPaths.includes(req.path)) {
    return res.redirect('/maintenance');
  }

  next();
}


function getRequestLog(limit = 100) {
  const logs = Array.from(requestLog.values())
    .sort((a, b) => b.timestamp - a.timestamp);
  return limit ? logs.slice(0, limit) : logs;
}

function clearRequestLog() {
  requestLog.clear();
}

module.exports = {
  maintenanceBlock,
  setUpdatingStatus,
  getUpdatingStatus,
  getRequestLog,
  clearRequestLog,
};
