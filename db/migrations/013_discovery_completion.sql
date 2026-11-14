-- Additive safe metadata projection. Original immutable case JSON is retained.
CREATE TABLE IF NOT EXISTS app_private.moods (
 id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE, slug text PRIMARY KEY,
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 60),
 status text NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','retired')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0)
);
INSERT INTO app_private.moods(slug,label) VALUES
 ('lighthearted','Lighthearted'),('suspenseful','Suspenseful'),('dark','Dark') ON CONFLICT DO NOTHING;
ALTER TABLE app_private.interests DROP CONSTRAINT IF EXISTS interests_moods_check;
ALTER TABLE app_private.interests DROP CONSTRAINT IF EXISTS interests_themes_check;
CREATE TABLE IF NOT EXISTS app_private.theme_aliases (
 slug text PRIMARY KEY CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 theme_id uuid NOT NULL REFERENCES app_private.themes(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_private.interest_themes (
 principal_id uuid NOT NULL REFERENCES app_private.interests(principal_id) ON DELETE CASCADE,
 theme_id uuid NOT NULL REFERENCES app_private.themes(id), PRIMARY KEY(principal_id,theme_id)
);
CREATE TABLE IF NOT EXISTS app_private.interest_moods (
 principal_id uuid NOT NULL REFERENCES app_private.interests(principal_id) ON DELETE CASCADE,
 mood_id uuid NOT NULL REFERENCES app_private.moods(id), PRIMARY KEY(principal_id,mood_id)
);
CREATE OR REPLACE FUNCTION app_private.project_interest_taxonomy() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item text; tag_id uuid;
BEGIN
 IF jsonb_typeof(NEW.themes)<>'array' OR jsonb_typeof(NEW.moods)<>'array' THEN RAISE EXCEPTION 'Interests must be arrays'; END IF;
 DELETE FROM app_private.interest_themes WHERE principal_id=NEW.principal_id;
 DELETE FROM app_private.interest_moods WHERE principal_id=NEW.principal_id;
 FOR item IN SELECT jsonb_array_elements_text(NEW.themes) LOOP
  SELECT id INTO tag_id FROM app_private.themes WHERE slug=item;
  IF tag_id IS NULL THEN SELECT theme_id INTO tag_id FROM app_private.theme_aliases WHERE slug=item; END IF;
  IF tag_id IS NULL THEN RAISE EXCEPTION 'Unknown interest theme'; END IF;
  INSERT INTO app_private.interest_themes VALUES(NEW.principal_id,tag_id) ON CONFLICT DO NOTHING;
 END LOOP;
 FOR item IN SELECT jsonb_array_elements_text(NEW.moods) LOOP
  SELECT id INTO tag_id FROM app_private.moods WHERE slug=item;
  IF tag_id IS NULL THEN RAISE EXCEPTION 'Unknown interest mood'; END IF;
  INSERT INTO app_private.interest_moods VALUES(NEW.principal_id,tag_id) ON CONFLICT DO NOTHING;
 END LOOP;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS project_interest_taxonomy ON app_private.interests;
CREATE TRIGGER project_interest_taxonomy AFTER INSERT OR UPDATE ON app_private.interests FOR EACH ROW EXECUTE FUNCTION app_private.project_interest_taxonomy();
INSERT INTO app_private.interest_themes
 SELECT i.principal_id,t.id FROM app_private.interests i CROSS JOIN LATERAL jsonb_array_elements_text(i.themes) tag(slug)
 JOIN app_private.themes t ON t.slug=tag.slug ON CONFLICT DO NOTHING;
INSERT INTO app_private.interest_themes
 SELECT i.principal_id,a.theme_id FROM app_private.interests i CROSS JOIN LATERAL jsonb_array_elements_text(i.themes) tag(slug)
 JOIN app_private.theme_aliases a ON a.slug=tag.slug ON CONFLICT DO NOTHING;
INSERT INTO app_private.interest_moods
 SELECT i.principal_id,m.id FROM app_private.interests i CROSS JOIN LATERAL jsonb_array_elements_text(i.moods) tag(slug)
 JOIN app_private.moods m ON m.slug=tag.slug ON CONFLICT DO NOTHING;
CREATE TABLE IF NOT EXISTS app_private.case_version_themes (
 case_version_id text NOT NULL REFERENCES app_private.case_versions(id),
 theme_id uuid NOT NULL REFERENCES app_private.themes(id), is_primary boolean NOT NULL,
 PRIMARY KEY(case_version_id,theme_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS one_primary_theme ON app_private.case_version_themes(case_version_id) WHERE is_primary;
CREATE INDEX IF NOT EXISTS theme_versions ON app_private.case_version_themes(theme_id,case_version_id);
CREATE TABLE IF NOT EXISTS app_private.case_version_moods (
 case_version_id text NOT NULL REFERENCES app_private.case_versions(id),
 mood_id uuid NOT NULL REFERENCES app_private.moods(id), PRIMARY KEY(case_version_id,mood_id)
);
CREATE INDEX IF NOT EXISTS mood_versions ON app_private.case_version_moods(mood_id,case_version_id);
CREATE TABLE IF NOT EXISTS app_private.case_discovery_metadata (
 case_version_id text PRIMARY KEY REFERENCES app_private.case_versions(id),
 difficulty text NOT NULL CHECK(difficulty IN ('beginner','intermediate','expert')),
 duration_solo integer CHECK(duration_solo>0), duration_group integer CHECK(duration_group>0),
 warnings_json jsonb NOT NULL, warnings_reviewed_at timestamptz,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0)
);
CREATE TABLE IF NOT EXISTS app_private.catalogue_revisions (
 id integer PRIMARY KEY CHECK(id=1), revision bigint NOT NULL DEFAULT 1, changed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO app_private.catalogue_revisions(id) VALUES(1) ON CONFLICT DO NOTHING;
CREATE OR REPLACE FUNCTION app_private.bump_catalogue_revision() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 UPDATE app_private.catalogue_revisions SET revision=revision+1,changed_at=now() WHERE id=1;
 RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION app_private.project_case_discovery() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE item text; theme_key uuid; mood_key uuid;
BEGIN
 FOR item IN SELECT jsonb_array_elements_text(NEW.content->'discovery'->'themes') LOOP
  SELECT id INTO theme_key FROM app_private.themes WHERE slug=item;
  IF theme_key IS NULL THEN RAISE EXCEPTION 'Unknown case theme'; END IF;
  INSERT INTO app_private.case_version_themes VALUES(NEW.id,theme_key,item=NEW.content->'discovery'->>'primaryTheme') ON CONFLICT DO NOTHING;
 END LOOP;
 FOR item IN SELECT jsonb_array_elements_text(NEW.content->'discovery'->'moods') LOOP
  SELECT id INTO mood_key FROM app_private.moods WHERE slug=item;
  IF mood_key IS NULL THEN RAISE EXCEPTION 'Unknown case mood'; END IF;
  INSERT INTO app_private.case_version_moods VALUES(NEW.id,mood_key) ON CONFLICT DO NOTHING;
 END LOOP;
 INSERT INTO app_private.case_discovery_metadata(case_version_id,difficulty,duration_solo,duration_group,warnings_json)
 VALUES(NEW.id,NEW.content->'discovery'->>'difficulty',
 (NEW.content->'discovery'->'estimatedDurationMinutes'->>'solo')::integer,
 (NEW.content->'discovery'->'estimatedDurationMinutes'->>'group')::integer,
 NEW.content->'discovery'->'contentWarnings') ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS project_case_discovery ON app_private.case_versions;
CREATE TRIGGER project_case_discovery AFTER INSERT ON app_private.case_versions FOR EACH ROW EXECUTE FUNCTION app_private.project_case_discovery();
-- Explicit supplied metadata mapping, no inferred tags or invented review dates.
INSERT INTO app_private.case_version_themes
 SELECT v.id,t.id,t.slug=v.content->'discovery'->>'primaryTheme' FROM app_private.case_versions v
 CROSS JOIN LATERAL jsonb_array_elements_text(v.content->'discovery'->'themes') tag(slug)
 JOIN app_private.themes t ON t.slug=tag.slug ON CONFLICT DO NOTHING;
INSERT INTO app_private.case_version_moods
 SELECT v.id,m.id FROM app_private.case_versions v
 CROSS JOIN LATERAL jsonb_array_elements_text(v.content->'discovery'->'moods') tag(slug)
 JOIN app_private.moods m ON m.slug=tag.slug ON CONFLICT DO NOTHING;
INSERT INTO app_private.case_discovery_metadata(case_version_id,difficulty,duration_solo,duration_group,warnings_json,warnings_reviewed_at)
 SELECT v.id,v.content->'discovery'->>'difficulty',
 (v.content->'discovery'->'estimatedDurationMinutes'->>'solo')::integer,
 (v.content->'discovery'->'estimatedDurationMinutes'->>'group')::integer,v.content->'discovery'->'contentWarnings',
 (SELECT min(r.published_at) FROM app_private.case_releases r WHERE r.version_id=v.id)
 FROM app_private.case_versions v ON CONFLICT DO NOTHING;
-- A managed rename retains IDs and historical canon; old slugs become aliases.
CREATE OR REPLACE FUNCTION app_private.keep_theme_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retire themes instead of deleting them'; END IF;
 IF NEW.id IS DISTINCT FROM OLD.id THEN RAISE EXCEPTION 'Theme IDs are permanent'; END IF;
 IF NEW.slug IS DISTINCT FROM OLD.slug THEN
  IF current_setting('plotrush.theme_rename',true) IS DISTINCT FROM OLD.id::text THEN RAISE EXCEPTION 'Use managed theme rename'; END IF;
  IF EXISTS(SELECT 1 FROM app_private.theme_aliases WHERE slug=NEW.slug) THEN RAISE EXCEPTION 'Reserved theme alias'; END IF;
  INSERT INTO app_private.theme_aliases(slug,theme_id) VALUES(OLD.slug,OLD.id);
 END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION app_private.keep_mood_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR NEW.id IS DISTINCT FROM OLD.id OR NEW.slug IS DISTINCT FROM OLD.slug THEN RAISE EXCEPTION 'Mood identity is permanent; retire instead'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS keep_mood_identity ON app_private.moods;
CREATE TRIGGER keep_mood_identity BEFORE UPDATE OR DELETE ON app_private.moods FOR EACH ROW EXECUTE FUNCTION app_private.keep_mood_identity();
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['themes','moods','theme_aliases','case_releases','preview_fixtures','case_discovery_order','case_version_themes','case_version_moods','case_discovery_metadata'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS discovery_revision ON app_private.%I',tab);
  EXECUTE format('CREATE TRIGGER discovery_revision AFTER INSERT OR UPDATE OR DELETE ON app_private.%I FOR EACH ROW EXECUTE FUNCTION app_private.bump_catalogue_revision()',tab);
 END LOOP;
 FOREACH tab IN ARRAY ARRAY['moods','theme_aliases','case_version_themes','case_version_moods','case_discovery_metadata','catalogue_revisions','interest_themes','interest_moods'] LOOP
  EXECUTE format('ALTER TABLE app_private.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON app_private.%I FROM PUBLIC',tab);
 END LOOP;
END $$;
