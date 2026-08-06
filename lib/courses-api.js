const {
  listPublicCourses,
  listCoursesAdmin,
  getCourseById,
  getPublicCourseDetail,
  createCourse,
  updateCourse,
  deleteCourse,
  enrollInCourse,
  getEnrollment,
  getEnrollmentByEmail,
  markLessonComplete,
  getCertificateByCode,
  listEnrollmentsAdmin,
} = require('./courses');
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
  console.error('courses error:', err.message);
  return res.status(500).json({ ok: false, error: 'server_error' });
}

function registerCourseRoutes(app) {
  app.get('/api/courses', (req, res) => {
    try {
      const courses = listPublicCourses({
        category: req.query.category || '',
        q: req.query.q || '',
      });
      res.json({ ok: true, courses });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/courses/certificates/:code', (req, res) => {
    try {
      const certificate = getCertificateByCode(req.params.code);
      if (!certificate) return res.status(404).json({ ok: false, error: 'not_found' });
      res.json({ ok: true, certificate });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/courses/:slug', (req, res) => {
    try {
      const detail = getPublicCourseDetail(req.params.slug);
      if (!detail) return res.status(404).json({ ok: false, error: 'not_found' });
      res.json({ ok: true, ...detail });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/courses/:slug/enroll', (req, res) => {
    try {
      const result = enrollInCourse(req.params.slug, {
        name: req.body?.name,
        email: req.body?.email,
      });
      res.status(result.created ? 201 : 200).json({ ok: true, ...result });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/courses/:slug/enrollment', (req, res) => {
    try {
      const data = getEnrollmentByEmail(req.params.slug, req.query.email || '');
      if (!data) return res.status(404).json({ ok: false, error: 'not_found' });
      res.json({ ok: true, ...data });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/courses/enrollments/:id', (req, res) => {
    try {
      const data = getEnrollment(req.params.id);
      if (!data) return res.status(404).json({ ok: false, error: 'not_found' });
      res.json({ ok: true, ...data });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/courses/enrollments/:id/progress', (req, res) => {
    try {
      const data = markLessonComplete(req.params.id, req.body?.lessonId);
      res.json({ ok: true, ...data });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/admin/courses', requireAdmin, (req, res) => {
    try {
      const courses = listCoursesAdmin({
        status: req.query.status || '',
        category: req.query.category || '',
        q: req.query.q || '',
      });
      res.json({ ok: true, courses });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.get('/api/admin/courses/:id', requireAdmin, (req, res) => {
    try {
      const course = getCourseById(Number(req.params.id), { includeInternal: true });
      if (!course) return res.status(404).json({ ok: false, error: 'not_found' });
      const enrollments = listEnrollmentsAdmin(course.id);
      res.json({ ok: true, course, enrollments });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.post('/api/admin/courses', requireAdmin, (req, res) => {
    try {
      const course = createCourse(req.body || {});
      res.status(201).json({ ok: true, course });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.patch('/api/admin/courses/:id', requireAdmin, (req, res) => {
    try {
      const course = updateCourse(Number(req.params.id), req.body || {});
      res.json({ ok: true, course });
    } catch (err) {
      handleError(res, err);
    }
  });

  app.delete('/api/admin/courses/:id', requireAdmin, (req, res) => {
    try {
      deleteCourse(Number(req.params.id));
      res.json({ ok: true });
    } catch (err) {
      handleError(res, err);
    }
  });
}

module.exports = { registerCourseRoutes };
