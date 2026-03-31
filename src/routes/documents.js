const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { query } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { serveFile } = require('../utils/fileServe');

// GET /api/documents - public listing
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 12, search, category, region, year, language, featured } = req.query;
    const offset = (page - 1) * limit;
    const conditions = ['d.is_published = true'];
    const params = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(`(d.title ILIKE $${paramIdx} OR d.description ILIKE $${paramIdx})`);
      params.push(`%${search}%`); paramIdx++;
    }
    if (category) { conditions.push(`c.slug = $${paramIdx}`); params.push(category); paramIdx++; }
    if (region) { conditions.push(`d.region = $${paramIdx}`); params.push(region); paramIdx++; }
    if (year) { conditions.push(`d.year = $${paramIdx}`); params.push(parseInt(year)); paramIdx++; }
    if (language) { conditions.push(`d.language = $${paramIdx}`); params.push(language); paramIdx++; }
    if (featured === 'true') conditions.push('d.is_featured = true');

    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = parseInt((await query(`SELECT COUNT(*) FROM documents d LEFT JOIN categories c ON d.category_id = c.id ${where}`, params)).rows[0].count);

    const docsResult = await query(`
      SELECT d.*, c.name as category_name, c.slug as category_slug, c.color as category_color
      FROM documents d LEFT JOIN categories c ON d.category_id = c.id
      ${where} ORDER BY d.created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, [...params, parseInt(limit), offset]);

    res.json({ documents: docsResult.rows, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (error) {
    console.error('Documents list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/documents/admin/all
router.get('/admin/all', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let where = '';
    if (search) { where = 'WHERE d.title ILIKE $1'; params.push(`%${search}%`); }
    const total = parseInt((await query(`SELECT COUNT(*) FROM documents d ${where}`, params)).rows[0].count);
    const result = await query(`
      SELECT d.*, c.name as category_name FROM documents d
      LEFT JOIN categories c ON d.category_id = c.id
      ${where} ORDER BY d.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, parseInt(limit), offset]);
    res.json({ documents: result.rows, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/documents/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await query(`
      SELECT d.*, c.name as category_name, c.slug as category_slug
      FROM documents d LEFT JOIN categories c ON d.category_id = c.id
      WHERE d.id = $1 AND d.is_published = true
    `, [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/documents/:id/download — force download (attachment)
router.get('/:id/download', async (req, res) => {
  try {
    const result = await query('SELECT * FROM documents WHERE id = $1 AND is_published = true', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });
    const doc = result.rows[0];

    // Track download async (don't await — don't block file serving)
    query('UPDATE documents SET download_count = download_count + 1 WHERE id = $1', [doc.id]).catch(() => {});
    query('INSERT INTO download_logs (document_type, document_id, ip_address, user_agent) VALUES ($1, $2, $3, $4)',
      ['document', doc.id, req.ip, req.get('user-agent')]).catch(() => {});

    serveFile(res, doc.file_url, doc.file_name, 'attachment');
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/documents/:id/view — view inline in browser (PDF viewer)
router.get('/:id/view', async (req, res) => {
  try {
    const result = await query('SELECT * FROM documents WHERE id = $1 AND is_published = true', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Document not found' });
    const doc = result.rows[0];
    serveFile(res, doc.file_url, doc.file_name, 'inline');
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/documents
router.post('/', authMiddleware, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), async (req, res) => {
  try {
    const { title, description, category_id, language, region, year, tags, is_featured } = req.body;
    if (!req.files?.file) return res.status(400).json({ error: 'File is required' });

    const file = req.files.file[0];
    const fileUrl = `/uploads/documents/${file.filename}`;
    const thumbnailUrl = req.files?.thumbnail ? `/uploads/images/${req.files.thumbnail[0].filename}` : null;

    const result = await query(`
      INSERT INTO documents (title, description, category_id, file_url, file_name, file_size, file_type, thumbnail_url, language, region, year, tags, is_featured)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING *
    `, [title, description, category_id || null, fileUrl, file.originalname, file.size, file.mimetype, thumbnailUrl, language || 'en', region, year ? parseInt(year) : null, tags ? tags.split(',').map(t => t.trim()) : [], is_featured === 'true']);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/documents/:id
router.put('/:id', authMiddleware, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

    const { title, description, category_id, language, region, year, tags, is_featured, is_published } = req.body;
    let { file_url, file_name, file_size, file_type, thumbnail_url } = existing.rows[0];

    if (req.files?.file) {
      const file = req.files.file[0];
      file_url = `/uploads/documents/${file.filename}`;
      file_name = file.originalname; file_size = file.size; file_type = file.mimetype;
    }
    if (req.files?.thumbnail) thumbnail_url = `/uploads/images/${req.files.thumbnail[0].filename}`;

    const result = await query(`
      UPDATE documents SET title=$1,description=$2,category_id=$3,file_url=$4,file_name=$5,
      file_size=$6,file_type=$7,thumbnail_url=$8,language=$9,region=$10,year=$11,tags=$12,
      is_featured=$13,is_published=$14,updated_at=NOW() WHERE id=$15 RETURNING *
    `, [title, description, category_id || null, file_url, file_name, file_size, file_type, thumbnail_url, language || 'en', region, year ? parseInt(year) : null, tags ? tags.split(',').map(t => t.trim()) : [], is_featured === 'true', is_published !== 'false', req.params.id]);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/documents/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('DELETE FROM documents WHERE id = $1 RETURNING *', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    const filePath = path.resolve(process.env.UPLOAD_DIR || './uploads', result.rows[0].file_url.replace(/^\/uploads\//, ''));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    res.json({ message: 'Document deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;