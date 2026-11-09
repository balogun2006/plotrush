ALTER TABLE app_private.attempts ADD COLUMN IF NOT EXISTS daily_day date;
CREATE UNIQUE INDEX IF NOT EXISTS attempts_daily_owner_day
 ON app_private.attempts(principal_id,daily_day) WHERE daily_day IS NOT NULL;
