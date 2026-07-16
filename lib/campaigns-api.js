const {
  listCampaignsAdmin,
  listPublicCampaigns,
  getCampaignById,
  getPublicCampaignDetail,
  createCampaign,
  updateCampaign,
  duplicateCampaign,
  deleteCampaign,
  getUpdates,
  getFaqs,
  addUpdate,
  deleteUpdate,
  setFaqs,
  listDonations,
  createDonation,
  confirmDonation,
  getCampaignBySlug,
} = require('./campaigns');
const { requireAdmin } = require('./admin-auth');

function handleError(res, err) {
  if (err.code === 'validation') {
    return res.status(400).json({ ok: false, error: err.message || 'validation' });
  }
  if (err.code === 'conflict') {
    return res.status(409).json({ ok: false, error: err.message || 'conflict' });
  }
  if (err.code === 'not_found') {
    return res.status(404).json({ ok: false, error: 'not_found' });
  }
  console.error('campaigns error:', err.message);
  return res.status(500).json({ ok: false, error: 'server_error' });
}

function registerCampaignRoutes(app) {
  app.get('/api/campaigns', (req, res) => {
    try {
      const type = req.query.type || '';
      const includeClosed = req.query.includeClosed === '1' || req.query.includeClosed === 'true';
      const campaigns = listPublicCampaigns({ type: type || undefined, includeClosed });
      res.json({ ok: true, campaigns });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/campaigns/:slug', (req, res) => {
    try {
      const detail = getPublicCampaignDetail(req.params.slug);
      if (!detail) return res.status(404).json({ ok: false, error: 'not_found' });
      res.json({ ok: true, ...detail });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/campaigns/:slug/donations', (req, res) => {
    try {
      const campaign = getCampaignBySlug(req.params.slug);
      if (!campaign || !['published', 'paused'].includes(campaign.status)) {
        return res.status(404).json({ ok: false, error: 'not_found' });
      }
      if (!campaign.accepts_donation) {
        return res.status(400).json({ ok: false, error: 'donations_disabled' });
      }
      const donation = createDonation(campaign.id, {
        ...(req.body || {}),
        status: req.body?.status === 'confirmed' ? 'confirmed' : 'reported',
        bump_totals: true,
      });
      res.status(201).json({ ok: true, donation });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/admin/campaigns', requireAdmin, (req, res) => {
    try {
      const campaigns = listCampaignsAdmin({
        status: req.query.status || '',
        type: req.query.type || '',
        q: req.query.q || '',
      });
      res.json({ ok: true, campaigns });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/admin/campaigns/:id', requireAdmin, (req, res) => {
    try {
      const id = Number(req.params.id);
      const campaign = getCampaignById(id, { includeInternal: true });
      if (!campaign) return res.status(404).json({ ok: false, error: 'not_found' });
      res.json({
        ok: true,
        campaign,
        updates: getUpdates(id),
        faqs: getFaqs(id),
        donations: listDonations(id),
      });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/admin/campaigns', requireAdmin, (req, res) => {
    try {
      const campaign = createCampaign(req.body || {});
      res.status(201).json({ ok: true, campaign });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.patch('/api/admin/campaigns/:id', requireAdmin, (req, res) => {
    try {
      const campaign = updateCampaign(Number(req.params.id), req.body || {});
      res.json({ ok: true, campaign });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/admin/campaigns/:id/duplicate', requireAdmin, (req, res) => {
    try {
      const campaign = duplicateCampaign(Number(req.params.id));
      res.status(201).json({ ok: true, campaign });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete('/api/admin/campaigns/:id', requireAdmin, (req, res) => {
    try {
      deleteCampaign(Number(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/admin/campaigns/:id/updates', requireAdmin, (req, res) => {
    try {
      const update = addUpdate(Number(req.params.id), req.body || {});
      res.status(201).json({ ok: true, update });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete('/api/admin/campaigns/:id/updates/:updateId', requireAdmin, (req, res) => {
    try {
      deleteUpdate(Number(req.params.id), Number(req.params.updateId));
      res.json({ ok: true });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.put('/api/admin/campaigns/:id/faqs', requireAdmin, (req, res) => {
    try {
      const faqs = setFaqs(Number(req.params.id), req.body?.faqs || []);
      res.json({ ok: true, faqs });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/admin/campaigns/:id/donations', requireAdmin, (req, res) => {
    try {
      const donations = listDonations(Number(req.params.id));
      res.json({ ok: true, donations });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/admin/campaigns/:id/donations', requireAdmin, (req, res) => {
    try {
      const donation = createDonation(Number(req.params.id), {
        ...(req.body || {}),
        method: req.body?.method || 'manual',
        status: req.body?.status || 'confirmed',
        bump_totals: req.body?.bump_totals !== false,
      });
      res.status(201).json({ ok: true, donation });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/admin/donations/:id/confirm', requireAdmin, (req, res) => {
    try {
      const donation = confirmDonation(Number(req.params.id));
      res.json({ ok: true, donation });
    } catch (err) {
      handleError(res, err);
    }
  });
}

module.exports = { registerCampaignRoutes };
