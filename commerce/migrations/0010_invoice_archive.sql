-- 14.10: Drive copy of each issued invoice (invoice.drive_archive). The invoices
-- table is immutable, so the Drive file lives in its own table, one row per invoice.
CREATE TABLE invoice_archive (
  invoice_id INTEGER PRIMARY KEY REFERENCES invoices(id),
  drive_file_id TEXT NOT NULL,
  link TEXT,
  created_at INTEGER NOT NULL
);
