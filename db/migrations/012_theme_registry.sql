CREATE TABLE IF NOT EXISTS app_private.themes (
 id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE, slug text PRIMARY KEY,
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 60),
 description text NOT NULL CHECK(length(description) BETWEEN 1 AND 400),
 status text NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','retired')),
 display_order integer NOT NULL CHECK(display_order BETWEEN 0 AND 100),
 promote_on_home boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0)
);
CREATE TABLE IF NOT EXISTS app_private.theme_aliases (
 slug text PRIMARY KEY CHECK(slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
 theme_id uuid NOT NULL REFERENCES app_private.themes(id),created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE app_private.theme_aliases ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.theme_aliases FROM PUBLIC;
INSERT INTO app_private.themes(slug,label,description,display_order)
 SELECT seed.* FROM (VALUES
 ('thriller','Thriller','Suspense-led investigations with meaningful stakes.',1),
 ('cold-case','Cold Case','Older unresolved cases reopened through records and new evidence.',2),
 ('wedding-family','Wedding & Family','Mysteries around celebrations, relationships and family gatherings.',3),
 ('heist','Heist','Investigations of planned thefts and their execution.',4),
 ('supernatural','Supernatural','Cases involving apparent paranormal events; resolution scope is disclosed.',5),
 ('everyday-mystery','Everyday Mystery','Smaller contemporary puzzles from ordinary settings.',6)) seed(slug,label,description,display_order)
 WHERE NOT EXISTS(SELECT 1 FROM app_private.theme_aliases a WHERE a.slug=seed.slug)
 ON CONFLICT(slug) DO NOTHING;
CREATE OR REPLACE FUNCTION app_private.keep_theme_identity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Retire themes instead of deleting them'; END IF;
 IF NEW.id IS DISTINCT FROM OLD.id OR NEW.slug IS DISTINCT FROM OLD.slug THEN
 RAISE EXCEPTION 'Theme identities and slugs are permanent'; END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS keep_theme_identity ON app_private.themes;
CREATE TRIGGER keep_theme_identity BEFORE UPDATE OR DELETE ON app_private.themes
 FOR EACH ROW EXECUTE FUNCTION app_private.keep_theme_identity();
ALTER TABLE app_private.themes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.themes FROM PUBLIC;
