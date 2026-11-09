-- Bound expired-lease selection without sorting the entire processing backlog.
CREATE INDEX outbox_expired_claims ON outbox(claimed_at, event_key)
  WHERE status = 'processing';

-- Preserve the exact pending response contract; this is a smaller index scan,
-- not a constant-work count. Delivered history is excluded from this index.
CREATE INDEX outbox_undelivered ON outbox(status, event_key)
  WHERE status != 'delivered';
