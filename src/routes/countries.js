const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');
const upload = require('../middleware/upload');
const { serveFile } = require('../utils/fileServe');

// GET /api/countries
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 20, search, region, year } = req.query;
    const offset = (page - 1) * limit;
    const conditions = ['is_published = true'];
    const params = [];
    let idx = 1;

    if (search) { conditions.push(`(country_name ILIKE $${idx} OR region ILIKE $${idx})`); params.push(`%${search}%`); idx++; }
    if (region) { conditions.push(`region = $${idx}`); params.push(region); idx++; }
    if (year) { conditions.push(`year = $${idx}`); params.push(parseInt(year)); idx++; }

    const where = `WHERE ${conditions.join(' AND ')}`;
    const total = parseInt((await query(`SELECT COUNT(*) FROM country_profiles ${where}`, params)).rows[0].count);
    const result = await query(`SELECT * FROM country_profiles ${where} ORDER BY country_name ASC LIMIT $${idx} OFFSET $${idx + 1}`, [...params, parseInt(limit), offset]);
    const regionsResult = await query('SELECT DISTINCT region FROM country_profiles WHERE is_published = true ORDER BY region');

    res.json({ countries: result.rows, regions: regionsResult.rows.map(r => r.region), pagination: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / limit) } });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/countries/:id
router.get('/:id', async (req, res) => {
  try {
    const result = await query('SELECT * FROM country_profiles WHERE id = $1 AND is_published = true', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Country profile not found' });
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/countries/:id/download
router.get('/:id/download', async (req, res) => {
  try {
    const result = await query('SELECT * FROM country_profiles WHERE id = $1 AND is_published = true', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    const profile = result.rows[0];

    query('UPDATE country_profiles SET download_count = download_count + 1 WHERE id = $1', [profile.id]).catch(() => {});
    query('INSERT INTO download_logs (document_type, document_id, ip_address, user_agent) VALUES ($1,$2,$3,$4)',
      ['country_profile', profile.id, req.ip, req.get('user-agent')]).catch(() => {});

    serveFile(res, profile.file_url, profile.file_name, 'attachment');
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/countries/:id/view — inline PDF viewer
router.get('/:id/view', async (req, res) => {
  try {
    const result = await query('SELECT * FROM country_profiles WHERE id = $1 AND is_published = true', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    const profile = result.rows[0];
    serveFile(res, profile.file_url, profile.file_name, 'inline');
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/countries
router.post('/', authMiddleware, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), async (req, res) => {
  try {
    const { country_name, country_code, region, sub_region, description, year, population, sustainability_score } = req.body;
    let fileUrl = null, fileName = null, fileSize = 0, thumbnailUrl = null;

    if (req.files?.file) { const f = req.files.file[0]; fileUrl = `/uploads/profiles/${f.filename}`; fileName = f.originalname; fileSize = f.size; }
    if (req.files?.thumbnail) thumbnailUrl = `/uploads/images/${req.files.thumbnail[0].filename}`;

    const result = await query(`
      INSERT INTO country_profiles (country_name, country_code, region, sub_region, description, file_url, file_name, file_size, thumbnail_url, year, population, sustainability_score)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
    `, [country_name, country_code, region, sub_region, description, fileUrl, fileName, fileSize, thumbnailUrl, year ? parseInt(year) : null, population ? parseInt(population) : null, sustainability_score ? parseInt(sustainability_score) : null]);

    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/countries/:id
router.put('/:id', authMiddleware, upload.fields([{ name: 'file', maxCount: 1 }, { name: 'thumbnail', maxCount: 1 }]), async (req, res) => {
  try {
    const existing = await query('SELECT * FROM country_profiles WHERE id = $1', [req.params.id]);
    if (!existing.rows.length) return res.status(404).json({ error: 'Not found' });

    const { country_name, country_code, region, sub_region, description, year, population, sustainability_score, is_published } = req.body;
    let { file_url, file_name, file_size, thumbnail_url } = existing.rows[0];

    if (req.files?.file) { const f = req.files.file[0]; file_url = `/uploads/profiles/${f.filename}`; file_name = f.originalname; file_size = f.size; }
    if (req.files?.thumbnail) thumbnail_url = `/uploads/images/${req.files.thumbnail[0].filename}`;

    const result = await query(`
      UPDATE country_profiles SET country_name=$1,country_code=$2,region=$3,sub_region=$4,description=$5,
      file_url=$6,file_name=$7,file_size=$8,thumbnail_url=$9,year=$10,population=$11,sustainability_score=$12,
      is_published=$13,updated_at=NOW() WHERE id=$14 RETURNING *
    `, [country_name, country_code, region, sub_region, description, file_url, file_name, file_size, thumbnail_url, year ? parseInt(year) : null, population ? parseInt(population) : null, sustainability_score ? parseInt(sustainability_score) : null, is_published !== 'false', req.params.id]);

    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/countries/:id
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const result = await query('DELETE FROM country_profiles WHERE id = $1 RETURNING *', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Country profile deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;