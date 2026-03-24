require('dotenv').config();
const { query } = require('../config/db');

async function migrate() {
  console.log('🚀 Running database migrations...');

  try {
    // Users / Admins
    await query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) DEFAULT 'admin',
        avatar_url TEXT,
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Hero Slides
    await query(`
      CREATE TABLE IF NOT EXISTS hero_slides (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(500) NOT NULL,
        subtitle TEXT,
        description TEXT,
        image_url TEXT NOT NULL,
        cta_text VARCHAR(255),
        cta_link VARCHAR(500),
        badge_text VARCHAR(100),
        sort_order INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Categories for documents
    await query(`
      CREATE TABLE IF NOT EXISTS categories (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        slug VARCHAR(255) UNIQUE NOT NULL,
        description TEXT,
        icon VARCHAR(100),
        color VARCHAR(50),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Documents (main library)
    await query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(500) NOT NULL,
        description TEXT,
        category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
        file_url TEXT NOT NULL,
        file_name VARCHAR(500) NOT NULL,
        file_size BIGINT DEFAULT 0,
        file_type VARCHAR(100) DEFAULT 'application/pdf',
        thumbnail_url TEXT,
        language VARCHAR(10) DEFAULT 'en',
        region VARCHAR(255),
        year INTEGER,
        tags TEXT[],
        download_count INTEGER DEFAULT 0,
        is_featured BOOLEAN DEFAULT false,
        is_published BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Country Profiles
    await query(`
      CREATE TABLE IF NOT EXISTS country_profiles (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        country_name VARCHAR(255) NOT NULL,
        country_code CHAR(3) NOT NULL,
        region VARCHAR(255) NOT NULL,
        sub_region VARCHAR(255),
        description TEXT,
        file_url TEXT,
        file_name VARCHAR(500),
        file_size BIGINT DEFAULT 0,
        thumbnail_url TEXT,
        year INTEGER,
        population BIGINT,
        hiv_data JSONB,
        sustainability_score INTEGER,
        download_count INTEGER DEFAULT 0,
        is_published BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Sustainability Roadmaps
    await query(`
      CREATE TABLE IF NOT EXISTS roadmaps (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(500) NOT NULL,
        country VARCHAR(255),
        country_code CHAR(3),
        region VARCHAR(255),
        description TEXT,
        file_url TEXT,
        file_name VARCHAR(500),
        file_size BIGINT DEFAULT 0,
        status VARCHAR(100) DEFAULT 'active',
        year INTEGER,
        implementation_period VARCHAR(255),
        partners TEXT[],
        download_count INTEGER DEFAULT 0,
        is_featured BOOLEAN DEFAULT false,
        is_published BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // News & Updates
    await query(`
      CREATE TABLE IF NOT EXISTS news (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(500) NOT NULL,
        slug VARCHAR(500) UNIQUE NOT NULL,
        excerpt TEXT,
        content TEXT,
        cover_image TEXT,
        author VARCHAR(255),
        tags TEXT[],
        region VARCHAR(255),
        is_featured BOOLEAN DEFAULT false,
        is_published BOOLEAN DEFAULT false,
        published_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Site Settings
    await query(`
      CREATE TABLE IF NOT EXISTS site_settings (
        key VARCHAR(255) PRIMARY KEY,
        value TEXT,
        type VARCHAR(50) DEFAULT 'text',
        label VARCHAR(255),
        group_name VARCHAR(100),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Download logs
    await query(`
      CREATE TABLE IF NOT EXISTS download_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_type VARCHAR(50) NOT NULL,
        document_id UUID NOT NULL,
        ip_address VARCHAR(100),
        user_agent TEXT,
        country_code VARCHAR(10),
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Indexes for performance
    await query(`CREATE INDEX IF NOT EXISTS idx_documents_category ON documents(category_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_documents_published ON documents(is_published);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_documents_year ON documents(year);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_documents_region ON documents(region);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_documents_language ON documents(language);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_country_profiles_region ON country_profiles(region);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_country_profiles_code ON country_profiles(country_code);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_roadmaps_country ON roadmaps(country_code);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_news_slug ON news(slug);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_news_published ON news(is_published);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_download_logs_type_id ON download_logs(document_type, document_id);`);

    console.log('✅ All tables created successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

migrate()
  .then(() => {
    console.log('✅ Migration completed');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration error:', err);
    process.exit(1);
  });
