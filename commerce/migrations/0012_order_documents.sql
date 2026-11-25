-- 14.22: «documentos enviados» mark of the orders panel (order_documents: true).
-- One row per order whose invoice/PDFs the owner already sent by hand.
CREATE TABLE order_documents (
  order_id TEXT PRIMARY KEY REFERENCES orders(id),
  sent_at INTEGER NOT NULL
);
