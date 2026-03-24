const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { query } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const upload = require('../middleware/upload');

// GET /api/documents - public listing
router.get('/', async (req, res) => {
  try {
    const {
      page = 1, limit = 12, search, category, region, year, language, featured
    } = req.query;

    const offset = (page - 1) * limit;
    const conditions = ['d.is_published = true'];
    const params = [];
    let paramIdx = 1;

    if (search) {
      conditions.push(`(d.title ILIKE $${paramIdx} OR d.description ILIKE $${paramIdx})`);
      params.push(`%${search}%`);
      paramIdx++;
    }
    if (category) {
      conditions.push(`c.slug = $${paramIdx}`);
      params.push(category);
      paramIdx++;
    }
    if (region) {
      conditions.push(`d.region = $${paramIdx}`);
      params.push(region);
      paramIdx++;
    }
    if (year) {
      conditions.push(`d.year = $${paramIdx}`);
      params.push(parseInt(year));
      paramIdx++;
    }
    if (language) {
      conditions.push(`d.language = $${paramIdx}`);
      params.push(language);
      paramIdx++;
    }
    if (featured === 'true') {
      conditions.push('d.is_featured = true');
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countResult = await query(`
      SELECT COUNT(*) FROM documents d
      LEFT JOIN categories c ON d.category_id = c.id
      ${where}
    `, params);

    const total = parseInt(countResult.rows[0].count);

    const docsResult = await query(`
      SELECT d.*, c.name as category_name, c.slug as category_slug, c.color as category_color
      FROM documents d
      LEFT JOIN categories c ON d.category_id = c.id
      ${where}
      ORDER BY d.created_at DESC
      LIMIT $${paramIdx} OFFSET $${paramIdx + 1}
    `, [...params, parseInt(limit), offset]);

    res.json({
      documents: docsResult.rows,
      pagination: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error('Documents list error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/documents/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await query(`
      SELECT d.*, c.name as category_name, c.slug as category_slug
      FROM documents d
      LEFT JOIN categories c ON d.category_id = c.id
      WHERE d.id = $1 AND d.is_published = true
    `, [req.params.id]);

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Document not found' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/documents/:id/download - track downloads
router.get('/:id/download', async (req, res) => {
  try {
    const result = await query(
      'SELECT * FROM documents WHERE id = $1 AND is_published = true',
      [req.params.id]
    );

    if (!result.rows.length) {
      return res.status(404).json({ error: 'Document not found' });
    }

    const doc = result.rows[0];

    // Log download
    await query(
      'UPDATE documents SET download_count = download_count + 1 WHERE id = $1',
      [req.params.id]
    );
    await query(
      'INSERT INTO download_logs (document_type, document_id, ip_address, user_agent) VALUES ($1, $2, $3, $4)',
      ['document', req.params.id, req.ip, req.get('user-agent')]
    );

    // Serve file
    const filePath = path.join(process.env.UPLOAD_DIR || './uploads', doc.file_url.replace('/uploads/', ''));
    if (fs.existsSync(filePath)) {
      res.setHeader('Content-Disposition', `attachment; filename="${doc.file_name}"`);
      res.setHeader('Content-Type', doc.file_type || 'application/pdf');
      return res.sendFile(path.resolve(filePath));
    }

    // If file doesn't exist on disk yet (demo), redirect
    res.json({ download_url: doc.file_url, message: 'File download initiated' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// --- ADMIN ROUTES ---

// GET /api/documents/admin/all
router.get('/admin/all', authMiddleware, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const offset = (page - 1) * limit;
    const params = [];
    let where = '';

    if (search) {
      where = 'WHERE d.title ILIKE $1';
      params.push(`%${search}%`);
    }

    const countResult = await query(`SELECT COUNT(*) FROM documents d ${where}`, params);
    const total = parseInt(countResult.rows[0].count);

    const docsResult = await query(`
      SELECT d.*, c.name as category_name
      FROM documents d
      LEFT JOIN categories c ON d.category_id = c.id
      ${where}
      ORDER BY d.created_at DESC
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `, [...params, parseInt(limit), offset]);

    res.json({ documents: docsResult.rows, pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/documents - upload new document
router.post('/', authMiddleware, upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]), async (req, res) => {
  try {
    const { title, description, category_id, language, region, year, tags, is_featured } = req.body;

    if (!req.files?.file) {
      return res.status(400).json({ error: 'File is required' });
    }

    const file = req.files.file[0];
    const fileUrl = `/uploads/documents/${file.filename}`;
    const thumbnailUrl = req.files?.thumbnail ? `/uploads/images/${req.files.thumbnail[0].filename}` : null;

    const result = await query(`
      INSERT INTO documents (title, description, category_id, file_url, file_name, file_size, file_type, thumbnail_url, language, region, year, tags, is_featured)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING *
    `, [
      title, description, category_id || null, fileUrl, file.originalname,
      file.size, file.mimetype, thumbnailUrl, language || 'en', region,
      year ? parseInt(year) : null,
      tags ? tags.split(',').map(t => t.trim()) : [],
      is_featured === 'true',
    ]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/documents/:id
router.put('/:id', authMiddleware, upload.fields([
  { name: 'file', maxCount: 1 },
  { name: 'thumbnail', maxCount: 1 },
]), async (req, res) => {
  try {
    const { title, description, category_id, language, region, year, tags, is_featured, is_published } = req.body;

    const existing = await query('SELECT * FROM documents WHERE id = $1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

    let fileUrl = existing.rows[0].file_url;
    let fileName = existing.rows[0].file_name;
    let fileSize = existing.rows[0].file_size;
    let fileType = existing.rows[0].file_type;
    let thumbnailUrl = existing.rows[0].thumbnail_url;

    if (req.files?.file) {
      const file = req.files.file[0];
      fileUrl = `/uploads/documents/${file.filename}`;
      fileName = file.originalname;
      fileSize = file.size;
      fileType = file.mimetype;
    }

    if (req.files?.thumbnail) {
      thumbnailUrl = `/uploads/images/${req.files.thumbnail[0].filename}`;
    }

    const result = await query(`
      UPDATE documents SET
        title = $1, description = $2, category_id = $3, file_url = $4, file_name = $5,
        file_size = $6, file_type = $7, thumbnail_url = $8, language = $9, region = $10,
        year = $11, tags = $12, is_featured = $13, is_published = $14, updated_at = NOW()
      WHERE id = $15 RETURNING *
    `, [
      title, description, category_id || null, fileUrl, fileName, fileSize, fileType,
      thumbnailUrl, language || 'en', region, year ? parseInt(year) : null,
      tags ? tags.split(',').map(t => t.trim()) : [],
      is_featured === 'true', is_published !== 'false',
      req.params.id,
    ]);

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

    // Optionally delete file from disk
    const filePath = path.join(process.env.UPLOAD_DIR || './uploads', result.rows[0].file_url.replace('/uploads/', ''));
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);

    res.json({ message: 'Document deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
