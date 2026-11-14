CREATE TABLE IF NOT EXISTS app_private.themes (
 id uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE, slug text PRIMARY KEY,
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 60),
 description text NOT NULL CHECK(length(description) BETWEEN 1 AND 400),
 status text NOT NULL DEFAULT 'enabled' CHECK(status IN ('enabled','retired')),
 display_order integer NOT NULL CHECK(display_order BETWEEN 0 AND 100),
 promote_on_home boolean NOT NULL DEFAULT false,
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0)
);
INSERT INTO app_private.themes(slug,label,description,display_order) VALUES
 ('thriller','Thriller','Suspense-led investigations with meaningful stakes.',1),
 ('cold-case','Cold Case','Older unresolved cases reopened through records and new evidence.',2),
 ('wedding-family','Wedding & Family','Mysteries around celebrations, relationships and family gatherings.',3),
 ('heist','Heist','Investigations of planned thefts and their execution.',4),
 ('supernatural','Supernatural','Cases involving apparent paranormal events; resolution scope is disclosed.',5),
 ('everyday-mystery','Everyday Mystery','Smaller contemporary puzzles from ordinary settings.',6)
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
