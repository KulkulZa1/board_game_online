function normalizeAddress(address) {
  if (!address) return '';
  let value = String(address).trim().toLowerCase();
  if (value.startsWith('::ffff:')) value = value.slice('::ffff:'.length);
  return value;
}

function isLoopbackAddress(address) {
  const value = normalizeAddress(address);
  if (!value) return false;
  if (value === 'localhost' || value === '::1' || value === '0:0:0:0:0:0:0:1') return true;
  return /^127(?:\.\d{1,3}){3}$/.test(value);
}

function isLocalRequest(req) {
  return isLoopbackAddress(req && req.socket && req.socket.remoteAddress);
}

function isAdminEnabled(req) {
  return isLocalRequest(req) || process.env.ENABLE_ADMIN_ROUTES === 'true';
}

module.exports = {
  isAdminEnabled,
  isLocalRequest,
  isLoopbackAddress,
};
