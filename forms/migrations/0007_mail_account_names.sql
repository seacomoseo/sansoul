ALTER TABLE mail_accounts ADD COLUMN display_name TEXT NOT NULL DEFAULT '';
ALTER TABLE forms_grants ADD COLUMN display_name TEXT NOT NULL DEFAULT '';

-- Keep custom identifiers recognizable as editable labels.
UPDATE mail_accounts SET display_name = id WHERE id NOT LIKE provider || '-%';
