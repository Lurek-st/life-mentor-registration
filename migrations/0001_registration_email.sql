-- Existing v2 databases only. No records, identifiers or capacity counters are changed.
ALTER TABLE registrations ADD COLUMN email TEXT NOT NULL DEFAULT '';
