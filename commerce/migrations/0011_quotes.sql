-- 14.11: proformas prepared in the orders panel from a cart quote request.
-- `data_json` is the current version (lines, totals, customer, texts); every send
-- bumps `version`. A proforma is not a tax document: its number is its own
-- sequence per year (P-2026-0001). The payment link carries a random token whose
-- SHA-256 is stored here. `order_id` is the latest payment attempt; orders made
-- from a proforma carry `quote` in their snapshot.
CREATE TABLE quotes (
  id TEXT PRIMARY KEY,
  submission_id TEXT UNIQUE,
  year INTEGER NOT NULL,
  number INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'paid', 'cancelled')),
  data_json TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  total_minor INTEGER NOT NULL CHECK (total_minor >= 0),
  token_hash TEXT UNIQUE CHECK (token_hash IS NULL OR (length(token_hash) = 64 AND token_hash NOT GLOB '*[^0-9a-f]*')),
  order_id TEXT,
  payment_method TEXT CHECK (payment_method IS NULL OR payment_method IN ('card', 'transfer')),
  sent_at INTEGER,
  valid_until INTEGER,
  paid_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (year, number)
);

CREATE INDEX quotes_updated ON quotes (updated_at);
