-- Issued invoices and credit notes (facturas y rectificativas). Rows are fiscal
-- records: never updated or deleted by the engine. `data_json` keeps everything the
-- PDF needs (seller, customer, lines, taxes) so it can be regenerated after the
-- delivery data of the order has been erased. Numbers are assigned inside the same
-- INSERT that stores the row, so a failed insert leaves no gap; each series
-- (prefix and, optionally, year) counts from its own start.
CREATE TABLE invoices (
  id INTEGER PRIMARY KEY,
  kind TEXT NOT NULL CHECK (kind IN ('invoice', 'credit_note')),
  order_id TEXT NOT NULL REFERENCES orders(id),
  reference TEXT NOT NULL,
  series TEXT NOT NULL,
  number INTEGER NOT NULL CHECK (number > 0),
  issued_at INTEGER NOT NULL,
  total_minor INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  UNIQUE (order_id, kind, reference),
  UNIQUE (series, number)
);

CREATE TRIGGER invoices_immutable_update
BEFORE UPDATE ON invoices
BEGIN
  SELECT RAISE(ABORT, 'invoice_immutable');
END;

CREATE TRIGGER invoices_immutable_delete
BEFORE DELETE ON invoices
BEGIN
  SELECT RAISE(ABORT, 'invoice_immutable');
END;
