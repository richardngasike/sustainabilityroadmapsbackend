const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const { query } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const upload = require('../middleware/upload');

// GET /api/roadmaps - public
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 12, search, region, country, year, status } = req.query;
    const offset = (page - 1) * limit;
    const conditions = ['is_published = true'];
    const params = [];
    let idx = 1;

    if (search) {
      conditions.push(`(title ILIKE $${idx} OR country ILIKE $${idx} OR description ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }
    if (region) { conditions.push(`region = $${idx}`); params.push(region); idx++; }
    if (country) { conditions.push(`country_code = $${idx}`); params.push(country); idx++; }
    if (year) { conditions.push(`year = $${idx}`); params.push(parseInt(year)); idx++; }
    if (status) { conditions.push(`status = $${idx}`); params.push(status); idx++; }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = parseInt((await query(`SELECT COUNT(*) FROM roadmaps ${where}`, params)).rows[0].count);
    const result = await query(`SELECT * FROM roadmaps ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`, [...params, parseInt(limit), offset]);
    const regionsResult = await query('SELECT DISTINCT region FROM roadmaps WHERE is_published = true AND region IS NOT NULL ORDER BY region');

    res.json({
      roadmaps: result.rows,
      regions: regionsResult.rows.map(r => r.region),
      pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/roadmaps/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM roadmaps WHERE id = $1 AND is_published = true', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Roadmap not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/roadmaps/:id/download
router.get('/:id/download', async (req, res) => {
  try {
    const result = await query('SELECT * FROM roadmaps WHERE id = $1', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });

    const roadmap = result.rows[0];
    await query('UPDATE roadmaps SET download_count = download_count + 1 WHERE id = $1', [req.params.id]);
    await query('INSERT INTO download_logs (document_type, document_id, ip_address, user_agent) VALUES ($1, $2, $3, $4)',
      ['roadmap', req.params.id, req.ip, req.get('user-agent')]);

    if (roadmap.file_url) {
      const filePath = path.join(process.env.UPLOAD_DIR || './uploads', roadmap.file_url.replace('/uploads/', ''));
      if (fs.existsSync(filePath)) {
        res.setHeader('Content-Disposition', `attachment; filename="${roadmap.file_name}"`);
        return res.sendFile(path.resolve(filePath));
      }
    }

    res.json({ message: 'Download tracked' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ADMIN POST
router.post('/', authMiddleware, upload.fields([{ name: 'file', maxCount: 1 }]), async (req, res) => {
  try {
    const { title, country, country_code, region, description, year, status, implementation_period, partners } = req.body;

    let fileUrl = null, fileName = null, fileSize = 0;
    if (req.files?.file) {
      const file = req.files.file[0];
      fileUrl = `/uploads/roadmaps/${file.filename}`;
      fileName = file.originalname;
      fileSize = file.size;
    }

    const result = await query(`
      INSERT INTO roadmaps (title, country, country_code, region, description, file_url, file_name, file_size, year, status, implementation_period, partners)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *
    `, [title, country, country_code, region, description, fileUrl, fileName, fileSize, year ? parseInt(year) : null, status || 'active', implementation_period, partners ? partners.split(',').map(p => p.trim()) : []]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ADMIN PUT
router.put('/:id', authMiddleware, upload.fields([{ name: 'file', maxCount: 1 }]), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM roadmaps WHERE id = $1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

    const { title, country, country_code, region, description, year, status, implementation_period, partners, is_published, is_featured } = req.body;
    let { file_url, file_name, file_size } = existing.rows[0];

    if (req.files?.file) {
      const file = req.files.file[0];
      file_url = `/uploads/roadmaps/${file.filename}`;
      file_name = file.originalname;
      file_size = file.size;
    }

    const result = await query(`
      UPDATE roadmaps SET
        title=$1, country=$2, country_code=$3, region=$4, description=$5,
        file_url=$6, file_name=$7, file_size=$8, year=$9, status=$10,
        implementation_period=$11, partners=$12, is_published=$13, is_featured=$14, updated_at=NOW()
      WHERE id=$15 RETURNING *
    `, [title, country, country_code, region, description, file_url, file_name, file_size, year ? parseInt(year) : null, status, implementation_period, partners ? partners.split(',').map(p => p.trim()) : [], is_published !== 'false', is_featured === 'true', req.params.id]);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ADMIN DELETE
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('DELETE FROM roadmaps WHERE id = $1 RETURNING *', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Roadmap deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
