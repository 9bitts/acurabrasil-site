(function (g) {
  'use strict';
  const DOCTOR8_WABA = '491749803699';
  const LEGACY = ['553197170053', '5531971720053'];

  g.ACURA_WHATSAPP_CONTACT = {
    number: DOCTOR8_WABA,
    normalize(raw) {
      const digits = String(raw || '').replace(/\D/g, '');
      if (!digits) return DOCTOR8_WABA;
      if (LEGACY.indexOf(digits) >= 0) return DOCTOR8_WABA;
      return digits;
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
