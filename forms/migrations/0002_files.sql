-- Attachments arrive one raw upload per file (no multipart parsing in the
-- Worker). An upload is staged here until its submission commits; rows left
-- behind by abandoned forms are swept with their KV bytes after a day.
CREATE TABLE forms_uploads (
  submission_id TEXT NOT NULL,
  idx INTEGER NOT NULL,
  form_key TEXT NOT NULL,
  field TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  size INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  kv_key TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (submission_id, idx)
);

CREATE INDEX forms_uploads_created ON forms_uploads (created_at);

-- Large attachments go to the sender account's Drive. The file ID is generated
-- and stored before any upload, so every retry targets the same file.
CREATE TABLE forms_drive_files (
  submission_id TEXT NOT NULL REFERENCES forms_submissions (id),
  idx INTEGER NOT NULL,
  drive_id TEXT NOT NULL,
  folder_id TEXT,
  link TEXT,
  verified_at INTEGER,
  PRIMARY KEY (submission_id, idx)
);

-- Folder IDs per account and path (Forms/<project>/<form>), resolved once.
CREATE TABLE forms_drive_folders (
  account TEXT NOT NULL,
  path TEXT NOT NULL,
  folder_id TEXT NOT NULL,
  PRIMARY KEY (account, path)
);
