const { getDb } = require('./db');

function persistIntake(data) {
  const db = getDb();
  const phoneJson = JSON.stringify({
    ddi: data.phone.ddi,
    ddd: data.phone.ddd,
    telefone: data.phone.telefone,
    display: data.phone.display,
    whatsapp: data.phone.whatsapp,
  });

  const insert = db.prepare(`
    INSERT INTO sos_intakes (
      protocolo, nome, email, phone_json, relacion, nome_paciente, edad,
      ubicacion, tipo_atencion, prioridad, sintomas, observaciones, status
    ) VALUES (
      @protocolo, @nome, @email, @phone_json, @relacion, @nome_paciente, @edad,
      @ubicacion, @tipo_atencion, @prioridad, @sintomas, @observaciones, 'nova'
    )
  `);

  const logInsert = db.prepare(`
    INSERT INTO sos_intake_log (intake_id, old_status, new_status, note, changed_by)
    VALUES (@intake_id, NULL, 'nova', 'Solicitud recibida via formulario web', 'system')
  `);

  const tx = db.transaction(() => {
    const result = insert.run({
      protocolo: data.protocolo,
      nome: data.nome,
      email: data.email,
      phone_json: phoneJson,
      relacion: data.relacion,
      nome_paciente: data.nomePaciente,
      edad: data.edad,
      ubicacion: data.ubicacion,
      tipo_atencion: data.tipoAtencion,
      prioridad: data.prioridad,
      sintomas: data.sintomas,
      observaciones: data.observaciones || '',
    });
    logInsert.run({ intake_id: result.lastInsertRowid });
    return result.lastInsertRowid;
  });

  return tx();
}

module.exports = { persistIntake };
