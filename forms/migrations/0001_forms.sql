-- SanSoul forms module. D1 is the canonical record; KV only holds attachment
-- bytes until the owner notification that carries them has been sent.
CREATE TABLE forms_submissions (
  id TEXT PRIMARY KEY,
  form_key TEXT NOT NULL,
  page TEXT NOT NULL,
  digest TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('accepted', 'review')),
  reasons TEXT NOT NULL DEFAULT '[]',
  fields TEXT NOT NULL,
  files TEXT NOT NULL DEFAULT '[]',
  created_at INTEGER NOT NULL,
  files_purged_at INTEGER
);

CREATE INDEX forms_submissions_created ON forms_submissions (created_at);

CREATE TRIGGER forms_submissions_immutable
BEFORE UPDATE OF id, form_key, page, digest, status, reasons, fields, files, created_at ON forms_submissions
BEGIN
  SELECT RAISE(ABORT, 'forms_submission_immutable');
END;

CREATE TABLE forms_jobs (
  id TEXT PRIMARY KEY,
  submission_id TEXT NOT NULL REFERENCES forms_submissions (id),
  channel TEXT NOT NULL CHECK (channel IN ('owner', 'confirmation')),
  state TEXT NOT NULL CHECK (state IN ('pending', 'leased', 'sent', 'held', 'failed')),
  authority TEXT NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at INTEGER NOT NULL,
  lease_token TEXT,
  lease_until INTEGER,
  sending_at INTEGER,
  provider_ref TEXT,
  last_error TEXT,
  updated_at INTEGER NOT NULL
);

CREATE INDEX forms_jobs_due ON forms_jobs (state, next_attempt_at);
CREATE INDEX forms_jobs_submission ON forms_jobs (submission_id);

-- The delivery authority (provider, account, recipients, texts) is fixed when
-- the submission is accepted; configuration changes never reassign history.
CREATE TRIGGER forms_jobs_authority_immutable
BEFORE UPDATE OF authority, submission_id, channel ON forms_jobs
BEGIN
  SELECT RAISE(ABORT, 'forms_job_authority_immutable');
END;

CREATE TABLE forms_rate (
  bucket TEXT PRIMARY KEY,
  hits INTEGER NOT NULL,
  window_start INTEGER NOT NULL
);
