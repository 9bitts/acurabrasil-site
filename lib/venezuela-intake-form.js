const VENEZUELA_ESTADO_LABELS = {
  amazonas: 'Amazonas',
  anzoategui: 'Anzoátegui',
  apure: 'Apure',
  aragua: 'Aragua',
  barinas: 'Barinas',
  bolivar: 'Bolívar',
  carabobo: 'Carabobo',
  cojedes: 'Cojedes',
  'delta-amacuro': 'Delta Amacuro',
  'distrito-capital': 'Distrito Capital',
  falcon: 'Falcón',
  guarico: 'Guárico',
  lara: 'Lara',
  merida: 'Mérida',
  miranda: 'Miranda',
  monagas: 'Monagas',
  'nueva-esparta': 'Nueva Esparta',
  portuguesa: 'Portuguesa',
  sucre: 'Sucre',
  tachira: 'Táchira',
  trujillo: 'Trujillo',
  'la-guaira': 'La Guaira',
  yaracuy: 'Yaracuy',
  zulia: 'Zulia',
};

function parseVenezuelaWhatsApp(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return null;

  if (digits.startsWith('58') && digits.length > 10) {
    digits = digits.slice(2);
  }
  while (digits.startsWith('0') && digits.length > 10) {
    digits = digits.slice(1);
  }
  if (digits.startsWith('58') && digits.length > 10) {
    digits = digits.slice(2);
  }

  if (digits.length < 10 || digits.length > 11) return null;

  let ddd;
  let telefone;
  if (digits.length === 10) {
    ddd = digits.slice(0, 3);
    telefone = digits.slice(3);
  } else {
    ddd = digits.slice(0, 4);
    telefone = digits.slice(4);
  }

  if (telefone.length !== 7 || ddd.length < 3 || ddd.length > 4) return null;

  const whatsapp = `58${ddd}${telefone}`;
  return {
    ok: true,
    ddi: '58',
    ddd,
    telefone,
    display: `+58 (${ddd}) ${telefone}`,
    whatsapp: `https://wa.me/${whatsapp}`,
  };
}

function resolvePhoneFromBody(body) {
  const whatsappRaw = String(body.whatsapp || '').trim();
  if (whatsappRaw) {
    const parsed = parseVenezuelaWhatsApp(whatsappRaw);
    return parsed || { ok: false, field: 'phone' };
  }

  const ddiDigits = String(body.ddi || '').replace(/\D/g, '');
  const dddDigits = String(body.ddd || '').replace(/\D/g, '');
  const telDigits = String(body.telefone || '').replace(/\D/g, '');
  if (!ddiDigits && !dddDigits && !telDigits) {
    return { ok: false, field: 'phone' };
  }

  const combined = parseVenezuelaWhatsApp(`${ddiDigits}${dddDigits}${telDigits}`);
  if (combined) return combined;

  if (!ddiDigits || ddiDigits.length < 1 || ddiDigits.length > 4) {
    return { ok: false, field: 'phone' };
  }
  if (!dddDigits || dddDigits.length < 2 || dddDigits.length > 4) {
    return { ok: false, field: 'phone' };
  }
  if (!telDigits || telDigits.length < 4) {
    return { ok: false, field: 'phone' };
  }

  const national = dddDigits + telDigits;
  if (ddiDigits === '58') {
    if (national.length < 10 || national.length > 11) {
      return { ok: false, field: 'phone' };
    }
  } else if (telDigits.length < 7 || telDigits.length > 11 || national.length < 8) {
    return { ok: false, field: 'phone' };
  }

  return {
    ok: true,
    ddi: ddiDigits,
    ddd: dddDigits,
    telefone: telDigits,
    display: `+${ddiDigits} (${dddDigits}) ${telDigits}`,
    whatsapp: `https://wa.me/${ddiDigits}${dddDigits}${telDigits}`,
  };
}

function resolveUbicacionFromBody(body) {
  const legacy = String(body.ubicacion || '').trim();
  const ciudad = String(body.ciudad || '').trim();
  const estado = String(body.estado || '').trim();

  if (ciudad && estado) {
    const estadoLabel = VENEZUELA_ESTADO_LABELS[estado] || estado;
    return `${ciudad}, ${estadoLabel}`.slice(0, 200);
  }
  return legacy;
}

function isValidEstado(estado) {
  const value = String(estado || '').trim();
  return value.length > 0 && value.length <= 120;
}

module.exports = {
  VENEZUELA_ESTADO_LABELS,
  parseVenezuelaWhatsApp,
  resolvePhoneFromBody,
  resolveUbicacionFromBody,
  isValidEstado,
};
