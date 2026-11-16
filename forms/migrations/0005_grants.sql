-- 14.10: Google grants connected from the panel (refresh token encrypted with
-- FORMS_GRANT_KEY, AES-GCM bound to ref+account). One row per reference.
CREATE TABLE forms_grants (
  ref TEXT PRIMARY KEY,
  account TEXT NOT NULL,
  scopes TEXT NOT NULL,
  token_enc TEXT NOT NULL,
  client_fp TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
