-- Panel: jobs by state and time (sent in 24 h, attention and review counts)
-- read only the jobs they count instead of every row.
CREATE INDEX forms_jobs_state_updated ON forms_jobs (state, updated_at);

-- One database per project: the panel records the site that first used it
-- and warns when another site's Worker is bound to the same D1.
CREATE TABLE forms_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
