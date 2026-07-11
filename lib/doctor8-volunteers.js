const CACHE_TTL_MS = Number(process.env.DOCTOR8_VOLUNTEERS_CACHE_MS || 5 * 60 * 1000);

let cache = { at: 0, data: null };

function isConfigured() {
  return !!(process.env.DOCTOR8_API_BASE_URL && process.env.DOCTOR8_API_KEY);
}

function baseUrl() {
  return String(process.env.DOCTOR8_API_BASE_URL || '').replace(/\/$/, '');
}

async function doctor8Fetch(path, options = {}) {
  const url = `${baseUrl()}${path}`;
  const timeoutMs = Number(process.env.DOCTOR8_API_TIMEOUT_MS || 12_000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${process.env.DOCTOR8_API_KEY}`,
        ...(options.headers || {}),
      },
      signal: controller.signal,
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    clearTimeout(timer);
    throw err;
  }
}

/** Map Doctor8 partner payload to the card shape used by consulta-profissionais.js */
function mapVolunteer(entry) {
  return {
    id: entry.id,
    name: entry.name,
    slug: entry.slug,
    profissao: entry.profissao || [],
    especialidade: entry.especialidade || [],
    registro: entry.registro || '',
    bio: entry.bio || '',
    agendamento: '',
    curriculo: '',
    location: entry.location || '',
    photo: entry.avatarUrl || '',
    volunteerBadge: !!entry.volunteerBadge,
    doctor8: entry.doctor8 !== false,
    initials: entry.initials || '',
    bookingUrl: entry.bookingUrl || entry.publicUrl || '',
    publicUrl: entry.publicUrl || '',
  };
}

async function fetchVolunteersFromDoctor8(lang) {
  const qs = new URLSearchParams({ lang: lang === 'es' ? 'es' : 'pt' });
  const limit = process.env.DOCTOR8_VOLUNTEERS_LIMIT;
  if (limit) qs.set('limit', String(limit));

  const result = await doctor8Fetch(`/api/integrations/acura/volunteers?${qs.toString()}`);
  if (!result.ok) {
    const err = new Error(`Doctor8 volunteers ${result.status}`);
    err.status = result.status;
    err.data = result.data;
    throw err;
  }

  const volunteers = Array.isArray(result.data?.volunteers) ? result.data.volunteers : [];
  return volunteers.map(mapVolunteer);
}

async function getVolunteers({ lang = 'pt', forceRefresh = false } = {}) {
  const now = Date.now();
  if (!forceRefresh && cache.data && now - cache.at < CACHE_TTL_MS) {
    return { source: 'cache', professionals: cache.data };
  }

  if (!isConfigured()) {
    return { source: 'not_configured', professionals: null };
  }

  const professionals = await fetchVolunteersFromDoctor8(lang);
  cache = { at: now, data: professionals };
  return { source: 'live', professionals };
}

async function handleConsultaProfissionaisRequest(req, res) {
  const lang = String(req.query.lang || 'pt').toLowerCase() === 'es' ? 'es' : 'pt';
  const forceRefresh = req.query.refresh === '1';

  try {
    const { source, professionals } = await getVolunteers({ lang, forceRefresh });

    if (source === 'not_configured') {
      return res.status(503).json({
        ok: false,
        error: 'not_configured',
        professionals: [],
      });
    }

    const list = Array.isArray(professionals) ? professionals : [];
    return res.json({
      ok: true,
      source,
      count: list.length,
      professionals: list,
    });
  } catch (err) {
    console.error('[doctor8-volunteers]', err.message);
    return res.status(502).json({
      ok: false,
      error: 'upstream_error',
      professionals: [],
    });
  }
}

module.exports = {
  isConfigured,
  getVolunteers,
  handleConsultaProfissionaisRequest,
};
