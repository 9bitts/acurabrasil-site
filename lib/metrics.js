const { getDb, formatDateLocal } = require('./db');
const { getHubsPublishedCount } = require('./hubs');

function addDaysStr(dateStr, days) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return formatDateLocal(d);
}

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return formatDateLocal(d);
}

function computeWeeklyIntakeCounts(db, weekStart) {
  const weekEnd = addDaysStr(weekStart, 6);
  return {
    intakes_total: db
      .prepare(
        `SELECT COUNT(*) AS c FROM sos_intakes WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)`
      )
      .get(weekStart, weekEnd).c,
    intakes_nova: db.prepare(`SELECT COUNT(*) AS c FROM sos_intakes WHERE status = 'nova'`).get().c,
    intakes_concluido: db
      .prepare(
        `SELECT COUNT(*) AS c FROM sos_intakes WHERE status = 'concluido' AND date(updated_at) >= date(?) AND date(updated_at) <= date(?)`
      )
      .get(weekStart, weekEnd).c,
    hubs_publicados: getHubsPublishedCount(db),
  };
}

function getCurrentMetrics() {
  const db = getDb();
  const weekStart = getWeekStart();

  const statusRows = db.prepare(`SELECT status, COUNT(*) AS c FROM sos_intakes GROUP BY status`).all();
  const intakes = Object.fromEntries(statusRows.map((r) => [r.status, r.c]));

  const weekIntakes = db
    .prepare(
      `SELECT COUNT(*) AS c FROM sos_intakes WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)`
    )
    .get(weekStart, addDaysStr(weekStart, 6)).c;

  const hubsTotal = db.prepare('SELECT COUNT(*) AS c FROM sos_hubs').get().c;
  const partnershipsTotal = db.prepare('SELECT COUNT(*) AS c FROM sos_partnerships').get().c;
  const partnershipsAtivas = db
    .prepare(`SELECT COUNT(*) AS c FROM sos_partnerships WHERE status = 'parceria_ativa'`)
    .get().c;
  const partnershipsEmConversa = db
    .prepare(`SELECT COUNT(*) AS c FROM sos_partnerships WHERE status = 'em_conversa'`)
    .get().c;

  const referralRows = db
    .prepare(
      `SELECT COALESCE(referral_source, 'direct') AS src, COUNT(*) AS c FROM sos_intakes GROUP BY src ORDER BY c DESC LIMIT 15`
    )
    .all();

  return {
    intakes,
    hubs: { publicados: getHubsPublishedCount(db), total: hubsTotal || 4 },
    partnerships: {
      ativas: partnershipsAtivas,
      em_conversa: partnershipsEmConversa,
      total: partnershipsTotal,
    },
    weekIntakes,
    weekStart,
    referralBreakdown: referralRows,
  };
}

function listSnapshots(db) {
  return db
    .prepare('SELECT * FROM sos_metrics_snapshots ORDER BY week_start DESC LIMIT 52')
    .all();
}

function createOrUpdateSnapshot(db, weekStart, notas = '') {
  const counts = computeWeeklyIntakeCounts(db, weekStart);
  const existing = db.prepare('SELECT id FROM sos_metrics_snapshots WHERE week_start = ?').get(weekStart);

  if (existing) {
    db.prepare(
      `UPDATE sos_metrics_snapshots SET
        intakes_total = @intakes_total, intakes_nova = @intakes_nova,
        intakes_concluido = @intakes_concluido, hubs_publicados = @hubs_publicados,
        notas = @notas, updated_at = datetime('now')
       WHERE week_start = @week_start`
    ).run({ week_start: weekStart, notas, ...counts });
    return db.prepare('SELECT * FROM sos_metrics_snapshots WHERE week_start = ?').get(weekStart);
  }

  const result = db
    .prepare(
      `INSERT INTO sos_metrics_snapshots (week_start, intakes_total, intakes_nova, intakes_concluido, hubs_publicados, notas)
       VALUES (@week_start, @intakes_total, @intakes_nova, @intakes_concluido, @hubs_publicados, @notas)`
    )
    .run({ week_start: weekStart, notas, ...counts });

  return db.prepare('SELECT * FROM sos_metrics_snapshots WHERE id = ?').get(result.lastInsertRowid);
}

module.exports = {
  getWeekStart,
  getCurrentMetrics,
  listSnapshots,
  createOrUpdateSnapshot,
  computeWeeklyIntakeCounts,
};
