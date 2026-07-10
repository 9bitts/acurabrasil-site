const { decryptIntakeRow } = require('./field-crypto');

function toIsoUtc(sqliteDatetime) {
  if (!sqliteDatetime) return new Date().toISOString();
  const raw = String(sqliteDatetime).trim();
  if (raw.includes('T')) return new Date(raw).toISOString();
  return new Date(`${raw.replace(' ', 'T')}Z`).toISOString();
}

function mapLogEvents(logRows) {
  return (logRows || []).map((row) => ({
    externalId: `acura-log-${row.id}`,
    type: row.old_status ? 'STATUS_CHANGED' : 'FORM_SUBMITTED',
    occurredAt: toIsoUtc(row.changed_at),
    payload: {
      oldStatus: row.old_status,
      newStatus: row.new_status,
      note: row.note,
      changedBy: row.changed_by,
    },
  }));
}

function buildPayloadFromIntake(intake, logRows, volunteerLabel) {
  const row = decryptIntakeRow(intake);
  const phone =
    typeof row.phone_json === 'string'
      ? JSON.parse(row.phone_json)
      : row.phone_json || row.phone || {};

  const patientName = row.nome_paciente || row.nome;
  const age =
    row.edad != null && Number.isFinite(Number(row.edad)) ? Number(row.edad) : null;

  const payload = {
    protocolo: row.protocolo,
    submittedAt: toIsoUtc(row.created_at),
    requester: {
      name: row.nome,
      email: row.email,
      phone: {
        ddi: phone.ddi,
        ddd: phone.ddd,
        telefone: phone.telefone,
        display: phone.display,
        whatsapp: !!phone.whatsapp,
      },
    },
    patient: {
      name: patientName,
      age,
      relationship: row.relacion,
      location: row.ubicacion,
    },
    clinical: {
      careType: row.tipo_atencion,
      priority: row.prioridad,
      symptoms: row.sintomas,
      notes: row.observaciones || '',
    },
    acuraStatus: row.status,
    triageNotes: row.triagem_notes || '',
    assignedVolunteerLabel: volunteerLabel ?? null,
    referralSource: row.referral_source || null,
    clicks: {
      doctor8RegisterAt: row.clicked_doctor8_register_at
        ? toIsoUtc(row.clicked_doctor8_register_at)
        : null,
      doctor8LoginAt: row.clicked_doctor8_login_at
        ? toIsoUtc(row.clicked_doctor8_login_at)
        : null,
      whatsappHelpAt: row.clicked_whatsapp_help_at
        ? toIsoUtc(row.clicked_whatsapp_help_at)
        : null,
    },
    doctor8: {
      registeredFlag: !!row.doctor8_registered,
      emailCheckedAt: row.doctor8_email_checked_at
        ? toIsoUtc(row.doctor8_email_checked_at)
        : null,
      emailStatus: row.doctor8_email_status || null,
    },
    lgpd: {
      accepted: !!row.lgpd_privacy_accepted,
      version: row.lgpd_privacy_version || null,
      at: row.lgpd_privacy_at ? toIsoUtc(row.lgpd_privacy_at) : null,
    },
    events: mapLogEvents(logRows),
  };

  if (row.clicked_doctor8_register_at) {
    payload.events.push({
      externalId: `acura-click-reg-${row.protocolo}`,
      type: 'CLICKED_DOCTOR8_REGISTER',
      occurredAt: toIsoUtc(row.clicked_doctor8_register_at),
      payload: {},
    });
  }
  if (row.clicked_doctor8_login_at) {
    payload.events.push({
      externalId: `acura-click-login-${row.protocolo}`,
      type: 'CLICKED_DOCTOR8_LOGIN',
      occurredAt: toIsoUtc(row.clicked_doctor8_login_at),
      payload: {},
    });
  }
  if (row.clicked_whatsapp_help_at) {
    payload.events.push({
      externalId: `acura-click-wa-${row.protocolo}`,
      type: 'CLICKED_WHATSAPP_HELP',
      occurredAt: toIsoUtc(row.clicked_whatsapp_help_at),
      payload: {},
    });
  }
  if (row.doctor8_email_checked_at) {
    payload.events.push({
      externalId: `acura-d8-check-${row.protocolo}`,
      type: 'DOCTOR8_EMAIL_VERIFIED',
      occurredAt: toIsoUtc(row.doctor8_email_checked_at),
      payload: { status: row.doctor8_email_status },
    });
  }

  return payload;
}

function buildPatchFromIntake(intake, logRows, volunteerLabel, extraEvents) {
  const row = decryptIntakeRow(intake);
  const patch = {
    acuraStatus: row.status,
    triageNotes: row.triagem_notes || '',
    assignedVolunteerLabel: volunteerLabel ?? null,
    clicks: {
      doctor8RegisterAt: row.clicked_doctor8_register_at
        ? toIsoUtc(row.clicked_doctor8_register_at)
        : null,
      doctor8LoginAt: row.clicked_doctor8_login_at
        ? toIsoUtc(row.clicked_doctor8_login_at)
        : null,
      whatsappHelpAt: row.clicked_whatsapp_help_at
        ? toIsoUtc(row.clicked_whatsapp_help_at)
        : null,
    },
    doctor8: {
      registeredFlag: !!row.doctor8_registered,
      emailCheckedAt: row.doctor8_email_checked_at
        ? toIsoUtc(row.doctor8_email_checked_at)
        : null,
      emailStatus: row.doctor8_email_status || null,
    },
    events: [...mapLogEvents(logRows), ...(extraEvents || [])],
  };
  return patch;
}

module.exports = {
  buildPayloadFromIntake,
  buildPatchFromIntake,
  toIsoUtc,
};
