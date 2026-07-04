const crypto = require('crypto');
const { getDb } = require('./db');
const { encryptIntakeSensitiveFields } = require('./field-crypto');

function generateIntakeToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashIntakeToken(token) {
  return crypto.createHash('sha256').update(String(token), 'utf8').digest();
}

function verifyIntakeToken(token, storedHash) {
  if (!token || !storedHash) return false;
  const computed = hashIntakeToken(token);
  const stored = Buffer.isBuffer(storedHash) ? storedHash : Buffer.from(storedHash);
  if (computed.length !== stored.length) return false;
  return crypto.timingSafeEqual(computed, stored);
}

function persistIntake(data) {
  const intakeToken = generateIntakeToken();
  const intakeTokenHash = hashIntakeToken(intakeToken);
  const db = getDb();
  const phoneJson = JSON.stringify({
    ddi: data.phone.ddi,
    ddd: data.phone.ddd,
    telefone: data.phone.telefone,
    display: data.phone.display,
    whatsapp: data.phone.whatsapp,
  });

  const sensitive = encryptIntakeSensitiveFields({
    nome_paciente: data.nomePaciente,
    edad: data.edad,
    tipo_atencion: data.tipoAtencion,
    prioridad: data.prioridad,
    sintomas: data.sintomas,
    observaciones: data.observaciones || '',
  });

  const insert = db.prepare(`
    INSERT INTO sos_intakes (
      protocolo, intake_token_hash, nome, email, phone_json, relacion, nome_paciente, edad,
      ubicacion, tipo_atencion, prioridad, sintomas, observaciones, status, referral_source,
      lgpd_privacy_accepted, lgpd_privacy_version, lgpd_privacy_at
    ) VALUES (
      @protocolo, @intake_token_hash, @nome, @email, @phone_json, @relacion, @nome_paciente, @edad,
      @ubicacion, @tipo_atencion, @prioridad, @sintomas, @observaciones, 'nova', @referral_source,
      @lgpd_privacy_accepted, @lgpd_privacy_version, @lgpd_privacy_at
    )
  `);

  const logInsert = db.prepare(`
    INSERT INTO sos_intake_log (intake_id, old_status, new_status, note, changed_by)
    VALUES (@intake_id, NULL, 'nova', 'Solicitud recibida via formulario web', 'system')
  `);

  const tx = db.transaction(() => {
    const result = insert.run({
      protocolo: data.protocolo,
      intake_token_hash: intakeTokenHash,
      nome: data.nome,
      email: data.email,
      phone_json: phoneJson,
      relacion: data.relacion,
      nome_paciente: sensitive.nome_paciente,
      edad: sensitive.edad,
      ubicacion: data.ubicacion,
      tipo_atencion: sensitive.tipo_atencion,
      prioridad: sensitive.prioridad,
      sintomas: sensitive.sintomas,
      observaciones: sensitive.observaciones,
      referral_source: data.referralSource || null,
      lgpd_privacy_accepted: data.lgpdPrivacy?.accepted ? 1 : 0,
      lgpd_privacy_version: data.lgpdPrivacy?.version || null,
      lgpd_privacy_at: data.lgpdPrivacy?.timestamp || null,
    });
    logInsert.run({ intake_id: result.lastInsertRowid });
    return result.lastInsertRowid;
  });

  tx();
  return { intakeToken };
}

module.exports = {
  persistIntake,
  verifyIntakeToken,
  hashIntakeToken,
  generateIntakeToken,
};
