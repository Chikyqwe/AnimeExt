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



function getRequestLog(limit = 100) {
  const logs = Array.from(requestLog.values())
    .sort((a, b) => b.timestamp - a.timestamp);
  return limit ? logs.slice(0, limit) : logs;
}

function clearRequestLog() {
  requestLog.clear();
}

module.exports = {

  setUpdatingStatus,
  getUpdatingStatus,
  getRequestLog,
  clearRequestLog,
};
