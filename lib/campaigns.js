const { getDb, parseJsonArray } = require('./db');

const VALID_TYPES = ['emergency', 'project', 'research', 'evergreen', 'matching', 'in_kind'];
const VALID_STATUSES = ['draft', 'scheduled', 'published', 'paused', 'closed'];
const VALID_DESTINATIONS = ['humanitaria', 'pesquisa', 'geral'];
const PUBLIC_STATUSES = new Set(['published', 'paused', 'closed']);
const DEFAULT_SUGGESTED = [30, 50, 100, 250, 500, 1000];

function sanitizeStr(val, max = 500) {
  return String(val == null ? '' : val)
    .replace(/[\r\n\t]/g, ' ')
    .trim()
    .slice(0, max);
}

function sanitizeMultiline(val, max = 20000) {
  return String(val == null ? '' : val)
    .replace(/\r\n/g, '\n')
    .trim()
    .slice(0, max);
}

function slugify(input) {
  return String(input || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

function parseJsonField(str, fallback) {
  if (str == null || str === '') return fallback;
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(str);
  } catch {
    return fallback;
  }
}

function bool(v, fallback = false) {
  if (v === true || v === 1 || v === '1' || v === 'true') return true;
  if (v === false || v === 0 || v === '0' || v === 'false') return false;
  return fallback;
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function rowToCampaign(row, { includeInternal = false } = {}) {
  if (!row) return null;
  const campaign = {
    id: row.id,
    slug: row.slug,
    type: row.type,
    status: row.status,
    title_pt: row.title_pt,
    title_es: row.title_es,
    summary_pt: row.summary_pt,
    summary_es: row.summary_es,
    body_pt: row.body_pt,
    body_es: row.body_es,
    cover_url: row.cover_url,
    video_url: row.video_url || '',
    gallery: parseJsonField(row.gallery_json, []),
    goal_amount: num(row.goal_amount),
    raised_amount: num(row.raised_amount),
    donor_count: num(row.donor_count),
    show_thermometer: !!row.show_thermometer,
    accepts_donation: !!row.accepts_donation,
    allow_once: !!row.allow_once,
    allow_monthly: !!row.allow_monthly,
    min_amount: num(row.min_amount, 5),
    max_amount: num(row.max_amount, 50000),
    suggested_amounts: parseJsonField(row.suggested_amounts_json, DEFAULT_SUGGESTED),
    attachments: parseJsonField(row.attachments_json, []),
    destination: row.destination || 'humanitaria',
    impact_text_pt: row.impact_text_pt || '',
    impact_text_es: row.impact_text_es || '',
    matching_text_pt: row.matching_text_pt || '',
    matching_text_es: row.matching_text_es || '',
    matching_cap: num(row.matching_cap),
    enable_pix: !!row.enable_pix,
    enable_paypal: !!row.enable_paypal,
    enable_paypal_monthly: !!row.enable_paypal_monthly,
    show_donor_wall: !!row.show_donor_wall,
    show_donor_amounts: !!row.show_donor_amounts,
    ends_at: row.ends_at || null,
    publish_at: row.publish_at || null,
    featured: !!row.featured,
    sort_order: num(row.sort_order),
    secondary_cta_label_pt: row.secondary_cta_label_pt || '',
    secondary_cta_label_es: row.secondary_cta_label_es || '',
    secondary_cta_url: row.secondary_cta_url || '',
    seo_title_pt: row.seo_title_pt || '',
    seo_title_es: row.seo_title_es || '',
    seo_description_pt: row.seo_description_pt || '',
    seo_description_es: row.seo_description_es || '',
    utm_campaign: row.utm_campaign || row.slug,
    created_at: row.created_at,
    updated_at: row.updated_at,
    progress_pct:
      num(row.goal_amount) > 0
        ? Math.min(100, Math.round((num(row.raised_amount) / num(row.goal_amount)) * 100))
        : null,
  };

  if (includeInternal) {
    campaign.internal_notes = row.internal_notes || '';
    campaign.internal_owner = row.internal_owner || '';
    campaign.cost_center = row.cost_center || '';
  }

  return campaign;
}

function listCampaignsAdmin({ status, type, q } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM campaigns WHERE 1=1';
  const params = [];
  if (status && VALID_STATUSES.includes(status)) {
    sql += ' AND status = ?';
    params.push(status);
  }
  if (type && VALID_TYPES.includes(type)) {
    sql += ' AND type = ?';
    params.push(type);
  }
  if (q) {
    const like = `%${sanitizeStr(q, 80)}%`;
    sql += ' AND (title_pt LIKE ? OR title_es LIKE ? OR slug LIKE ?)';
    params.push(like, like, like);
  }
  sql += ' ORDER BY featured DESC, sort_order ASC, updated_at DESC';
  return db.prepare(sql).all(...params).map((r) => rowToCampaign(r, { includeInternal: true }));
}

function getCampaignById(id, opts) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  return rowToCampaign(row, opts);
}

function getCampaignBySlug(slug, opts) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM campaigns WHERE slug = ?').get(sanitizeStr(slug, 80));
  return rowToCampaign(row, opts);
}

function listPublicCampaigns({ type, includeClosed = false } = {}) {
  const db = getDb();
  const statuses = includeClosed
    ? ['published', 'paused', 'closed']
    : ['published', 'paused'];
  const placeholders = statuses.map(() => '?').join(',');
  let sql = `SELECT * FROM campaigns WHERE status IN (${placeholders})`;
  const params = [...statuses];
  if (type && VALID_TYPES.includes(type)) {
    sql += ' AND type = ?';
    params.push(type);
  }
  sql += ` ORDER BY
    CASE type WHEN 'emergency' THEN 0 ELSE 1 END,
    featured DESC,
    sort_order ASC,
    updated_at DESC`;
  return db.prepare(sql).all(...params).map((r) => rowToCampaign(r));
}

function getUpdates(campaignId, { publishedOnly = false } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM campaign_updates WHERE campaign_id = ?';
  if (publishedOnly) sql += ' AND published = 1';
  sql += ' ORDER BY created_at DESC';
  return db.prepare(sql).all(campaignId).map((u) => ({
    id: u.id,
    campaign_id: u.campaign_id,
    title_pt: u.title_pt,
    title_es: u.title_es,
    body_pt: u.body_pt,
    body_es: u.body_es,
    published: !!u.published,
    created_at: u.created_at,
  }));
}

function getFaqs(campaignId) {
  const db = getDb();
  return db
    .prepare('SELECT * FROM campaign_faqs WHERE campaign_id = ? ORDER BY sort_order ASC, id ASC')
    .all(campaignId)
    .map((f) => ({
      id: f.id,
      campaign_id: f.campaign_id,
      question_pt: f.question_pt,
      question_es: f.question_es,
      answer_pt: f.answer_pt,
      answer_es: f.answer_es,
      sort_order: f.sort_order,
    }));
}

function getDonorWall(campaignId, { showAmounts = true, limit = 20 } = {}) {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT donor_name, amount, anonymous, created_at, status
       FROM donations
       WHERE campaign_id = ? AND status IN ('confirmed', 'reported')
       ORDER BY created_at DESC
       LIMIT ?`
    )
    .all(campaignId, limit);
  return rows.map((r) => ({
    name: r.anonymous || !r.donor_name ? null : sanitizeStr(r.donor_name, 80),
    amount: showAmounts ? num(r.amount) : null,
    created_at: r.created_at,
    status: r.status,
  }));
}

function normalizePayload(body, { partial = false } = {}) {
  const out = {};

  const setStr = (key, max, multiline = false) => {
    if (body[key] == null && partial) return;
    out[key] = multiline ? sanitizeMultiline(body[key], max) : sanitizeStr(body[key], max);
  };

  if (body.slug != null || !partial) {
    const rawSlug = body.slug != null ? body.slug : body.title_pt;
    out.slug = slugify(rawSlug);
    if (!out.slug) throw Object.assign(new Error('slug_required'), { code: 'validation' });
  }

  if (body.type != null || !partial) {
    out.type = VALID_TYPES.includes(body.type) ? body.type : 'project';
  }
  if (body.status != null || !partial) {
    out.status = VALID_STATUSES.includes(body.status) ? body.status : 'draft';
  }

  setStr('title_pt', 200);
  setStr('title_es', 200);
  setStr('summary_pt', 400);
  setStr('summary_es', 400);
  setStr('body_pt', 20000, true);
  setStr('body_es', 20000, true);
  setStr('cover_url', 500);
  setStr('video_url', 500);
  setStr('impact_text_pt', 300);
  setStr('impact_text_es', 300);
  setStr('matching_text_pt', 300);
  setStr('matching_text_es', 300);
  setStr('secondary_cta_label_pt', 120);
  setStr('secondary_cta_label_es', 120);
  setStr('secondary_cta_url', 500);
  setStr('seo_title_pt', 200);
  setStr('seo_title_es', 200);
  setStr('seo_description_pt', 300);
  setStr('seo_description_es', 300);
  setStr('utm_campaign', 80);
  setStr('internal_notes', 4000, true);
  setStr('internal_owner', 120);
  setStr('cost_center', 120);

  if (!partial) {
    if (!out.title_pt || !out.title_es) {
      throw Object.assign(new Error('title_required'), { code: 'validation' });
    }
    if (!out.summary_pt || !out.summary_es) {
      throw Object.assign(new Error('summary_required'), { code: 'validation' });
    }
    if (!out.body_pt || !out.body_es) {
      throw Object.assign(new Error('body_required'), { code: 'validation' });
    }
    if (!out.cover_url) {
      throw Object.assign(new Error('cover_required'), { code: 'validation' });
    }
  }

  if (body.destination != null || !partial) {
    out.destination = VALID_DESTINATIONS.includes(body.destination)
      ? body.destination
      : 'humanitaria';
  }

  if (body.gallery != null || body.gallery_json != null || !partial) {
    const gal = body.gallery != null ? body.gallery : parseJsonField(body.gallery_json, []);
    out.gallery_json = JSON.stringify(
      (Array.isArray(gal) ? gal : [])
        .map((u) => sanitizeStr(u, 500))
        .filter(Boolean)
        .slice(0, 8)
    );
  }

  if (body.suggested_amounts != null || body.suggested_amounts_json != null || !partial) {
    const raw =
      body.suggested_amounts != null
        ? body.suggested_amounts
        : parseJsonField(body.suggested_amounts_json, DEFAULT_SUGGESTED);
    const amounts = (Array.isArray(raw) ? raw : DEFAULT_SUGGESTED)
      .map((n) => num(n))
      .filter((n) => n >= 5 && n <= 50000)
      .slice(0, 12);
    out.suggested_amounts_json = JSON.stringify(amounts.length ? amounts : DEFAULT_SUGGESTED);
  }

  if (body.attachments != null || body.attachments_json != null || !partial) {
    const raw =
      body.attachments != null ? body.attachments : parseJsonField(body.attachments_json, []);
    const list = (Array.isArray(raw) ? raw : [])
      .map((item) => ({
        title_pt: sanitizeStr(item.title_pt || item.title || '', 200),
        title_es: sanitizeStr(item.title_es || item.title || '', 200),
        url: sanitizeStr(item.url || '', 500),
      }))
      .filter((item) => item.url)
      .slice(0, 10);
    out.attachments_json = JSON.stringify(list);
  }

  const numFields = [
    'goal_amount',
    'raised_amount',
    'donor_count',
    'min_amount',
    'max_amount',
    'matching_cap',
    'sort_order',
  ];
  for (const key of numFields) {
    if (body[key] != null || !partial) {
      out[key] = num(body[key], key === 'min_amount' ? 5 : key === 'max_amount' ? 50000 : 0);
    }
  }

  const boolFields = [
    'show_thermometer',
    'accepts_donation',
    'allow_once',
    'allow_monthly',
    'enable_pix',
    'enable_paypal',
    'enable_paypal_monthly',
    'show_donor_wall',
    'show_donor_amounts',
    'featured',
  ];
  const boolDefaults = {
    show_thermometer: true,
    accepts_donation: true,
    allow_once: true,
    allow_monthly: true,
    enable_pix: false,
    enable_paypal: true,
    enable_paypal_monthly: true,
    show_donor_wall: true,
    show_donor_amounts: false,
    featured: false,
  };
  for (const key of boolFields) {
    if (body[key] != null || !partial) {
      out[key] = bool(body[key], boolDefaults[key]) ? 1 : 0;
    }
  }

  if (body.ends_at !== undefined || !partial) {
    out.ends_at = body.ends_at ? sanitizeStr(body.ends_at, 40) : null;
  }
  if (body.publish_at !== undefined || !partial) {
    out.publish_at = body.publish_at ? sanitizeStr(body.publish_at, 40) : null;
  }

  return out;
}

function createCampaign(body) {
  const db = getDb();
  const data = normalizePayload(body, { partial: false });
  const existing = db.prepare('SELECT id FROM campaigns WHERE slug = ?').get(data.slug);
  if (existing) {
    throw Object.assign(new Error('slug_taken'), { code: 'conflict' });
  }

  const result = db
    .prepare(
      `INSERT INTO campaigns (
        slug, type, status,
        title_pt, title_es, summary_pt, summary_es, body_pt, body_es,
        cover_url, video_url, gallery_json, attachments_json,
        goal_amount, raised_amount, donor_count,
        show_thermometer, accepts_donation, allow_once, allow_monthly,
        min_amount, max_amount, suggested_amounts_json, destination,
        impact_text_pt, impact_text_es, matching_text_pt, matching_text_es, matching_cap,
        enable_pix, enable_paypal, enable_paypal_monthly,
        show_donor_wall, show_donor_amounts,
        ends_at, publish_at, featured, sort_order,
        secondary_cta_label_pt, secondary_cta_label_es, secondary_cta_url,
        seo_title_pt, seo_title_es, seo_description_pt, seo_description_es,
        utm_campaign, internal_notes, internal_owner, cost_center,
        updated_at
      ) VALUES (
        @slug, @type, @status,
        @title_pt, @title_es, @summary_pt, @summary_es, @body_pt, @body_es,
        @cover_url, @video_url, @gallery_json, @attachments_json,
        @goal_amount, @raised_amount, @donor_count,
        @show_thermometer, @accepts_donation, @allow_once, @allow_monthly,
        @min_amount, @max_amount, @suggested_amounts_json, @destination,
        @impact_text_pt, @impact_text_es, @matching_text_pt, @matching_text_es, @matching_cap,
        @enable_pix, @enable_paypal, @enable_paypal_monthly,
        @show_donor_wall, @show_donor_amounts,
        @ends_at, @publish_at, @featured, @sort_order,
        @secondary_cta_label_pt, @secondary_cta_label_es, @secondary_cta_url,
        @seo_title_pt, @seo_title_es, @seo_description_pt, @seo_description_es,
        @utm_campaign, @internal_notes, @internal_owner, @cost_center,
        datetime('now')
      )`
    )
    .run({
      ...data,
      video_url: data.video_url || '',
      attachments_json: data.attachments_json || '[]',
      utm_campaign: data.utm_campaign || data.slug,
      internal_notes: data.internal_notes || '',
      internal_owner: data.internal_owner || '',
      cost_center: data.cost_center || '',
    });

  return getCampaignById(result.lastInsertRowid, { includeInternal: true });
}

function updateCampaign(id, body) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id);
  if (!existing) {
    throw Object.assign(new Error('not_found'), { code: 'not_found' });
  }

  const data = normalizePayload({
    ...existing,
    ...body,
    gallery: body.gallery ?? parseJsonField(existing.gallery_json, []),
    suggested_amounts:
      body.suggested_amounts ?? parseJsonField(existing.suggested_amounts_json, DEFAULT_SUGGESTED),
    attachments: body.attachments ?? parseJsonField(existing.attachments_json, []),
  }, { partial: false });

  if (data.slug !== existing.slug) {
    const clash = db.prepare('SELECT id FROM campaigns WHERE slug = ? AND id != ?').get(data.slug, id);
    if (clash) throw Object.assign(new Error('slug_taken'), { code: 'conflict' });
  }

  db.prepare(
    `UPDATE campaigns SET
      slug=@slug, type=@type, status=@status,
      title_pt=@title_pt, title_es=@title_es, summary_pt=@summary_pt, summary_es=@summary_es,
      body_pt=@body_pt, body_es=@body_es, cover_url=@cover_url, video_url=@video_url,
      gallery_json=@gallery_json, attachments_json=@attachments_json, goal_amount=@goal_amount, raised_amount=@raised_amount,
      donor_count=@donor_count, show_thermometer=@show_thermometer, accepts_donation=@accepts_donation,
      allow_once=@allow_once, allow_monthly=@allow_monthly, min_amount=@min_amount, max_amount=@max_amount,
      suggested_amounts_json=@suggested_amounts_json, destination=@destination,
      impact_text_pt=@impact_text_pt, impact_text_es=@impact_text_es,
      matching_text_pt=@matching_text_pt, matching_text_es=@matching_text_es, matching_cap=@matching_cap,
      enable_pix=@enable_pix, enable_paypal=@enable_paypal, enable_paypal_monthly=@enable_paypal_monthly,
      show_donor_wall=@show_donor_wall, show_donor_amounts=@show_donor_amounts,
      ends_at=@ends_at, publish_at=@publish_at, featured=@featured, sort_order=@sort_order,
      secondary_cta_label_pt=@secondary_cta_label_pt, secondary_cta_label_es=@secondary_cta_label_es,
      secondary_cta_url=@secondary_cta_url, seo_title_pt=@seo_title_pt, seo_title_es=@seo_title_es,
      seo_description_pt=@seo_description_pt, seo_description_es=@seo_description_es,
      utm_campaign=@utm_campaign, internal_notes=@internal_notes, internal_owner=@internal_owner,
      cost_center=@cost_center, updated_at=datetime('now')
    WHERE id=@id`
  ).run({
    ...data,
    id,
    video_url: data.video_url || '',
    attachments_json: data.attachments_json || '[]',
    utm_campaign: data.utm_campaign || data.slug,
    internal_notes: data.internal_notes || '',
    internal_owner: data.internal_owner || '',
    cost_center: data.cost_center || '',
  });

  return getCampaignById(id, { includeInternal: true });
}

function duplicateCampaign(id) {
  const c = getCampaignById(id, { includeInternal: true });
  if (!c) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  const baseSlug = `${c.slug}-copia`;
  let slug = baseSlug;
  let n = 2;
  while (getCampaignBySlug(slug)) {
    slug = `${baseSlug}-${n++}`;
  }
  return createCampaign({
    ...c,
    slug,
    status: 'draft',
    title_pt: `${c.title_pt} (cópia)`,
    title_es: `${c.title_es} (copia)`,
    raised_amount: 0,
    donor_count: 0,
    featured: false,
  });
}

function deleteCampaign(id) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(id);
  if (!existing) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
  return true;
}

function addUpdate(campaignId, body) {
  const db = getDb();
  if (!getCampaignById(campaignId)) {
    throw Object.assign(new Error('not_found'), { code: 'not_found' });
  }
  const result = db
    .prepare(
      `INSERT INTO campaign_updates (campaign_id, title_pt, title_es, body_pt, body_es, published)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      campaignId,
      sanitizeStr(body.title_pt, 200),
      sanitizeStr(body.title_es, 200),
      sanitizeMultiline(body.body_pt, 8000),
      sanitizeMultiline(body.body_es, 8000),
      bool(body.published, true) ? 1 : 0
    );
  return getUpdates(campaignId).find((u) => u.id === result.lastInsertRowid);
}

function deleteUpdate(campaignId, updateId) {
  const db = getDb();
  const result = db
    .prepare('DELETE FROM campaign_updates WHERE id = ? AND campaign_id = ?')
    .run(updateId, campaignId);
  if (!result.changes) throw Object.assign(new Error('not_found'), { code: 'not_found' });
}

function setFaqs(campaignId, faqs) {
  const db = getDb();
  if (!getCampaignById(campaignId)) {
    throw Object.assign(new Error('not_found'), { code: 'not_found' });
  }
  const list = Array.isArray(faqs) ? faqs.slice(0, 20) : [];
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM campaign_faqs WHERE campaign_id = ?').run(campaignId);
    const insert = db.prepare(
      `INSERT INTO campaign_faqs (campaign_id, question_pt, question_es, answer_pt, answer_es, sort_order)
       VALUES (?, ?, ?, ?, ?, ?)`
    );
    list.forEach((f, i) => {
      insert.run(
        campaignId,
        sanitizeStr(f.question_pt, 300),
        sanitizeStr(f.question_es, 300),
        sanitizeMultiline(f.answer_pt, 4000),
        sanitizeMultiline(f.answer_es, 4000),
        num(f.sort_order, i)
      );
    });
  });
  tx();
  return getFaqs(campaignId);
}

function listDonations(campaignId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM donations WHERE campaign_id = ? ORDER BY created_at DESC LIMIT 500`
    )
    .all(campaignId)
    .map((d) => ({
      id: d.id,
      campaign_id: d.campaign_id,
      amount: num(d.amount),
      currency: d.currency,
      method: d.method,
      status: d.status,
      frequency: d.frequency,
      provider_payment_id: d.provider_payment_id || '',
      donor_name: d.donor_name || '',
      donor_email: d.donor_email || '',
      anonymous: !!d.anonymous,
      badge_id: d.badge_id || '',
      notes: d.notes || '',
      created_at: d.created_at,
      confirmed_at: d.confirmed_at,
    }));
}

function createDonation(campaignId, body) {
  const db = getDb();
  const campaign = getCampaignById(campaignId);
  if (!campaign) throw Object.assign(new Error('not_found'), { code: 'not_found' });

  const amount = num(body.amount);
  if (amount < campaign.min_amount || amount > campaign.max_amount) {
    throw Object.assign(new Error('invalid_amount'), { code: 'validation' });
  }

  const method = ['pix', 'paypal', 'manual'].includes(body.method) ? body.method : 'pix';
  const status = ['reported', 'confirmed', 'pending', 'cancelled'].includes(body.status)
    ? body.status
    : 'reported';
  const frequency = body.frequency === 'monthly' ? 'monthly' : 'once';

  const result = db
    .prepare(
      `INSERT INTO donations (
        campaign_id, amount, currency, method, status, frequency,
        provider_payment_id, donor_name, donor_email, anonymous, badge_id, notes, confirmed_at
      ) VALUES (?, ?, 'BRL', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      campaignId,
      amount,
      method,
      status,
      frequency,
      sanitizeStr(body.provider_payment_id, 120),
      sanitizeStr(body.donor_name, 120),
      sanitizeStr(body.donor_email, 200),
      bool(body.anonymous) ? 1 : 0,
      sanitizeStr(body.badge_id, 40),
      sanitizeMultiline(body.notes, 2000),
      status === 'confirmed' ? new Date().toISOString() : null
    );

  if (status === 'confirmed' || (status === 'reported' && bool(body.bump_totals, true))) {
    bumpCampaignTotals(campaignId, amount, 1);
  }

  return listDonations(campaignId).find((d) => d.id === result.lastInsertRowid);
}

function bumpCampaignTotals(campaignId, amountDelta, donorDelta) {
  const db = getDb();
  db.prepare(
    `UPDATE campaigns SET
      raised_amount = MAX(0, raised_amount + ?),
      donor_count = MAX(0, donor_count + ?),
      updated_at = datetime('now')
    WHERE id = ?`
  ).run(amountDelta, donorDelta, campaignId);
}

function confirmDonation(donationId) {
  const db = getDb();
  const d = db.prepare('SELECT * FROM donations WHERE id = ?').get(donationId);
  if (!d) throw Object.assign(new Error('not_found'), { code: 'not_found' });
  if (d.status === 'confirmed') return d;
  db.prepare(
    `UPDATE donations SET status = 'confirmed', confirmed_at = datetime('now') WHERE id = ?`
  ).run(donationId);
  if (d.status !== 'reported') {
    bumpCampaignTotals(d.campaign_id, num(d.amount), 1);
  }
  return listDonations(d.campaign_id).find((x) => x.id === donationId);
}

function getPublicCampaignDetail(slug) {
  const campaign = getCampaignBySlug(slug);
  if (!campaign || !PUBLIC_STATUSES.has(campaign.status)) return null;
  return {
    campaign,
    updates: getUpdates(campaign.id, { publishedOnly: true }),
    faqs: getFaqs(campaign.id),
    donors: campaign.show_donor_wall
      ? getDonorWall(campaign.id, { showAmounts: campaign.show_donor_amounts })
      : [],
  };
}

function seedDefaultCampaigns(db) {
  const count = db.prepare('SELECT COUNT(*) AS c FROM campaigns').get().c;
  if (count > 0) return;

  const insert = db.prepare(
    `INSERT INTO campaigns (
      slug, type, status, title_pt, title_es, summary_pt, summary_es, body_pt, body_es,
      cover_url, goal_amount, raised_amount, donor_count, destination, featured, sort_order,
      impact_text_pt, impact_text_es, secondary_cta_label_pt, secondary_cta_label_es, secondary_cta_url,
      utm_campaign
    ) VALUES (
      @slug, @type, @status, @title_pt, @title_es, @summary_pt, @summary_es, @body_pt, @body_es,
      @cover_url, @goal_amount, @raised_amount, @donor_count, @destination, @featured, @sort_order,
      @impact_text_pt, @impact_text_es, @secondary_cta_label_pt, @secondary_cta_label_es, @secondary_cta_url,
      @utm_campaign
    )`
  );

  insert.run({
    slug: 'sos-venezuela',
    type: 'emergency',
    status: 'published',
    title_pt: 'SOS Saúde Venezuela',
    title_es: 'SOS Salud Venezuela',
    summary_pt:
      'Telemedicina gratuita para vítimas dos terremotos na Venezuela. Sua doação mantém voluntários e a operação humanitária.',
    summary_es:
      'Telemedicina gratuita para víctimas de los terremotos en Venezuela. Tu donación sostiene voluntarios y la operación humanitaria.',
    body_pt: `O SOS Saúde Venezuela oferece consultas médicas e psicológicas online, 100% gratuitas, para pessoas afetadas pelos terremotos.

Como sua doação ajuda:
- Manter a escala de profissionais voluntários
- Apoiar a triagem e o acompanhamento humanitário
- Fortalecer a infraestrutura de atendimento remoto

Cada contribuição fortalece uma rede de cuidado que já une a ACURABRASIL e a plataforma Doctor8.`,
    body_es: `SOS Salud Venezuela ofrece consultas médicas y psicológicas en línea, 100% gratuitas, para personas afectadas por los terremotos.

Cómo ayuda tu donación:
- Mantener la escala de profesionales voluntarios
- Apoyar el triaje y el acompañamiento humanitario
- Fortalecer la infraestructura de atención remota

Cada aporte fortalece una red de cuidado que une a ACURABRASIL y la plataforma Doctor8.`,
    cover_url: '/img/projetos/venezuela.webp',
    goal_amount: 50000,
    raised_amount: 0,
    donor_count: 0,
    destination: 'humanitaria',
    featured: 1,
    sort_order: 1,
    impact_text_pt: 'Sua doação ajuda a manter consultas gratuitas por telemedicina.',
    impact_text_es: 'Tu donación ayuda a mantener consultas gratuitas por telemedicina.',
    secondary_cta_label_pt: '',
    secondary_cta_label_es: '',
    secondary_cta_url: '',
    utm_campaign: 'sos-venezuela',
  });

  insert.run({
    slug: 'pesquisa-cientifica',
    type: 'research',
    status: 'published',
    title_pt: 'Pesquisa científica ACURABRASIL',
    title_es: 'Investigación científica ACURABRASIL',
    summary_pt:
      'Apoie estudos e projetos científicos que avançam o cuidado em saúde e o conhecimento brasileiro.',
    summary_es:
      'Apoya estudios y proyectos científicos que avanzan el cuidado en salud y el conocimiento brasileño.',
    body_pt: `A ACURABRASIL investe em pesquisa alinhada ao cuidado humanitário e à ciência aplicada.

Sua doação impulsiona:
- Projetos de investigação em saúde
- Divulgação científica responsável
- Formação e colaboração entre pesquisadores

Doações a partir de R$ 200 nesta campanha qualificam o selo Mecenas.`,
    body_es: `ACURABRASIL invierte en investigación alineada al cuidado humanitario y a la ciencia aplicada.

Tu donación impulsa:
- Proyectos de investigación en salud
- Divulgación científica responsable
- Formación y colaboración entre investigadores

Donaciones a partir de R$ 200 en esta campaña califican para el sello Mecenas.`,
    cover_url: '/img/projetos/ciencia.webp',
    goal_amount: 30000,
    raised_amount: 0,
    donor_count: 0,
    destination: 'pesquisa',
    featured: 0,
    sort_order: 2,
    impact_text_pt: 'Doações a partir de R$ 200 qualificam o selo Mecenas.',
    impact_text_es: 'Donaciones a partir de R$ 200 califican para el sello Mecenas.',
    secondary_cta_label_pt: 'Conhecer pesquisas',
    secondary_cta_label_es: 'Conocer investigaciones',
    secondary_cta_url: '/pesquisas',
    utm_campaign: 'pesquisa-cientifica',
  });

  insert.run({
    slug: 'fundo-institucional',
    type: 'evergreen',
    status: 'published',
    title_pt: 'Fundo institucional',
    title_es: 'Fondo institucional',
    summary_pt:
      'Doação contínua para a ACURABRASIL manter atendimento humanitário, operações e transparência.',
    summary_es:
      'Donación continua para que ACURABRASIL mantenga atención humanitaria, operaciones y transparencia.',
    body_pt: `O fundo institucional sustenta a operação permanente da OSCIP: atendimento, coordenação de voluntários, comunicação e prestação de contas.

Não há prazo de encerramento. Você pode doar uma vez ou mensalmente via PayPal.`,
    body_es: `El fondo institucional sostiene la operación permanente de la OSCIP: atención, coordinación de voluntarios, comunicación y rendición de cuentas.

No hay plazo de cierre. Puedes donar una vez o mensualmente vía PayPal.`,
    cover_url: '/img/og-share.png',
    goal_amount: 0,
    raised_amount: 0,
    donor_count: 0,
    destination: 'geral',
    featured: 0,
    sort_order: 10,
    impact_text_pt: 'Apoio contínuo à missão da ACURABRASIL.',
    impact_text_es: 'Apoyo continuo a la misión de ACURABRASIL.',
    secondary_cta_label_pt: 'Transparência',
    secondary_cta_label_es: 'Transparencia',
    secondary_cta_url: '/transparencia',
    utm_campaign: 'fundo-institucional',
  });

  console.log('Campaigns: seed de campanhas padrão criada');
}

module.exports = {
  VALID_TYPES,
  VALID_STATUSES,
  VALID_DESTINATIONS,
  PUBLIC_STATUSES,
  DEFAULT_SUGGESTED,
  slugify,
  listCampaignsAdmin,
  listPublicCampaigns,
  getCampaignById,
  getCampaignBySlug,
  getPublicCampaignDetail,
  getUpdates,
  getFaqs,
  getDonorWall,
  createCampaign,
  updateCampaign,
  duplicateCampaign,
  deleteCampaign,
  addUpdate,
  deleteUpdate,
  setFaqs,
  listDonations,
  createDonation,
  confirmDonation,
  bumpCampaignTotals,
  seedDefaultCampaigns,
  sanitizeStr,
  sanitizeMultiline,
};
