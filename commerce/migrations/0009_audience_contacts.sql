-- 14.4: contacts with an optional, versioned promotions consent (module audience).
-- Only written when the project enables `audience` in data/commerce.yml. One row
-- per normalized email; a consent is never inferred, a later order without the box
-- keeps an earlier consent, and unsubscribed_at is cleared only by a new consent.
CREATE TABLE contacts (
  email TEXT PRIMARY KEY,
  name TEXT,
  locale TEXT,
  source TEXT NOT NULL CHECK (source IN ('order', 'form')),
  consent_promotions INTEGER NOT NULL DEFAULT 0 CHECK (consent_promotions IN (0, 1)),
  consent_at INTEGER,
  consent_version TEXT,
  consent_ref TEXT,
  unsubscribed_at INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
) WITHOUT ROWID;
CREATE INDEX contacts_consent ON contacts (consent_promotions, unsubscribed_at, email);
