import assert from 'assert';

function crc16(payload) {
  const polynomial = 0x1021;
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) crc = (crc << 1) ^ polynomial;
      else crc <<= 1;
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function emv(id, value) {
  return id + String(value.length).padStart(2, '0') + value;
}

function generatePixPayload(amount, pixKey = '30.350.850/0001-80') {
  const key = pixKey.replace(/\D/g, '');
  const merchantAccount = emv('00', 'br.gov.bcb.pix') + emv('01', key);
  let payload = emv('00', '01') + emv('26', merchantAccount);
  payload += emv('52', '0000');
  payload += emv('53', '986');
  if (amount && amount > 0) payload += emv('54', amount.toFixed(2));
  payload += emv('58', 'BR');
  payload += emv('59', 'ACURA BRASIL'.substring(0, 25));
  payload += emv('60', 'BELO HORIZONTE'.substring(0, 15));
  payload += emv('62', emv('05', '***'));
  payload += '6304';
  return payload + crc16(payload);
}

const payload = generatePixPayload(50);
const cnpjDigits = '30.350.850/0001-80'.replace(/\D/g, '');
assert(payload.includes(cnpjDigits), 'payload must contain CNPJ ' + cnpjDigits);
console.log('Pix QR payload test OK');
