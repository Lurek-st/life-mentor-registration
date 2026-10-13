-- Additive: original registrations and positive attendance evidence remain untouched.
CREATE TABLE IF NOT EXISTS attendance_revisions (
 session_id TEXT PRIMARY KEY REFERENCES sessions(id), revision INTEGER NOT NULL DEFAULT 0, time_changed_at INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS attendance_batches (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), fingerprint TEXT NOT NULL,
 operator TEXT NOT NULL, note TEXT NOT NULL, count INTEGER NOT NULL, created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE TABLE IF NOT EXISTS attendance_checks (
 id TEXT PRIMARY KEY, session_id TEXT NOT NULL REFERENCES sessions(id), employee_id TEXT NOT NULL,
 name TEXT NOT NULL, department TEXT NOT NULL, email TEXT NOT NULL DEFAULT '',
 outcome TEXT NOT NULL CHECK(outcome IN ('present','absent','unknown')),
 basis_json TEXT NOT NULL, session_start INTEGER NOT NULL, session_end INTEGER NOT NULL,
 operator TEXT NOT NULL, note TEXT NOT NULL, checked_at INTEGER NOT NULL,
 batch_id TEXT NOT NULL REFERENCES attendance_batches(id), version INTEGER NOT NULL DEFAULT 1,
 UNIQUE(session_id,employee_id)
);
CREATE INDEX IF NOT EXISTS attendance_checks_session ON attendance_checks(session_id);
CREATE INDEX IF NOT EXISTS attendance_batches_session ON attendance_batches(session_id);
CREATE TRIGGER IF NOT EXISTS review_registrations_insert AFTER INSERT ON registrations BEGIN INSERT INTO attendance_revisions(session_id,revision) VALUES (NEW.session_id,1) ON CONFLICT(session_id) DO UPDATE SET revision=revision+1; END;
CREATE TRIGGER IF NOT EXISTS review_registrations_update AFTER UPDATE ON registrations BEGIN INSERT INTO attendance_revisions(session_id,revision) VALUES (NEW.session_id,1) ON CONFLICT(session_id) DO UPDATE SET revision=revision+1; END;
CREATE TRIGGER IF NOT EXISTS review_registrations_delete AFTER DELETE ON registrations BEGIN INSERT INTO attendance_revisions(session_id,revision) VALUES (OLD.session_id,1) ON CONFLICT(session_id) DO UPDATE SET revision=revision+1; END;
CREATE TRIGGER IF NOT EXISTS review_attendance_records_insert AFTER INSERT ON attendance_records BEGIN INSERT INTO attendance_revisions(session_id,revision) VALUES (NEW.session_id,1) ON CONFLICT(session_id) DO UPDATE SET revision=revision+1; END;
CREATE TRIGGER IF NOT EXISTS review_attendance_records_update AFTER UPDATE ON attendance_records BEGIN INSERT INTO attendance_revisions(session_id,revision) VALUES (NEW.session_id,1) ON CONFLICT(session_id) DO UPDATE SET revision=revision+1; END;
CREATE TRIGGER IF NOT EXISTS review_attendance_records_delete AFTER DELETE ON attendance_records BEGIN INSERT INTO attendance_revisions(session_id,revision) VALUES (OLD.session_id,1) ON CONFLICT(session_id) DO UPDATE SET revision=revision+1; END;
CREATE TRIGGER IF NOT EXISTS review_attendance_checks_insert AFTER INSERT ON attendance_checks BEGIN INSERT INTO attendance_revisions(session_id,revision) VALUES (NEW.session_id,1) ON CONFLICT(session_id) DO UPDATE SET revision=revision+1; END;
CREATE TRIGGER IF NOT EXISTS review_attendance_checks_update AFTER UPDATE ON attendance_checks BEGIN INSERT INTO attendance_revisions(session_id,revision) VALUES (NEW.session_id,1) ON CONFLICT(session_id) DO UPDATE SET revision=revision+1; END;
CREATE TRIGGER IF NOT EXISTS review_attendance_checks_delete AFTER DELETE ON attendance_checks BEGIN INSERT INTO attendance_revisions(session_id,revision) VALUES (OLD.session_id,1) ON CONFLICT(session_id) DO UPDATE SET revision=revision+1; END;
CREATE TRIGGER IF NOT EXISTS review_session_update AFTER UPDATE OF start_at,end_at,state,version ON sessions BEGIN INSERT INTO attendance_revisions(session_id,revision) VALUES (NEW.id,1) ON CONFLICT(session_id) DO UPDATE SET revision=revision+1; END;
CREATE TRIGGER IF NOT EXISTS review_time_change AFTER UPDATE OF start_at,end_at ON sessions WHEN OLD.start_at<>NEW.start_at OR OLD.end_at<>NEW.end_at BEGIN INSERT INTO attendance_revisions(session_id,revision,time_changed_at) VALUES(NEW.id,1,unixepoch()) ON CONFLICT(session_id) DO UPDATE SET revision=revision+1,time_changed_at=unixepoch(); END;
