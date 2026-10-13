-- Improves bounded cleanup of expired technical counters; no participant changes.
CREATE INDEX IF NOT EXISTS rate_limits_expiry ON rate_limits(expires_at);
