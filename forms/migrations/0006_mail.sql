-- 14.20: site mail accounts and routes ("Correo" panel), shared by forms,
-- commerce and later features. Gmail accounts stay in forms_grants; the other
-- providers live here, the API key or password encrypted with FORMS_GRANT_KEY
-- (AES-GCM bound to id, provider and sender). `fingerprint` identifies the
-- authority (provider, sender, server, user): rotating a key keeps it.
CREATE TABLE mail_accounts (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('brevo', 'smtp2go', 'smtp')),
  label TEXT NOT NULL DEFAULT '',
  sender TEXT NOT NULL,
  sender_name TEXT NOT NULL DEFAULT '',
  settings TEXT NOT NULL DEFAULT '{}',
  secret_enc TEXT NOT NULL,
  fingerprint TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  tested_at INTEGER,
  test_error TEXT
);

-- Account per kind of mail (mail/kinds.js); kind 'default' is the default account.
CREATE TABLE mail_routes (
  kind TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
