const express = require('express');
const router = express.Router();
const { query } = require('../config/db');
const { authMiddleware } = require('../middleware/auth');

// GET /api/settings - public (only non-sensitive)
router.get('/', async (req, res) => {
  try {
    const result = await query(
      "SELECT key, value, type, label FROM site_settings WHERE group_name != 'advanced'"
    );
    const settings = {};
    result.rows.forEach(row => { settings[row.key] = row.value; });
    res.json(settings);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/settings/all - admin
router.get('/all', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT * FROM site_settings ORDER BY group_name, key');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/settings - admin
router.put('/', authMiddleware, async (req, res) => {
  try {
    const settings = req.body;
    for (const [key, value] of Object.entries(settings)) {
      await query(
        'UPDATE site_settings SET value = $1, updated_at = NOW() WHERE key = $2',
        [value, key]
      );
    }
    res.json({ message: 'Settings updated successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/categories
router.get('/categories', async (req, res) => {
  try {
    const result = await query('SELECT * FROM categories ORDER BY name');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/categories
router.post('/categories', authMiddleware, async (req, res) => {
  try {
    const { name, slug, description, icon, color } = req.body;
    const result = await query(
      'INSERT INTO categories (name, slug, description, icon, color) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [name, slug, description, icon, color]
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Category slug already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/categories/:id
router.delete('/categories/:id', authMiddleware, async (req, res) => {
  try {
    await query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    res.json({ message: 'Category deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/settings/hero - public hero slides
router.get('/hero', async (req, res) => {
  try {
    const result = await query('SELECT * FROM hero_slides WHERE is_active = true ORDER BY sort_order ASC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/settings/hero/:id - admin
router.put('/hero/:id', authMiddleware, async (req, res) => {
  try {
    const { title, subtitle, description, image_url, cta_text, cta_link, badge_text, sort_order, is_active } = req.body;
    const result = await query(`
      UPDATE hero_slides SET title=$1, subtitle=$2, description=$3, image_url=$4, cta_text=$5, cta_link=$6, badge_text=$7, sort_order=$8, is_active=$9, updated_at=NOW()
      WHERE id=$10 RETURNING *
    `, [title, subtitle, description, image_url, cta_text, cta_link, badge_text, sort_order, is_active !== false, req.params.id]);
    res.json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/settings/hero - admin
router.post('/hero', authMiddleware, async (req, res) => {
  try {
    const { title, subtitle, description, image_url, cta_text, cta_link, badge_text, sort_order } = req.body;
    const result = await query(`
      INSERT INTO hero_slides (title, subtitle, description, image_url, cta_text, cta_link, badge_text, sort_order)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
    `, [title, subtitle, description, image_url, cta_text, cta_link, badge_text, sort_order || 0]);
    res.status(201).json(result.rows[0]);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/settings/hero/:id
router.delete('/hero/:id', authMiddleware, async (req, res) => {
  try {
    await query('DELETE FROM hero_slides WHERE id = $1', [req.params.id]);
    res.json({ message: 'Slide deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/settings/stats - dashboard stats
router.get('/stats', authMiddleware, async (req, res) => {
  try {
    const [docs, countries, roadmaps, news, downloads] = await Promise.all([
      query('SELECT COUNT(*) FROM documents'),
      query('SELECT COUNT(*) FROM country_profiles'),
      query('SELECT COUNT(*) FROM roadmaps'),
      query('SELECT COUNT(*) FROM news WHERE is_published = true'),
      query('SELECT COUNT(*) FROM download_logs'),
    ]);

    const totalDownloads = await query('SELECT COALESCE(SUM(download_count), 0) as total FROM documents');
    const recentDocs = await query('SELECT title, created_at FROM documents ORDER BY created_at DESC LIMIT 5');
    const topDocs = await query('SELECT title, download_count FROM documents ORDER BY download_count DESC LIMIT 5');

    res.json({
      counts: {
        documents: parseInt(docs.rows[0].count),
        countries: parseInt(countries.rows[0].count),
        roadmaps: parseInt(roadmaps.rows[0].count),
        news: parseInt(news.rows[0].count),
        downloads: parseInt(downloads.rows[0].count),
        totalDownloads: parseInt(totalDownloads.rows[0].total),
      },
      recent: recentDocs.rows,
      topDocuments: topDocs.rows,
    });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET /api/settings/users - admin
router.get('/users', authMiddleware, async (req, res) => {
  try {
    const result = await query('SELECT id, name, email, role, is_active, last_login, created_at FROM users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/settings/users - create admin user
router.post('/users', authMiddleware, async (req, res) => {
  try {
    const bcrypt = require('bcryptjs');
    const { name, email, password, role } = req.body;
    const hash = await bcrypt.hash(password, 12);
    const result = await query(
      'INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, name, email, role, created_at',
      [name, email, hash, role || 'admin']
    );
    res.status(201).json(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') return res.status(400).json({ error: 'Email already exists' });
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/settings/users/:id
router.delete('/users/:id', authMiddleware, async (req, res) => {
  try {
    if (req.user.id === req.params.id) return res.status(400).json({ error: 'Cannot delete yourself' });
    await query('DELETE FROM users WHERE id = $1', [req.params.id]);
    res.json({ message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
