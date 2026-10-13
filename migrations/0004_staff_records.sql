-- Apply once to an existing v2 database. Additive fields preserve all existing registrations.
ALTER TABLE registrations ADD COLUMN source TEXT NOT NULL DEFAULT 'self' CHECK(source IN ('self','staff'));
ALTER TABLE registrations ADD COLUMN recorded_by TEXT NOT NULL DEFAULT '';
ALTER TABLE registrations ADD COLUMN staff_note TEXT NOT NULL DEFAULT '';
DROP TRIGGER registration_gate_v2;
CREATE TRIGGER IF NOT EXISTS registration_gate_v2 BEFORE INSERT ON registrations WHEN NEW.cancelled_at IS NULL BEGIN
 SELECT CASE WHEN NEW.source='self' AND (SELECT value FROM settings WHERE key='registration_open')!='true' THEN RAISE(ABORT,'REGISTRATION_CLOSED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sessions WHERE id=NEW.session_id AND (state='published' OR (NEW.source='staff' AND state='paused'))) THEN RAISE(ABORT,'SESSION_UNAVAILABLE') END;
 SELECT CASE WHEN NEW.source='self' AND (SELECT deadline_at FROM sessions WHERE id=NEW.session_id)<=unixepoch() THEN RAISE(ABORT,'DEADLINE_PASSED') END;
 SELECT CASE WHEN NEW.source='staff' AND ((SELECT end_at FROM sessions WHERE id=NEW.session_id)<=unixepoch() OR length(trim(NEW.recorded_by))=0 OR length(trim(NEW.staff_note))=0) THEN RAISE(ABORT,'STAFF_REGISTRATION_INVALID') END;
 SELECT CASE WHEN (SELECT content_version FROM sessions WHERE id=NEW.session_id)!=NEW.confirmed_revision THEN RAISE(ABORT,'SESSION_CHANGED') END;
 SELECT CASE WHEN (SELECT booked_count>=capacity FROM sessions WHERE id=NEW.session_id) THEN RAISE(ABORT,'SESSION_FULL') END;
 SELECT CASE WHEN CAST((SELECT value FROM settings WHERE key='max_sessions') AS INTEGER)>0 AND (SELECT COUNT(*) FROM registrations r JOIN sessions s ON s.id=r.session_id WHERE r.employee_hash=NEW.employee_hash AND r.cancelled_at IS NULL AND s.state IN ('published','paused'))>=CAST((SELECT value FROM settings WHERE key='max_sessions') AS INTEGER) THEN RAISE(ABORT,'PERSON_LIMIT') END;
END;
CREATE TABLE IF NOT EXISTS attendance_records(
 id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES sessions(id),name TEXT NOT NULL,department TEXT NOT NULL,
 employee_id TEXT NOT NULL,employee_hash TEXT NOT NULL,email TEXT NOT NULL DEFAULT '',
 confirmed_by TEXT NOT NULL,confirmation_note TEXT NOT NULL,request_id TEXT NOT NULL UNIQUE,request_fingerprint TEXT NOT NULL,
 version INTEGER NOT NULL DEFAULT 1,created_at INTEGER NOT NULL DEFAULT(unixepoch()),updated_at INTEGER NOT NULL DEFAULT(unixepoch()),
 cancelled_at INTEGER,cancel_reason TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS active_attendance_employee_session ON attendance_records(session_id,employee_hash) WHERE cancelled_at IS NULL;
CREATE INDEX IF NOT EXISTS attendance_session_created ON attendance_records(session_id,cancelled_at,created_at);
CREATE TRIGGER IF NOT EXISTS attendance_gate BEFORE INSERT ON attendance_records WHEN NEW.cancelled_at IS NULL BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sessions WHERE id=NEW.session_id AND state IN ('published','paused','archived')) THEN RAISE(ABORT,'SESSION_UNAVAILABLE') END;
 SELECT CASE WHEN (SELECT start_at FROM sessions WHERE id=NEW.session_id)>unixepoch() THEN RAISE(ABORT,'ATTENDANCE_TOO_EARLY') END;
 SELECT CASE WHEN length(trim(NEW.confirmed_by))=0 OR length(trim(NEW.confirmation_note))=0 THEN RAISE(ABORT,'ATTENDANCE_CONFIRMATION_REQUIRED') END;
END;
CREATE TRIGGER IF NOT EXISTS attendance_no_move BEFORE UPDATE OF session_id ON attendance_records WHEN NEW.session_id!=OLD.session_id BEGIN SELECT RAISE(ABORT,'MOVE_NOT_ALLOWED'); END;
CREATE TRIGGER IF NOT EXISTS attendance_no_reactivate BEFORE UPDATE OF cancelled_at ON attendance_records WHEN OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS NULL BEGIN SELECT RAISE(ABORT,'REACTIVATION_NOT_ALLOWED'); END;
