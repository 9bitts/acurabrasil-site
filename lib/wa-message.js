function decodeWaMessage(stored) {
  if (!stored) return '';
  const str = String(stored);
  if (!str.includes('%')) return str;
  try {
    return decodeURIComponent(str.replace(/\+/g, ' '));
  } catch {
    return str;
  }
}

function encodeWaMessage(text) {
  return encodeURIComponent(decodeWaMessage(text));
}

function buildWaLink(number, message) {
  const digits = String(number || '').replace(/\D/g, '');
  const encoded = encodeWaMessage(message);
  return `https://wa.me/${digits}?text=${encoded}`;
}

module.exports = {
  decodeWaMessage,
  encodeWaMessage,
  buildWaLink,
};
