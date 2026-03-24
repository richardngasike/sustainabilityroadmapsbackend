require('dotenv').config();
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');

async function seed() {
  console.log('Seeding database...');

  try {
    // Admin user
    const passwordHash = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin@2026!', 12);

    await query(`
      INSERT INTO users (name, email, password_hash, role)
      VALUES ('UNAIDS Admin', $1, $2, 'super_admin')
      ON CONFLICT (email) 
      DO UPDATE SET password_hash = EXCLUDED.password_hash;
    `, [process.env.ADMIN_EMAIL || 'admin@unaids.org', passwordHash]);

    console.log('Database seeded successfully');
    process.exit(0);
  } catch (err) {
    console.error('Seeding failed:', err);
    process.exit(1);
  }
}

seed();