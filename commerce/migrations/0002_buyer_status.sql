CREATE TABLE IF NOT EXISTS order_status_capabilities (
  capability_hash TEXT PRIMARY KEY CHECK (
    length(capability_hash) = 64 AND capability_hash NOT GLOB '*[^0-9a-f]*'
  ),
  order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
  idempotency_key TEXT NOT NULL UNIQUE REFERENCES commerce_idempotency(idempotency_key),
  session_id TEXT UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL CHECK (expires_at > created_at)
);
CREATE INDEX IF NOT EXISTS order_status_capabilities_expiry ON order_status_capabilities(expires_at);