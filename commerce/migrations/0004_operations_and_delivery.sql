CREATE TABLE order_delivery_details (
  order_id TEXT PRIMARY KEY REFERENCES orders(id),
  source TEXT NOT NULL CHECK (source = 'stripe_checkout'),
  buyer_name TEXT,
  buyer_email TEXT,
  buyer_phone TEXT,
  recipient_name TEXT,
  address_line1 TEXT,
  address_line2 TEXT,
  locality TEXT,
  administrative_area TEXT,
  postal_code TEXT,
  country_code TEXT CHECK (country_code IS NULL OR (length(country_code) = 2 AND country_code NOT GLOB '*[^A-Z]*')),
  updated_at INTEGER NOT NULL
);

ALTER TABLE webhook_events ADD COLUMN recovery_json TEXT;

CREATE TABLE commerce_operation_cursors (
  operation TEXT PRIMARY KEY CHECK (operation IN ('orders', 'unmatched_webhooks')),
  cursor_created_at INTEGER NOT NULL DEFAULT 0,
  cursor_id TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0
);
INSERT INTO commerce_operation_cursors (operation) VALUES ('orders'), ('unmatched_webhooks');
