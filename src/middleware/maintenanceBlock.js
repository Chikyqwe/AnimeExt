// src/middleware/maintenanceBlock.js

let isUpdating = false;
function setUpdatingStatus(status) {
  isUpdating = Boolean(status);
}
module.exports = {
  setUpdatingStatus
};
