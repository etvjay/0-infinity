CREATE TABLE IF NOT EXISTS projection_snapshots (
  id TEXT PRIMARY KEY CHECK (id = 'current'),
  revision INTEGER NOT NULL CHECK (revision >= 0),
  snapshot_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

INSERT OR IGNORE INTO projection_snapshots
  (id, revision, snapshot_json, provenance_json, updated_at)
VALUES
  ('current', 0,
   '{"version":1,"workflows":{}}',
   '{"source":"zero-infinity","schema":"product-projection","schemaVersion":1,"generatedAt":0,"workflows":{}}',
   0);
