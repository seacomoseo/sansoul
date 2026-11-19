CREATE TABLE forms_labels (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  color TEXT NOT NULL
);

CREATE TABLE forms_annotations (
  submission_id TEXT PRIMARY KEY REFERENCES forms_submissions (id) ON DELETE CASCADE,
  note TEXT NOT NULL DEFAULT '',
  label_id TEXT REFERENCES forms_labels (id) ON DELETE SET NULL
);

CREATE INDEX forms_annotations_label ON forms_annotations (label_id);
