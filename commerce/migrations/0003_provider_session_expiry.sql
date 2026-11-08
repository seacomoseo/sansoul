DROP TRIGGER IF EXISTS orders_snapshot_immutable;
CREATE TRIGGER orders_snapshot_immutable
BEFORE UPDATE OF id, idempotency_key, catalog_release, currency, amount_total_minor, snapshot_json, created_at ON orders
WHEN OLD.id IS NOT NEW.id
  OR OLD.idempotency_key IS NOT NEW.idempotency_key
  OR OLD.catalog_release IS NOT NEW.catalog_release
  OR OLD.currency IS NOT NEW.currency
  OR OLD.amount_total_minor IS NOT NEW.amount_total_minor
  OR OLD.snapshot_json IS NOT NEW.snapshot_json
  OR OLD.created_at IS NOT NEW.created_at
BEGIN
  SELECT RAISE(ABORT, 'order_snapshot_immutable');
END;
