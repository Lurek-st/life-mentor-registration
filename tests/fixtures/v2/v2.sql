PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS edit_guards(scope TEXT PRIMARY KEY,expected TEXT,actual TEXT);
CREATE TRIGGER IF NOT EXISTS edit_guard_check BEFORE INSERT ON edit_guards WHEN NEW.expected<>NEW.actual BEGIN SELECT RAISE(ABORT,'EDIT_CONFLICT'); END;
CREATE TABLE IF NOT EXISTS schema_meta (version INTEGER PRIMARY KEY);
INSERT OR IGNORE INTO schema_meta VALUES (2);
CREATE TABLE IF NOT EXISTS rounds(id TEXT PRIMARY KEY,title TEXT NOT NULL,sort_order INTEGER NOT NULL,version INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
INSERT OR IGNORE INTO settings VALUES ('max_sessions','0'),('self_cancel','true'),('registration_open','true'),('contact','本次活动组织方（请配置联系方式）'),('retention','演示环境请只填写虚构信息。正式使用前，组织方应明确资料用途、保存期限、更正和删除的联系途径，并在此更新说明。'),('version','1');
CREATE TABLE IF NOT EXISTS sessions(
 id TEXT PRIMARY KEY,round_id TEXT NOT NULL REFERENCES rounds(id),sort_order INTEGER NOT NULL DEFAULT 0,
 template_key TEXT NOT NULL,title TEXT NOT NULL,title_en TEXT NOT NULL DEFAULT '',subjects TEXT NOT NULL,agenda TEXT NOT NULL,
 venue TEXT NOT NULL,start_at INTEGER NOT NULL,end_at INTEGER NOT NULL,deadline_at INTEGER NOT NULL,
 capacity INTEGER NOT NULL DEFAULT 36 CHECK(capacity BETWEEN 1 AND 100000),
 state TEXT NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','paused','cancelled','archived')),
 version INTEGER NOT NULL DEFAULT 1,content_version INTEGER NOT NULL DEFAULT 1,
 booked_count INTEGER NOT NULL DEFAULT 0 CHECK(booked_count>=0),change_note TEXT NOT NULL DEFAULT '',updated_at INTEGER NOT NULL DEFAULT(unixepoch()),
 CHECK(end_at>start_at),CHECK(deadline_at<start_at)
);
CREATE TABLE IF NOT EXISTS registrations(
 id TEXT PRIMARY KEY,session_id TEXT NOT NULL REFERENCES sessions(id),name TEXT NOT NULL,department TEXT NOT NULL,
 employee_id TEXT NOT NULL,employee_hash TEXT NOT NULL,receipt_hash TEXT NOT NULL,request_id TEXT NOT NULL UNIQUE,request_fingerprint TEXT NOT NULL,
 confirmed_revision INTEGER NOT NULL,snapshot TEXT NOT NULL,version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL DEFAULT(unixepoch()),cancelled_at INTEGER,cancel_reason TEXT NOT NULL DEFAULT ''
);
CREATE UNIQUE INDEX IF NOT EXISTS active_employee_session ON registrations(session_id,employee_hash) WHERE cancelled_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS receipt_lookup_v2 ON registrations(receipt_hash);
CREATE INDEX IF NOT EXISTS person_active_v2 ON registrations(employee_hash,cancelled_at,session_id);
CREATE INDEX IF NOT EXISTS session_registrations_v2 ON registrations(session_id,cancelled_at,created_at);
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT,action TEXT NOT NULL,target TEXT NOT NULL,before_json TEXT,after_json TEXT,created_at INTEGER NOT NULL DEFAULT(unixepoch()));
CREATE TABLE IF NOT EXISTS admin_sessions(token_hash TEXT PRIMARY KEY,expires_at INTEGER NOT NULL,created_at INTEGER NOT NULL DEFAULT(unixepoch()));
CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL);
CREATE TRIGGER IF NOT EXISTS registration_gate_v2 BEFORE INSERT ON registrations WHEN NEW.cancelled_at IS NULL BEGIN
 SELECT CASE WHEN (SELECT value FROM settings WHERE key='registration_open')!='true' THEN RAISE(ABORT,'REGISTRATION_CLOSED') END;
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM sessions WHERE id=NEW.session_id AND state='published') THEN RAISE(ABORT,'SESSION_UNAVAILABLE') END;
 SELECT CASE WHEN (SELECT deadline_at FROM sessions WHERE id=NEW.session_id)<=unixepoch() THEN RAISE(ABORT,'DEADLINE_PASSED') END;
 SELECT CASE WHEN (SELECT content_version FROM sessions WHERE id=NEW.session_id)!=NEW.confirmed_revision THEN RAISE(ABORT,'SESSION_CHANGED') END;
 SELECT CASE WHEN (SELECT booked_count>=capacity FROM sessions WHERE id=NEW.session_id) THEN RAISE(ABORT,'SESSION_FULL') END;
 SELECT CASE WHEN CAST((SELECT value FROM settings WHERE key='max_sessions') AS INTEGER)>0 AND (SELECT COUNT(*) FROM registrations r JOIN sessions s ON s.id=r.session_id WHERE r.employee_hash=NEW.employee_hash AND r.cancelled_at IS NULL AND s.state IN ('published','paused'))>=CAST((SELECT value FROM settings WHERE key='max_sessions') AS INTEGER) THEN RAISE(ABORT,'PERSON_LIMIT') END;
END;
CREATE TRIGGER IF NOT EXISTS registration_count_insert AFTER INSERT ON registrations WHEN NEW.cancelled_at IS NULL BEGIN UPDATE sessions SET booked_count=booked_count+1 WHERE id=NEW.session_id; END;
CREATE TRIGGER IF NOT EXISTS registration_count_cancel AFTER UPDATE OF cancelled_at ON registrations WHEN OLD.cancelled_at IS NULL AND NEW.cancelled_at IS NOT NULL BEGIN UPDATE sessions SET booked_count=booked_count-1 WHERE id=NEW.session_id; END;
CREATE TRIGGER IF NOT EXISTS registration_no_reactivate_v2 BEFORE UPDATE OF cancelled_at ON registrations WHEN OLD.cancelled_at IS NOT NULL AND NEW.cancelled_at IS NULL BEGIN SELECT RAISE(ABORT,'REACTIVATION_NOT_ALLOWED'); END;
CREATE TRIGGER IF NOT EXISTS registration_no_move_v2 BEFORE UPDATE OF session_id ON registrations WHEN NEW.session_id!=OLD.session_id BEGIN SELECT RAISE(ABORT,'MOVE_NOT_ALLOWED'); END;
CREATE TRIGGER IF NOT EXISTS registration_edit_limit_v2 BEFORE UPDATE OF employee_hash ON registrations WHEN NEW.cancelled_at IS NULL AND NEW.employee_hash!=OLD.employee_hash BEGIN
 SELECT CASE WHEN CAST((SELECT value FROM settings WHERE key='max_sessions') AS INTEGER)>0 AND (SELECT COUNT(*) FROM registrations r JOIN sessions s ON s.id=r.session_id WHERE r.id!=NEW.id AND r.employee_hash=NEW.employee_hash AND r.cancelled_at IS NULL AND s.state IN ('published','paused'))>=CAST((SELECT value FROM settings WHERE key='max_sessions') AS INTEGER) THEN RAISE(ABORT,'PERSON_LIMIT') END;
END;
