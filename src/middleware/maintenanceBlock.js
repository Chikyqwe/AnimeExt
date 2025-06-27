// src/middleware/maintenanceBlock.js
let isUpdating = false;

function setUpdatingStatus(status) {
  isUpdating = status;
}

function maintenanceBlock(req, res, next) {
  console.log(`[MIDDLEWARE] Request a: ${req.path} - isUpdating: ${isUpdating}`);
  
  if (isUpdating && req.path !== '/maintenance' && req.path !== '/up') {
    console.log(`[BLOQUEADO] Acceso denegado temporalmente a ${req.path}`);
    return res.redirect('/maintenance');
  }
  next();
}

module.exports = {
  maintenanceBlock,
  setUpdatingStatus,
  getUpdatingStatus: () => isUpdating
};
