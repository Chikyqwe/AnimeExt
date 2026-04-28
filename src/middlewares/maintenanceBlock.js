// src/middleware/maintenanceBlock.js
let isUpdating = false;

function setUpdatingStatus(status) {
  const prev = isUpdating;
  isUpdating = Boolean(status);
  return prev; // retorna el estado anterior
}

function getUpdatingStatus() {
  return isUpdating;
}

module.exports = { setUpdatingStatus, getUpdatingStatus };
