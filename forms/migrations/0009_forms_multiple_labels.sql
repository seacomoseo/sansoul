CREATE TABLE forms_submission_labels (
  submission_id TEXT NOT NULL REFERENCES forms_submissions (id) ON DELETE CASCADE,
  label_id TEXT NOT NULL REFERENCES forms_labels (id) ON DELETE CASCADE,
  PRIMARY KEY (submission_id, label_id)
);

CREATE INDEX forms_submission_labels_by_label ON forms_submission_labels (label_id, submission_id);

INSERT INTO forms_submission_labels (submission_id, label_id)
SELECT submission_id, label_id FROM forms_annotations WHERE label_id IS NOT NULL;
