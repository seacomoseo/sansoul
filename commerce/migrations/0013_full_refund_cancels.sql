-- 14.29: a full refund cancels any order not shipped yet and gives its units back.
-- Repairs orders refunded before this release (e.g. stuck in manufacturing) and
-- releases units still reserved by orders already cancelled. Shipped orders keep
-- their phase and their committed units.
UPDATE orders SET fulfillment_status = 'cancelled', updated_at = CAST(strftime('%s', 'now') AS INTEGER)
WHERE payment_status = 'refunded' AND refund_amount_minor >= amount_total_minor
  AND fulfillment_status IN ('awaiting_payment', 'ready', 'manufacturing', 'inventory_exception');

UPDATE stock_reservations SET status = 'released', updated_at = CAST(strftime('%s', 'now') AS INTEGER)
WHERE status IN ('held', 'committed')
  AND order_id IN (SELECT id FROM orders WHERE fulfillment_status = 'cancelled' AND payment_status IN ('refunded', 'partially_refunded'));
