/** Doctor8 WABA — inbound messages land in Doctor8 admin /admin/mensagens. */
const DOCTOR8_WABA_WHATSAPP_E164 = '491749803699';

const LEGACY_WHATSAPP_NUMBERS = new Set(['553197170053', '5531971720053']);

function normalizeWhatsAppDigits(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return DOCTOR8_WABA_WHATSAPP_E164;
  if (LEGACY_WHATSAPP_NUMBERS.has(digits)) return DOCTOR8_WABA_WHATSAPP_E164;
  return digits;
}

module.exports = {
  DOCTOR8_WABA_WHATSAPP_E164,
  LEGACY_WHATSAPP_NUMBERS,
  normalizeWhatsAppDigits,
};
