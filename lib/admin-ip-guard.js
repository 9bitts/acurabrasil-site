function parseAdminAllowlist() {
  const raw = process.env.ADMIN_IP_ALLOWLIST;
  if (!raw || !raw.trim()) return null;
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

function adminIpGuard(req, res, next) {
  const allowlist = parseAdminAllowlist();
  if (!allowlist) return next();
  const ip = req.ip || req.socket.remoteAddress || '';
  const normalized = ip.replace(/^::ffff:/, '');
  if (!allowlist.has(normalized) && !allowlist.has(ip)) {
    return res.status(404).send('Not Found');
  }
  return next();
}

module.exports = { adminIpGuard, parseAdminAllowlist };
