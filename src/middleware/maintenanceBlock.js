// src/middleware/maintenanceBlock.js
let isUpdating = false;

function setUpdatingStatus(status) {
  isUpdating = status;
}

function maintenanceBlock(req, res, next) {
  console.log(`[MIDDLEWARE] Request a: ${req.path} - isUpdating: ${isUpdating}`);
  
  if (isUpdating && req.path !== '/maintenance' && req.path !== '/up') {
    console.log(`[MIDDLEWARE] Redirecting to maintenance page for path: ${req.path}`);
    return res.redirect('/maintenance');
  }
  next();
}

module.exports = {
  maintenanceBlock,
  setUpdatingStatus,
  getUpdatingStatus: () => isUpdating
};
