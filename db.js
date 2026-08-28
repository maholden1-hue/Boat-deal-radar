
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.env.DB_PATH || path.join(__dirname, 'data', 'boats.db');
const db = new Database(dbPath);
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS listings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,
  source_id TEXT,
  url TEXT UNIQUE,
  title TEXT,
  year INTEGER,
  make TEXT,
  model TEXT,
  location TEXT,
  latitude REAL,
  longitude REAL,
  distance_miles REAL,
  asking_price REAL,
  length_ft REAL,
  horsepower REAL,
  engine_make TEXT,
  engine_hours REAL,
  seating INTEGER,
  has_ttop INTEGER DEFAULT 0,
  ttop_type TEXT,
  has_trolling INTEGER DEFAULT 0,
  has_powerpole INTEGER DEFAULT 0,
  has_jackplate INTEGER DEFAULT 0,
  trailer TEXT,
  estimated_new_low REAL,
  estimated_new_high REAL,
  fair_value_low REAL,
  fair_value_high REAL,
  accessories_new_low REAL,
  accessories_new_high REAL,
  accessories_today_low REAL,
  accessories_today_high REAL,
  cost_to_complete REAL,
  all_in REAL,
  deal_score REAL,
  why TEXT,
  status TEXT DEFAULT 'new',
  favorite INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  first_seen TEXT,
  last_seen TEXT,
  last_checked TEXT,
  raw_excerpt TEXT
);

CREATE TABLE IF NOT EXISTS price_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  listing_id INTEGER,
  price REAL,
  observed_at TEXT,
  FOREIGN KEY(listing_id) REFERENCES listings(id)
);

CREATE INDEX IF NOT EXISTS idx_listings_active_score ON listings(is_active, deal_score);
CREATE INDEX IF NOT EXISTS idx_price_history_listing ON price_history(listing_id, observed_at);
`);

module.exports = db;
