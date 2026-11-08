CREATE TABLE commerce_idempotency (
  idempotency_key TEXT PRIMARY KEY,
  request_hash TEXT NOT NULL,
  order_id TEXT NOT NULL UNIQUE,
  snapshot_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('creating', 'ready')),
  session_id TEXT UNIQUE,
  checkout_url TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  CHECK ((status = 'creating' AND checkout_url IS NULL) OR (status = 'ready' AND session_id IS NOT NULL AND checkout_url IS NOT NULL))
);

CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  session_id TEXT UNIQUE,
  payment_intent_id TEXT UNIQUE,
  idempotency_key TEXT NOT NULL UNIQUE REFERENCES commerce_idempotency(idempotency_key),
  catalog_release TEXT NOT NULL,
  currency TEXT NOT NULL CHECK (length(currency) = 3),
  amount_total_minor INTEGER NOT NULL CHECK (amount_total_minor >= 0),
  snapshot_json TEXT NOT NULL,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('pending', 'paid', 'failed', 'expired', 'partially_refunded', 'refunded')),
  fulfillment_status TEXT NOT NULL CHECK (fulfillment_status IN ('awaiting_payment', 'ready', 'manufacturing', 'shipped', 'cancelled', 'inventory_exception')),
  reservation_state TEXT NOT NULL DEFAULT 'unreserved' CHECK (reservation_state IN ('unreserved', 'reserved')),
  refund_amount_minor INTEGER NOT NULL DEFAULT 0 CHECK (refund_amount_minor >= 0),
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX orders_payment_created ON orders(payment_status, created_at DESC);
CREATE INDEX orders_fulfillment_created ON orders(fulfillment_status, created_at DESC);
CREATE INDEX orders_release ON orders(catalog_release);

CREATE TRIGGER orders_snapshot_immutable
BEFORE UPDATE OF id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, created_at, expires_at ON orders
WHEN OLD.id IS NOT NEW.id
  OR OLD.idempotency_key IS NOT NEW.idempotency_key
  OR OLD.catalog_release IS NOT NEW.catalog_release
  OR OLD.currency IS NOT NEW.currency
  OR OLD.amount_total_minor IS NOT NEW.amount_total_minor
  OR OLD.snapshot_json IS NOT NEW.snapshot_json
  OR OLD.created_at IS NOT NEW.created_at
  OR OLD.expires_at IS NOT NEW.expires_at
BEGIN
  SELECT RAISE(ABORT, 'order_snapshot_immutable');
END;

CREATE TABLE inventory (
  product_id TEXT PRIMARY KEY,
  on_hand INTEGER NOT NULL CHECK (on_hand >= 0),
  updated_at INTEGER NOT NULL
);

CREATE TABLE stock_reservations (
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL REFERENCES inventory(product_id),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  status TEXT NOT NULL CHECK (status IN ('held', 'committed', 'released', 'expired')),
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (order_id, product_id)
);
CREATE INDEX reservations_product_state_expiry ON stock_reservations(product_id, status, expires_at);

CREATE TRIGGER reservations_check_available
BEFORE INSERT ON stock_reservations
WHEN NEW.status = 'held'
BEGIN
  SELECT CASE
    WHEN NOT EXISTS (SELECT 1 FROM inventory WHERE product_id = NEW.product_id)
    THEN RAISE(ABORT, 'inventory_not_configured')
  END;
  SELECT CASE
    WHEN (SELECT on_hand FROM inventory WHERE product_id = NEW.product_id) < NEW.quantity + (
      SELECT COALESCE(SUM(quantity), 0)
      FROM stock_reservations
      WHERE product_id = NEW.product_id
        AND status IN ('committed', 'held')
    )
    THEN RAISE(ABORT, 'insufficient_stock')
  END;
END;

CREATE TRIGGER inventory_cannot_reduce_below_commitments
BEFORE UPDATE OF on_hand ON inventory
WHEN NEW.on_hand < (
  SELECT COALESCE(SUM(quantity), 0)
  FROM stock_reservations
  WHERE product_id = OLD.product_id
    AND status IN ('committed', 'held')
)
BEGIN
  SELECT RAISE(ABORT, 'inventory_below_commitments');
END;

CREATE TABLE rate_limits (
  client_key TEXT PRIMARY KEY,
  window_start INTEGER NOT NULL,
  request_count INTEGER NOT NULL CHECK (request_count > 0),
  updated_at INTEGER NOT NULL
);
CREATE INDEX rate_limits_window ON rate_limits(window_start);

CREATE TABLE webhook_events (
  event_id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  event_created INTEGER NOT NULL,
  body_sha256 TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('processed', 'ignored', 'unmatched')),
  received_at INTEGER NOT NULL,
  processed_at INTEGER
);
CREATE INDEX webhook_events_status_received ON webhook_events(status, received_at);

CREATE TABLE outbox (
  event_key TEXT PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id),
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'delivered')),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at INTEGER NOT NULL,
  claimed_at INTEGER,
  last_error TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX outbox_due ON outbox(status, next_attempt_at, created_at);
