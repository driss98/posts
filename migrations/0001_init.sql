CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, email TEXT UNIQUE, name TEXT, role TEXT DEFAULT 'editor',
  pass_hash TEXT, salt TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER, csrf TEXT, expires_at INTEGER
);
CREATE TABLE IF NOT EXISTS articles (
  slug TEXT PRIMARY KEY, title TEXT, description TEXT, type TEXT, skill TEXT, yarn TEXT, hook TEXT,
  time TEXT, images_json TEXT DEFAULT '[]', social_template TEXT, published_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS prep_cards (
  id INTEGER PRIMARY KEY, kind TEXT DEFAULT 'patterns', title TEXT, source_url TEXT, template TEXT,
  prompt_count INTEGER DEFAULT 8, status TEXT DEFAULT 'new', info_text TEXT,
  images_json TEXT DEFAULT '{}', prompts_text TEXT, notes TEXT, article_slug TEXT,
  filled_by TEXT, filled_at TEXT, prompted_at TEXT, ready_at TEXT, created_by TEXT, created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS social_articles (
  slug TEXT PRIMARY KEY, indexed INTEGER DEFAULT 0, indexed_at TEXT, notes TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS social_cards (
  slug TEXT, n INTEGER, fb_image TEXT, pin_image TEXT,
  fb_caption TEXT, fb_comment TEXT, pin_title TEXT, pin_desc TEXT, label TEXT,
  pin_topics TEXT, pin_board TEXT, template TEXT,
  fb_posted_at TEXT, pin_posted_at TEXT, fb_log TEXT DEFAULT '[]', pin_log TEXT DEFAULT '[]',
  pin_bulk_at TEXT, pin_bulk_date TEXT, pin_bulk_file TEXT,
  bad_at TEXT, bad_note TEXT, bad_by TEXT, updated_at TEXT,
  PRIMARY KEY (slug, n)
);
