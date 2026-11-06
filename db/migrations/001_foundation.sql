CREATE SCHEMA IF NOT EXISTS app_private;
REVOKE ALL ON SCHEMA app_private FROM PUBLIC;
CREATE TABLE IF NOT EXISTS app_private.principals (
 id uuid PRIMARY KEY, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_private.sessions (
 token_hash text PRIMARY KEY, principal_id uuid NOT NULL REFERENCES app_private.principals(id), expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_expiry ON app_private.sessions(expires_at);
CREATE TABLE IF NOT EXISTS app_private.case_versions (
 id text PRIMARY KEY, case_key text NOT NULL, checksum text NOT NULL, content jsonb NOT NULL,
 status text NOT NULL CHECK(status='draft'), created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(case_key,checksum)
);
CREATE TABLE IF NOT EXISTS app_private.attempts (
 id uuid PRIMARY KEY, principal_id uuid NOT NULL REFERENCES app_private.principals(id),
 case_version_id text NOT NULL REFERENCES app_private.case_versions(id),
 state text NOT NULL DEFAULT 'investigating' CHECK(state IN ('investigating','revealed')),
 round integer NOT NULL DEFAULT 1 CHECK(round>0), state_version integer NOT NULL DEFAULT 1,
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000), hints jsonb NOT NULL DEFAULT '[]', result jsonb,
 started_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz,
 CHECK ((state='revealed')=(result IS NOT NULL)), CHECK ((state='revealed')=(completed_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_attempt ON app_private.attempts(principal_id,case_version_id) WHERE state='investigating';
CREATE INDEX IF NOT EXISTS attempts_owner ON app_private.attempts(principal_id,started_at);
CREATE TABLE IF NOT EXISTS app_private.interests (
 principal_id uuid PRIMARY KEY REFERENCES app_private.principals(id), themes jsonb NOT NULL DEFAULT '[]', version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_private.rate_limits (
 key text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL
);
ALTER TABLE app_private.principals ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.case_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.interests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA app_private FROM PUBLIC;
