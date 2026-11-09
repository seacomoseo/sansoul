-- Panel: the table view, the list of forms and a form's columns read only
-- that form's submissions.
CREATE INDEX forms_submissions_form ON forms_submissions (form_key, created_at);
