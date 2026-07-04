const {
  getDb,
  getConfig,
  parseJsonArray,
  rowToTemplate,
  rowToVolunteer,
  formatDateLocal,
} = require('./db');

function getZonedParts(date, timezone) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const weekdayMap = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    dayOfWeek: weekdayMap[parts.weekday] ?? 0,
    minutesSinceMidnight: Number(parts.hour) * 60 + Number(parts.minute),
  };
}

function parseTimeToMinutes(timeStr) {
  const [h, m] = String(timeStr).split(':').map(Number);
  return h * 60 + (m || 0);
}

function isTemplateActiveNow(template, zoned) {
  const days = parseJsonArray(template.dias_semana);
  if (!days.includes(zoned.dayOfWeek)) return false;
  const start = parseTimeToMinutes(template.start_time);
  const end = parseTimeToMinutes(template.end_time);
  const now = zoned.minutesSinceMidnight;
  return now >= start && now < end;
}

const { buildWaLink } = require('./wa-message');
const { getSiteBaseUrl, getCanonicalUrls } = require('./utm-links');
const { getHubsPublishedCount } = require('./hubs');
const { getCurrentMetrics } = require('./metrics');

const ROLE_PUBLIC_LABELS = {
  triagem: 'Voluntário de triagem',
  cadastro_wa: 'Voluntário de cadastro',
  coordenador: 'Coordenador de plantão',
  backup: 'Voluntário de respaldo',
};

function volunteerInitials(nome) {
  if (!nome) return null;
  const parts = String(nome).trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return null;
  if (parts.length === 1) return `${parts[0].charAt(0).toUpperCase()}.`;
  return `${parts[0].charAt(0).toUpperCase()}. ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}

function publicVolunteerDisplay(role, volunteerNome) {
  const roleLabel = ROLE_PUBLIC_LABELS[role] || 'Voluntário de plantão';
  if (!volunteerNome) return 'Sem voluntário escalado';
  const initials = volunteerInitials(volunteerNome);
  return initials ? `${roleLabel} (${initials})` : roleLabel;
}

function getPublicInfo(req, options = {}) {
  const { anonymizeVolunteers = false } = options;
  const db = getDb();
  const config = getConfig(db);
  const siteBase = getSiteBaseUrl(req);
  const timezone = config.timezone || 'America/Sao_Paulo';
  const now = new Date();
  const zoned = getZonedParts(now, timezone);

  const templates = db
    .prepare('SELECT * FROM sos_shift_templates ORDER BY ordem ASC')
    .all()
    .map(rowToTemplate);

  const activeTemplates = templates.filter((t) => isTemplateActiveNow(t, zoned));

  const scheduleToday = db
    .prepare(
      `SELECT s.*, t.nome AS shift_nome, t.start_time, t.end_time, t.role,
              v.nome AS volunteer_nome
       FROM sos_schedule s
       JOIN sos_shift_templates t ON t.id = s.shift_template_id
       LEFT JOIN sos_volunteers v ON v.id = s.volunteer_id
       WHERE s.date = ?
       ORDER BY t.ordem ASC`
    )
    .all(zoned.date);

  const currentShifts = [];
  for (const tpl of activeTemplates) {
    const sched = scheduleToday.find((s) => s.shift_template_id === tpl.id);
    currentShifts.push({
      nome: tpl.nome,
      role: tpl.role,
      volunteerDisplay: anonymizeVolunteers
        ? publicVolunteerDisplay(tpl.role, sched?.volunteer_nome)
        : sched?.volunteer_nome || 'Sem voluntário escalado',
    });
  }

  const shiftsToday = scheduleToday.map((s) => ({
    nome: s.shift_nome,
    start: s.start_time,
    end: s.end_time,
    role: s.role,
    volunteer: anonymizeVolunteers
      ? s.volunteer_nome
        ? volunteerInitials(s.volunteer_nome)
        : null
      : s.volunteer_nome || null,
  }));

  const isOpen = activeTemplates.length > 0;

  let nextOpenAt = null;
  if (!isOpen) {
    nextOpenAt = findNextOpenAt(templates, timezone, now);
  }

  const number = config.whatsapp_number;
  return {
    timezone,
    isOpen,
    currentShifts,
    nextOpenAt,
    shiftsToday,
    whatsapp: {
      number,
      linkGeneral: buildWaLink(number, config.whatsapp_message_general),
      linkRegistro: buildWaLink(number, config.whatsapp_message_registro),
    },
    outOfHoursMessage: {
      es: config.out_of_hours_message_es,
      pt: config.out_of_hours_message_pt,
    },
    canonicalUrls: getCanonicalUrls(siteBase),
  };
}

function findNextOpenAt(templates, timezone, fromDate) {
  for (let dayOffset = 0; dayOffset <= 7; dayOffset++) {
    const d = new Date(fromDate.getTime() + dayOffset * 86400000);
    const zoned = getZonedParts(d, timezone);
    for (const tpl of templates) {
      const days = parseJsonArray(tpl.dias_semana);
      if (!days.includes(zoned.dayOfWeek)) continue;
      const startMin = parseTimeToMinutes(tpl.start_time);
      if (dayOffset === 0 && zoned.minutesSinceMidnight >= startMin) continue;
      const [sh, sm] = tpl.start_time.split(':');
      const isoDate = zoned.date;
      return `${isoDate}T${sh.padStart(2, '0')}:${(sm || '00').padStart(2, '0')}:00-03:00`;
    }
  }
  return null;
}

function getDashboardSummary() {
  const db = getDb();
  const today = formatDateLocal(new Date());
  const byStatus = db
    .prepare(
      `SELECT status, COUNT(*) AS c FROM sos_intakes GROUP BY status`
    )
    .all();
  const todayCount = db
    .prepare(`SELECT COUNT(*) AS c FROM sos_intakes WHERE date(created_at) = date(?)`)
    .get(today).c;
  const publicInfo = getPublicInfo();
  const hubsPublished = getHubsPublishedCount(db);
  const hubsTotal = db.prepare('SELECT COUNT(*) AS c FROM sos_hubs').get().c;
  const metrics = getCurrentMetrics();
  return {
    intakesToday: todayCount,
    byStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.c])),
    turnoAgora: publicInfo.currentShifts,
    isOpen: publicInfo.isOpen,
    nextOpenAt: publicInfo.nextOpenAt,
    hubsPublished,
    hubsTotal,
    partnershipsAtivas: metrics.partnerships.ativas,
    partnershipsEmConversa: metrics.partnerships.em_conversa,
    partnershipsTotal: metrics.partnerships.total,
    weekIntakes: metrics.weekIntakes,
  };
}

module.exports = {
  getPublicInfo,
  getDashboardSummary,
  getZonedParts,
  isTemplateActiveNow,
};
