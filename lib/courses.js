const crypto = require('crypto');
const { getDb } = require('./db');

const VALID_STATUSES = ['draft', 'published', 'archived'];
const VALID_CATEGORIES = [
  'geral',
  'saude',
  'emergencia',
  'psicologia',
  'voluntariado',
  'gestao',
  'integrativa',
];
const PUBLIC_STATUSES = new Set(['published']);

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

function sanitizeEmail(val) {
  const email = sanitizeStr(val, 200).toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
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

function bool(v, fallback = false) {
  if (v === true || v === 1 || v === '1' || v === 'true') return true;
  if (v === false || v === 0 || v === '0' || v === 'false') return false;
  return fallback;
}

function num(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function validationError(message) {
  const err = new Error(message);
  err.code = 'validation';
  return err;
}

function notFoundError() {
  const err = new Error('not_found');
  err.code = 'not_found';
  return err;
}

function conflictError(message) {
  const err = new Error(message || 'conflict');
  err.code = 'conflict';
  return err;
}

function makeVerifyCode() {
  return crypto.randomBytes(8).toString('hex');
}

function rowToCourse(row, { includeInternal = false } = {}) {
  if (!row) return null;
  const course = {
    id: row.id,
    slug: row.slug,
    status: row.status,
    title_pt: row.title_pt,
    title_es: row.title_es,
    summary_pt: row.summary_pt,
    summary_es: row.summary_es,
    body_pt: row.body_pt,
    body_es: row.body_es,
    cover_url: row.cover_url || '',
    instructor_name: row.instructor_name || '',
    category: row.category || 'geral',
    workload_hours: row.workload_hours != null ? num(row.workload_hours) : null,
    featured: !!row.featured,
    sort_order: num(row.sort_order),
    seo_title_pt: row.seo_title_pt || '',
    seo_title_es: row.seo_title_es || '',
    seo_description_pt: row.seo_description_pt || '',
    seo_description_es: row.seo_description_es || '',
    published_at: row.published_at || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    free: true,
    lesson_count: num(row.lesson_count),
    enrollment_count: num(row.enrollment_count),
  };
  if (includeInternal) {
    course.internal_notes = row.internal_notes || '';
  }
  return course;
}

function normalizeCurriculum(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((mod, mi) => {
      const lessons = Array.isArray(mod?.lessons) ? mod.lessons : [];
      return {
        id: mod?.id != null ? Number(mod.id) : undefined,
        title_pt: sanitizeStr(mod?.title_pt || mod?.title || `Módulo ${mi + 1}`, 200),
        title_es: sanitizeStr(mod?.title_es || mod?.title || `Módulo ${mi + 1}`, 200),
        sort_order: mi,
        lessons: lessons
          .map((les, li) => ({
            id: les?.id != null ? Number(les.id) : undefined,
            title_pt: sanitizeStr(les?.title_pt || les?.title || `Aula ${li + 1}`, 200),
            title_es: sanitizeStr(les?.title_es || les?.title || `Aula ${li + 1}`, 200),
            description_pt: sanitizeMultiline(les?.description_pt || les?.description || '', 5000),
            description_es: sanitizeMultiline(les?.description_es || les?.description || '', 5000),
            video_url: sanitizeStr(les?.video_url || '', 1000),
            duration_secs: les?.duration_secs != null ? Math.max(0, Math.round(num(les.duration_secs))) : null,
            is_preview: bool(les?.is_preview, li === 0),
            sort_order: li,
          }))
          .filter((l) => l.title_pt || l.title_es),
      };
    })
    .filter((m) => m.title_pt || m.title_es || m.lessons.length);
}

function getCurriculum(courseId) {
  const db = getDb();
  const modules = db
    .prepare(
      `SELECT * FROM course_modules WHERE course_id = ? ORDER BY sort_order ASC, id ASC`
    )
    .all(courseId);
  const lessonStmt = db.prepare(
    `SELECT * FROM course_lessons WHERE module_id = ? ORDER BY sort_order ASC, id ASC`
  );
  return modules.map((m) => ({
    id: m.id,
    title_pt: m.title_pt,
    title_es: m.title_es,
    sort_order: m.sort_order,
    lessons: lessonStmt.all(m.id).map((l) => ({
      id: l.id,
      title_pt: l.title_pt,
      title_es: l.title_es,
      description_pt: l.description_pt,
      description_es: l.description_es,
      video_url: l.video_url,
      duration_secs: l.duration_secs,
      is_preview: !!l.is_preview,
      sort_order: l.sort_order,
    })),
  }));
}

function replaceCurriculum(db, courseId, curriculum) {
  const mods = normalizeCurriculum(curriculum);
  db.prepare('DELETE FROM course_modules WHERE course_id = ?').run(courseId);
  const insertMod = db.prepare(`
    INSERT INTO course_modules (course_id, title_pt, title_es, sort_order)
    VALUES (?, ?, ?, ?)
  `);
  const insertLes = db.prepare(`
    INSERT INTO course_lessons (
      module_id, title_pt, title_es, description_pt, description_es,
      video_url, duration_secs, is_preview, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  for (const mod of mods) {
    const info = insertMod.run(courseId, mod.title_pt, mod.title_es, mod.sort_order);
    const moduleId = info.lastInsertRowid;
    for (const les of mod.lessons) {
      insertLes.run(
        moduleId,
        les.title_pt,
        les.title_es,
        les.description_pt,
        les.description_es,
        les.video_url,
        les.duration_secs,
        les.is_preview ? 1 : 0,
        les.sort_order
      );
    }
  }
}

function countLessons(courseId) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS c
       FROM course_lessons l
       JOIN course_modules m ON m.id = l.module_id
       WHERE m.course_id = ?`
    )
    .get(courseId);
  return num(row?.c);
}

function listLessonIds(courseId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT l.id
       FROM course_lessons l
       JOIN course_modules m ON m.id = l.module_id
       WHERE m.course_id = ?
       ORDER BY m.sort_order ASC, l.sort_order ASC, l.id ASC`
    )
    .all(courseId)
    .map((r) => r.id);
}

function ensureUniqueSlug(db, base, excludeId = null) {
  let slug = slugify(base) || 'curso';
  let candidate = slug;
  let i = 2;
  for (;;) {
    const row = excludeId
      ? db.prepare('SELECT id FROM courses WHERE slug = ? AND id != ?').get(candidate, excludeId)
      : db.prepare('SELECT id FROM courses WHERE slug = ?').get(candidate);
    if (!row) return candidate;
    candidate = `${slug}-${i}`;
    i += 1;
  }
}

function normalizePayload(input = {}, { partial = false } = {}) {
  const out = {};
  if (!partial || input.title_pt != null) out.title_pt = sanitizeStr(input.title_pt, 200);
  if (!partial || input.title_es != null) out.title_es = sanitizeStr(input.title_es, 200);
  if (!partial || input.summary_pt != null) out.summary_pt = sanitizeMultiline(input.summary_pt, 1000);
  if (!partial || input.summary_es != null) out.summary_es = sanitizeMultiline(input.summary_es, 1000);
  if (!partial || input.body_pt != null) out.body_pt = sanitizeMultiline(input.body_pt, 20000);
  if (!partial || input.body_es != null) out.body_es = sanitizeMultiline(input.body_es, 20000);
  if (!partial || input.cover_url != null) out.cover_url = sanitizeStr(input.cover_url, 1000);
  if (!partial || input.instructor_name != null) {
    out.instructor_name = sanitizeStr(input.instructor_name, 200);
  }
  if (!partial || input.category != null) {
    const cat = sanitizeStr(input.category, 40);
    out.category = VALID_CATEGORIES.includes(cat) ? cat : 'geral';
  }
  if (!partial || input.status != null) {
    const st = sanitizeStr(input.status, 20);
    out.status = VALID_STATUSES.includes(st) ? st : 'draft';
  }
  if (!partial || input.workload_hours != null) {
    out.workload_hours =
      input.workload_hours === '' || input.workload_hours == null
        ? null
        : Math.max(0, num(input.workload_hours));
  }
  if (!partial || input.featured != null) out.featured = bool(input.featured) ? 1 : 0;
  if (!partial || input.sort_order != null) out.sort_order = Math.round(num(input.sort_order));
  if (!partial || input.seo_title_pt != null) out.seo_title_pt = sanitizeStr(input.seo_title_pt, 200);
  if (!partial || input.seo_title_es != null) out.seo_title_es = sanitizeStr(input.seo_title_es, 200);
  if (!partial || input.seo_description_pt != null) {
    out.seo_description_pt = sanitizeStr(input.seo_description_pt, 400);
  }
  if (!partial || input.seo_description_es != null) {
    out.seo_description_es = sanitizeStr(input.seo_description_es, 400);
  }
  if (!partial || input.slug != null) out.slug = slugify(input.slug);
  if (Object.prototype.hasOwnProperty.call(input, 'curriculum')) {
    out.curriculum = normalizeCurriculum(input.curriculum);
  }
  return out;
}

function listPublicCourses({ category = '', q = '' } = {}) {
  const db = getDb();
  const where = [`c.status = 'published'`];
  const params = [];
  if (category && VALID_CATEGORIES.includes(category)) {
    where.push('c.category = ?');
    params.push(category);
  }
  if (q && String(q).trim()) {
    const like = `%${String(q).trim().slice(0, 80)}%`;
    where.push(
      `(c.title_pt LIKE ? OR c.title_es LIKE ? OR c.summary_pt LIKE ? OR c.summary_es LIKE ? OR c.instructor_name LIKE ?)`
    );
    params.push(like, like, like, like, like);
  }
  const rows = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM course_lessons l
          JOIN course_modules m ON m.id = l.module_id WHERE m.course_id = c.id) AS lesson_count,
        (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id) AS enrollment_count
       FROM courses c
       WHERE ${where.join(' AND ')}
       ORDER BY c.featured DESC, c.sort_order ASC, c.published_at DESC, c.id DESC`
    )
    .all(...params);
  return rows.map((r) => rowToCourse(r));
}

function listCoursesAdmin({ status = '', category = '', q = '' } = {}) {
  const db = getDb();
  const where = ['1=1'];
  const params = [];
  if (status && VALID_STATUSES.includes(status)) {
    where.push('c.status = ?');
    params.push(status);
  }
  if (category && VALID_CATEGORIES.includes(category)) {
    where.push('c.category = ?');
    params.push(category);
  }
  if (q && String(q).trim()) {
    const like = `%${String(q).trim().slice(0, 80)}%`;
    where.push(`(c.title_pt LIKE ? OR c.title_es LIKE ? OR c.slug LIKE ?)`);
    params.push(like, like, like);
  }
  const rows = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM course_lessons l
          JOIN course_modules m ON m.id = l.module_id WHERE m.course_id = c.id) AS lesson_count,
        (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id) AS enrollment_count
       FROM courses c
       WHERE ${where.join(' AND ')}
       ORDER BY c.updated_at DESC, c.id DESC`
    )
    .all(...params);
  return rows.map((r) => rowToCourse(r));
}

function getCourseById(id, { includeInternal = false } = {}) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM course_lessons l
          JOIN course_modules m ON m.id = l.module_id WHERE m.course_id = c.id) AS lesson_count,
        (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id) AS enrollment_count
       FROM courses c WHERE c.id = ?`
    )
    .get(Number(id));
  if (!row) return null;
  const course = rowToCourse(row, { includeInternal });
  course.modules = getCurriculum(row.id);
  return course;
}

function getCourseBySlug(slug) {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM course_lessons l
          JOIN course_modules m ON m.id = l.module_id WHERE m.course_id = c.id) AS lesson_count,
        (SELECT COUNT(*) FROM course_enrollments e WHERE e.course_id = c.id) AS enrollment_count
       FROM courses c WHERE c.slug = ?`
    )
    .get(sanitizeStr(slug, 80));
  return row ? rowToCourse(row) : null;
}

function getPublicCourseDetail(slug) {
  const course = getCourseBySlug(slug);
  if (!course || !PUBLIC_STATUSES.has(course.status)) return null;
  const full = getCourseById(course.id);
  return {
    course: full,
    modules: full.modules,
  };
}

function createCourse(input = {}) {
  const data = normalizePayload(input);
  if (!data.title_pt && !data.title_es) throw validationError('title_required');
  if (!data.title_pt) data.title_pt = data.title_es;
  if (!data.title_es) data.title_es = data.title_pt;
  if (!data.summary_pt) data.summary_pt = data.summary_es || '';
  if (!data.summary_es) data.summary_es = data.summary_pt || '';

  const db = getDb();
  const slug = ensureUniqueSlug(db, data.slug || data.title_pt || data.title_es);
  const status = data.status || 'draft';
  const publishedAt = status === 'published' ? new Date().toISOString() : null;

  const info = db
    .prepare(
      `INSERT INTO courses (
        slug, status, title_pt, title_es, summary_pt, summary_es, body_pt, body_es,
        cover_url, instructor_name, category, workload_hours, featured, sort_order,
        seo_title_pt, seo_title_es, seo_description_pt, seo_description_es, published_at
      ) VALUES (
        @slug, @status, @title_pt, @title_es, @summary_pt, @summary_es, @body_pt, @body_es,
        @cover_url, @instructor_name, @category, @workload_hours, @featured, @sort_order,
        @seo_title_pt, @seo_title_es, @seo_description_pt, @seo_description_es, @published_at
      )`
    )
    .run({
      slug,
      status,
      title_pt: data.title_pt,
      title_es: data.title_es,
      summary_pt: data.summary_pt || '',
      summary_es: data.summary_es || '',
      body_pt: data.body_pt || '',
      body_es: data.body_es || '',
      cover_url: data.cover_url || '',
      instructor_name: data.instructor_name || '',
      category: data.category || 'geral',
      workload_hours: data.workload_hours,
      featured: data.featured || 0,
      sort_order: data.sort_order || 0,
      seo_title_pt: data.seo_title_pt || '',
      seo_title_es: data.seo_title_es || '',
      seo_description_pt: data.seo_description_pt || '',
      seo_description_es: data.seo_description_es || '',
      published_at: publishedAt,
    });

  const courseId = Number(info.lastInsertRowid);
  if (data.curriculum) {
    replaceCurriculum(db, courseId, data.curriculum);
  } else {
    replaceCurriculum(db, courseId, [
      {
        title_pt: 'Módulo 1',
        title_es: 'Módulo 1',
        lessons: [{ title_pt: 'Aula 1', title_es: 'Aula 1', is_preview: true }],
      },
    ]);
  }
  return getCourseById(courseId, { includeInternal: true });
}

function updateCourse(id, input = {}) {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(id));
  if (!existing) throw notFoundError();

  const data = normalizePayload(input, { partial: true });
  const next = { ...existing, ...data };
  if (!next.title_pt && !next.title_es) throw validationError('title_required');
  if (!next.title_pt) next.title_pt = next.title_es;
  if (!next.title_es) next.title_es = next.title_pt;

  let slug = existing.slug;
  if (data.slug) slug = ensureUniqueSlug(db, data.slug, existing.id);

  let publishedAt = existing.published_at;
  if (next.status === 'published' && existing.status !== 'published') {
    publishedAt = new Date().toISOString();
  }
  if (next.status !== 'published') {
    publishedAt = next.status === 'archived' ? existing.published_at : publishedAt;
  }

  db.prepare(
    `UPDATE courses SET
      slug = @slug, status = @status,
      title_pt = @title_pt, title_es = @title_es,
      summary_pt = @summary_pt, summary_es = @summary_es,
      body_pt = @body_pt, body_es = @body_es,
      cover_url = @cover_url, instructor_name = @instructor_name,
      category = @category, workload_hours = @workload_hours,
      featured = @featured, sort_order = @sort_order,
      seo_title_pt = @seo_title_pt, seo_title_es = @seo_title_es,
      seo_description_pt = @seo_description_pt, seo_description_es = @seo_description_es,
      published_at = @published_at,
      updated_at = datetime('now')
     WHERE id = @id`
  ).run({
    id: existing.id,
    slug,
    status: next.status,
    title_pt: next.title_pt,
    title_es: next.title_es,
    summary_pt: next.summary_pt || '',
    summary_es: next.summary_es || '',
    body_pt: next.body_pt || '',
    body_es: next.body_es || '',
    cover_url: next.cover_url || '',
    instructor_name: next.instructor_name || '',
    category: next.category || 'geral',
    workload_hours: next.workload_hours,
    featured: next.featured ? 1 : 0,
    sort_order: num(next.sort_order),
    seo_title_pt: next.seo_title_pt || '',
    seo_title_es: next.seo_title_es || '',
    seo_description_pt: next.seo_description_pt || '',
    seo_description_es: next.seo_description_es || '',
    published_at: publishedAt,
  });

  if (Object.prototype.hasOwnProperty.call(data, 'curriculum')) {
    replaceCurriculum(db, existing.id, data.curriculum);
  }

  return getCourseById(existing.id, { includeInternal: true });
}

function deleteCourse(id) {
  const db = getDb();
  const info = db.prepare('DELETE FROM courses WHERE id = ?').run(Number(id));
  if (!info.changes) throw notFoundError();
  return true;
}

function enrollInCourse(slug, { name, email } = {}) {
  const course = getCourseBySlug(slug);
  if (!course || !PUBLIC_STATUSES.has(course.status)) throw notFoundError();

  const studentName = sanitizeStr(name, 200);
  const studentEmail = sanitizeEmail(email);
  if (!studentName) throw validationError('name_required');
  if (!studentEmail) throw validationError('email_required');

  const db = getDb();
  const existing = db
    .prepare('SELECT * FROM course_enrollments WHERE course_id = ? AND student_email = ?')
    .get(course.id, studentEmail);

  if (existing) {
    return {
      enrollment: mapEnrollment(existing),
      course,
      created: false,
    };
  }

  const verifyCode = makeVerifyCode();
  const info = db
    .prepare(
      `INSERT INTO course_enrollments (
        course_id, student_name, student_email, progress_percent, verify_code
      ) VALUES (?, ?, ?, 0, ?)`
    )
    .run(course.id, studentName, studentEmail, verifyCode);

  const enrollment = db
    .prepare('SELECT * FROM course_enrollments WHERE id = ?')
    .get(info.lastInsertRowid);

  return {
    enrollment: mapEnrollment(enrollment),
    course,
    created: true,
  };
}

function mapEnrollment(row) {
  if (!row) return null;
  return {
    id: row.id,
    course_id: row.course_id,
    student_name: row.student_name,
    student_email: row.student_email,
    progress_percent: num(row.progress_percent),
    completed_at: row.completed_at || null,
    enrolled_at: row.enrolled_at,
    verify_code: row.verify_code || null,
  };
}

function getEnrollment(enrollmentId) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM course_enrollments WHERE id = ?').get(Number(enrollmentId));
  if (!row) return null;
  const course = getCourseById(row.course_id);
  const completedIds = new Set(
    db
      .prepare(
        `SELECT lesson_id FROM course_lesson_progress
         WHERE enrollment_id = ? AND completed = 1`
      )
      .all(row.id)
      .map((r) => r.lesson_id)
  );
  return {
    enrollment: mapEnrollment(row),
    course,
    modules: (course?.modules || []).map((m) => ({
      ...m,
      lessons: m.lessons.map((l) => ({
        ...l,
        completed: completedIds.has(l.id),
      })),
    })),
  };
}

function getEnrollmentByEmail(slug, email) {
  const course = getCourseBySlug(slug);
  if (!course) return null;
  const studentEmail = sanitizeEmail(email);
  if (!studentEmail) return null;
  const db = getDb();
  const row = db
    .prepare('SELECT * FROM course_enrollments WHERE course_id = ? AND student_email = ?')
    .get(course.id, studentEmail);
  if (!row) return null;
  return getEnrollment(row.id);
}

function markLessonComplete(enrollmentId, lessonId) {
  const db = getDb();
  const enrollment = db
    .prepare('SELECT * FROM course_enrollments WHERE id = ?')
    .get(Number(enrollmentId));
  if (!enrollment) throw notFoundError();

  const lesson = db
    .prepare(
      `SELECT l.id FROM course_lessons l
       JOIN course_modules m ON m.id = l.module_id
       WHERE l.id = ? AND m.course_id = ?`
    )
    .get(Number(lessonId), enrollment.course_id);
  if (!lesson) throw validationError('lesson_not_in_course');

  db.prepare(
    `INSERT INTO course_lesson_progress (enrollment_id, lesson_id, completed, completed_at)
     VALUES (?, ?, 1, datetime('now'))
     ON CONFLICT(enrollment_id, lesson_id) DO UPDATE SET
       completed = 1,
       completed_at = datetime('now')`
  ).run(enrollment.id, lesson.id);

  const total = countLessons(enrollment.course_id);
  const done = db
    .prepare(
      `SELECT COUNT(*) AS c FROM course_lesson_progress
       WHERE enrollment_id = ? AND completed = 1`
    )
    .get(enrollment.id).c;
  const percent = total > 0 ? Math.round((done / total) * 1000) / 10 : 0;
  const completedAt = percent >= 100 ? new Date().toISOString() : null;

  if (!enrollment.verify_code && percent >= 100) {
    db.prepare(
      `UPDATE course_enrollments SET
        progress_percent = ?, completed_at = COALESCE(completed_at, ?), verify_code = ?
       WHERE id = ?`
    ).run(percent, completedAt, makeVerifyCode(), enrollment.id);
  } else {
    db.prepare(
      `UPDATE course_enrollments SET
        progress_percent = ?,
        completed_at = CASE WHEN ? >= 100 THEN COALESCE(completed_at, ?) ELSE completed_at END
       WHERE id = ?`
    ).run(percent, percent, completedAt, enrollment.id);
  }

  return getEnrollment(enrollment.id);
}

function getCertificateByCode(code) {
  const db = getDb();
  const verifyCode = sanitizeStr(code, 64).toLowerCase();
  if (!verifyCode) return null;
  const row = db
    .prepare(
      `SELECT e.*, c.title_pt, c.title_es, c.instructor_name, c.workload_hours, c.slug
       FROM course_enrollments e
       JOIN courses c ON c.id = e.course_id
       WHERE e.verify_code = ? AND e.progress_percent >= 100`
    )
    .get(verifyCode);
  if (!row) return null;
  return {
    verify_code: row.verify_code,
    student_name: row.student_name,
    course_title_pt: row.title_pt,
    course_title_es: row.title_es,
    instructor_name: row.instructor_name,
    workload_hours: row.workload_hours != null ? num(row.workload_hours) : null,
    issued_at: row.completed_at || row.enrolled_at,
    course_slug: row.slug,
    authentic: true,
  };
}

function listEnrollmentsAdmin(courseId) {
  const db = getDb();
  return db
    .prepare(
      `SELECT * FROM course_enrollments WHERE course_id = ? ORDER BY enrolled_at DESC`
    )
    .all(Number(courseId))
    .map(mapEnrollment);
}

module.exports = {
  VALID_STATUSES,
  VALID_CATEGORIES,
  listPublicCourses,
  listCoursesAdmin,
  getCourseById,
  getCourseBySlug,
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
  listLessonIds,
};
