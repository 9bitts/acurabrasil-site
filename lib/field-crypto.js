const crypto = require('crypto');

const VERSION_PREFIX = 'v1:';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;

const SENSITIVE_INTAKE_FIELDS = [
  'nome_paciente',
  'edad',
  'sintomas',
  'tipo_atencion',
  'prioridad',
  'observaciones',
];

let devEncryptionKey = null;

function parseEncryptionKey(raw) {
  if (!raw?.trim()) return null;
  const trimmed = raw.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, 'hex');
  }
  try {
    const buf = Buffer.from(trimmed, 'base64');
    if (buf.length === KEY_LENGTH) return buf;
  } catch {
    /* ignore */
  }
  return null;
}

function getEncryptionKey() {
  const parsed = parseEncryptionKey(process.env.ENCRYPTION_KEY);
  if (parsed) return parsed;

  if (process.env.NODE_ENV === 'production') {
    throw new Error(
      'ENCRYPTION_KEY must be 32 bytes as 64-char hex or base64 in production'
    );
  }

  if (!devEncryptionKey) {
    devEncryptionKey = crypto.randomBytes(KEY_LENGTH);
    console.warn(
      'ENCRYPTION_KEY not set — using ephemeral random key (encrypted intake data unreadable after restart)'
    );
  }
  return devEncryptionKey;
}

function validateFieldCryptoConfig() {
  const isProd = process.env.NODE_ENV === 'production';
  const parsed = parseEncryptionKey(process.env.ENCRYPTION_KEY);

  if (isProd) {
    if (!parsed) {
      throw new Error(
        'ENCRYPTION_KEY must be 32 bytes as 64-char hex or base64 in production (generate with: node scripts/generate-encryption-key.js)'
      );
    }
    return;
  }

  if (!parsed) {
    getEncryptionKey();
  }
}

function encryptField(plaintext) {
  if (plaintext == null) return null;
  const text = String(plaintext);
  if (text === '') return '';

  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  const packed = Buffer.concat([iv, tag, ciphertext]);
  return VERSION_PREFIX + packed.toString('base64');
}

function decryptField(encoded) {
  if (encoded == null) return null;
  const value = String(encoded);
  if (value === '') return '';

  if (!value.startsWith(VERSION_PREFIX)) {
    return value;
  }

  const key = getEncryptionKey();
  const packed = Buffer.from(value.slice(VERSION_PREFIX.length), 'base64');
  if (packed.length < IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error('Field decryption failed: invalid ciphertext format');
  }

  const iv = packed.subarray(0, IV_LENGTH);
  const tag = packed.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = packed.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  try {
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new Error('Field decryption failed: authentication tag mismatch (corrupted or tampered data)');
  }
}

function encryptIntakeSensitiveFields(values) {
  const out = { ...values };
  for (const field of SENSITIVE_INTAKE_FIELDS) {
    if (!(field in out)) continue;
    if (field === 'edad') {
      out[field] = encryptField(out[field] == null ? '' : String(out[field]));
    } else {
      out[field] = encryptField(out[field] ?? '');
    }
  }
  return out;
}

function decryptIntakeRow(row) {
  if (!row) return null;
  const out = { ...row };
  for (const field of SENSITIVE_INTAKE_FIELDS) {
    if (!(field in out) || out[field] == null || out[field] === '') {
      if (field === 'edad') out[field] = null;
      continue;
    }
    const decrypted = decryptField(out[field]);
    if (field === 'edad') {
      out[field] = decrypted === '' ? null : Number(decrypted);
      if (decrypted !== '' && !Number.isInteger(out[field])) out[field] = null;
    } else {
      out[field] = decrypted;
    }
  }
  return out;
}

function isEncryptedField(value) {
  return typeof value === 'string' && value.startsWith(VERSION_PREFIX);
}

validateFieldCryptoConfig();

module.exports = {
  encryptField,
  decryptField,
  encryptIntakeSensitiveFields,
  decryptIntakeRow,
  isEncryptedField,
  validateFieldCryptoConfig,
  SENSITIVE_INTAKE_FIELDS,
};
