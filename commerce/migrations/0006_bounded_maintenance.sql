-- Preserve existing cursor positions, add revision CAS (including singleton wrap).
CREATE TABLE commerce_operation_cursors_v2 (
  operation TEXT PRIMARY KEY CHECK (operation IN ('orders', 'unmatched_webhooks', 'expiration')),
  cursor_created_at INTEGER NOT NULL DEFAULT 0,
  cursor_id TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0,
  revision INTEGER NOT NULL DEFAULT 0
);
INSERT INTO commerce_operation_cursors_v2 (operation, cursor_created_at, cursor_id, updated_at)
  SELECT operation, cursor_created_at, cursor_id, updated_at FROM commerce_operation_cursors;
INSERT INTO commerce_operation_cursors_v2 (operation) VALUES ('expiration');
DROP TABLE commerce_operation_cursors;
ALTER TABLE commerce_operation_cursors_v2 RENAME TO commerce_operation_cursors;

-- Select one due notification without sorting or counting the backlog.
CREATE INDEX outbox_due_notifications ON outbox(next_attempt_at, event_key)
  WHERE status = 'pending';
CREATE INDEX orders_maintenance_rotation ON orders(created_at, id)
  WHERE payment_status IN ('pending', 'failed', 'partially_refunded');
CREATE INDEX webhook_unmatched_rotation ON webhook_events(received_at, event_id)
  WHERE status = 'unmatched' AND recovery_json IS NOT NULL;
