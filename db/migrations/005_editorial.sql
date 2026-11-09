ALTER TABLE app_private.sessions ADD COLUMN IF NOT EXISTS issued_at timestamptz NOT NULL DEFAULT '1970-01-01';
ALTER TABLE app_private.sessions ALTER COLUMN issued_at SET DEFAULT now();
ALTER TABLE app_private.case_versions DROP CONSTRAINT IF EXISTS case_versions_status_check;
ALTER TABLE app_private.case_versions ADD CONSTRAINT case_versions_status_check CHECK(status IN ('draft','published'));
CREATE TABLE IF NOT EXISTS app_private.staff_members (
 principal_id uuid PRIMARY KEY REFERENCES app_private.accounts(principal_id),
 roles text[] NOT NULL CHECK(roles <@ ARRAY['content_editor','content_publisher','admin']::text[] AND cardinality(roles)>0),
 active boolean NOT NULL DEFAULT true, secret_cipher text, pending_cipher text, pending_until timestamptz,
 last_counter bigint NOT NULL DEFAULT -1, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_private.staff_sessions (
 token_hash text PRIMARY KEY, principal_id uuid NOT NULL REFERENCES app_private.staff_members(principal_id),
 player_session_hash text NOT NULL REFERENCES app_private.sessions(token_hash) ON DELETE CASCADE,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes'
);
CREATE TABLE IF NOT EXISTS app_private.editorial_drafts (
 id uuid PRIMARY KEY, case_key text NOT NULL, content jsonb NOT NULL,
 revision integer NOT NULL DEFAULT 1, state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','review','approved','published')),
 author_id uuid NOT NULL REFERENCES app_private.accounts(principal_id),
 editor_id uuid NOT NULL REFERENCES app_private.accounts(principal_id),
 approved_by uuid REFERENCES app_private.accounts(principal_id), review jsonb,
 version_id text REFERENCES app_private.case_versions(id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_private.case_releases (
 case_key text PRIMARY KEY, version_id text NOT NULL REFERENCES app_private.case_versions(id),
 enabled boolean NOT NULL DEFAULT true, published_by uuid NOT NULL REFERENCES app_private.accounts(principal_id),
 published_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_private.preview_fixtures (
 version_id text PRIMARY KEY REFERENCES app_private.case_versions(id)
);
CREATE TABLE IF NOT EXISTS app_private.daily_calendar (
 day date PRIMARY KEY, version_id text NOT NULL REFERENCES app_private.case_versions(id),
 scheduled_by uuid NOT NULL REFERENCES app_private.accounts(principal_id), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE VIEW app_private.playable_versions AS
 SELECT v.* FROM app_private.case_releases r JOIN app_private.case_versions v ON v.id=r.version_id WHERE r.enabled AND v.status='published'
 UNION ALL
 SELECT v.* FROM app_private.preview_fixtures f JOIN app_private.case_versions v ON v.id=f.version_id WHERE NOT EXISTS(SELECT 1 FROM app_private.case_releases r WHERE r.case_key=v.case_key);
CREATE OR REPLACE FUNCTION app_private.keep_case_canon() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Case versions are immutable'; END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.case_key IS DISTINCT FROM OLD.case_key OR NEW.checksum IS DISTINCT FROM OLD.checksum OR NEW.content IS DISTINCT FROM OLD.content OR NEW.created_at IS DISTINCT FROM OLD.created_at OR (OLD.status='published' AND NEW.status<>'published') THEN
 RAISE EXCEPTION 'Case versions are immutable'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS immutable_case_canon ON app_private.case_versions;
CREATE TRIGGER immutable_case_canon BEFORE UPDATE OR DELETE ON app_private.case_versions FOR EACH ROW EXECUTE FUNCTION app_private.keep_case_canon();
ALTER TABLE app_private.staff_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.staff_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.editorial_drafts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.case_releases ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.preview_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.daily_calendar ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA app_private FROM PUBLIC;
