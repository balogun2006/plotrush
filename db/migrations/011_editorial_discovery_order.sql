CREATE TABLE IF NOT EXISTS app_private.case_discovery_order (
 case_key text PRIMARY KEY, case_uuid uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
 first_published_at timestamptz, featured_rank integer CHECK(featured_rank BETWEEN 1 AND 100),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0)
);
-- Do not invent a publication date for public draft fixtures. For existing
-- releases, use the earliest surviving publication evidence, not import time.
INSERT INTO app_private.case_discovery_order(case_key,first_published_at)
 SELECT v.case_key, least(min(r.published_at),min(a.created_at))
 FROM app_private.case_versions v
 LEFT JOIN app_private.case_releases r ON r.case_key=v.case_key
 LEFT JOIN app_private.editorial_drafts d ON d.case_key=v.case_key
 LEFT JOIN app_private.audit_events a ON a.entity_id=d.id::text AND a.action='editorial.publish'
 GROUP BY v.case_key ON CONFLICT(case_key) DO NOTHING;
CREATE OR REPLACE FUNCTION app_private.register_discovery_case() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO app_private.case_discovery_order(case_key) VALUES(NEW.case_key) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS register_discovery_case ON app_private.case_versions;
CREATE TRIGGER register_discovery_case AFTER INSERT ON app_private.case_versions
 FOR EACH ROW EXECUTE FUNCTION app_private.register_discovery_case();
CREATE OR REPLACE FUNCTION app_private.record_first_publication() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO app_private.case_discovery_order(case_key,first_published_at) VALUES(NEW.case_key,NEW.published_at)
 ON CONFLICT(case_key) DO UPDATE SET first_published_at=coalesce(app_private.case_discovery_order.first_published_at,excluded.first_published_at);
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS record_first_publication ON app_private.case_releases;
CREATE TRIGGER record_first_publication AFTER INSERT OR UPDATE ON app_private.case_releases
 FOR EACH ROW EXECUTE FUNCTION app_private.record_first_publication();
CREATE OR REPLACE FUNCTION app_private.keep_discovery_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.case_key IS DISTINCT FROM OLD.case_key OR NEW.case_uuid IS DISTINCT FROM OLD.case_uuid OR
 (OLD.first_published_at IS NOT NULL AND NEW.first_published_at IS DISTINCT FROM OLD.first_published_at) THEN
 RAISE EXCEPTION 'Discovery identity and first publication are immutable'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS keep_discovery_identity ON app_private.case_discovery_order;
CREATE TRIGGER keep_discovery_identity BEFORE UPDATE ON app_private.case_discovery_order
 FOR EACH ROW EXECUTE FUNCTION app_private.keep_discovery_identity();
ALTER TABLE app_private.case_discovery_order ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.case_discovery_order FROM PUBLIC;
