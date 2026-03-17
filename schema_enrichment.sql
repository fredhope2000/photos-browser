PRAGMA journal_mode = WAL;

CREATE TABLE IF NOT EXISTS asset_notes (
  asset_uuid TEXT PRIMARY KEY,
  rating INTEGER,
  summary TEXT,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asset_tags (
  asset_uuid TEXT NOT NULL,
  tag TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  confidence REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (asset_uuid, tag, source)
);

CREATE INDEX IF NOT EXISTS idx_asset_tags_asset_uuid
  ON asset_tags (asset_uuid);

CREATE INDEX IF NOT EXISTS idx_asset_tags_tag
  ON asset_tags (tag);

CREATE TABLE IF NOT EXISTS asset_places (
  asset_uuid TEXT PRIMARY KEY,
  place_name TEXT,
  region TEXT,
  country TEXT,
  source TEXT NOT NULL DEFAULT 'generated',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS asset_search_text (
  asset_uuid TEXT PRIMARY KEY,
  search_text TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
