-- Additive: old theme-only writers retain the new fields through the domain API.
ALTER TABLE app_private.interests ADD COLUMN IF NOT EXISTS moods jsonb NOT NULL DEFAULT '[]'
 CHECK (jsonb_typeof(moods)='array' AND moods <@ '["lighthearted","suspenseful","dark"]'::jsonb);
ALTER TABLE app_private.interests ADD COLUMN IF NOT EXISTS preferred_difficulty text
 CHECK (preferred_difficulty IN ('beginner','intermediate','expert'));
ALTER TABLE app_private.interests ADD COLUMN IF NOT EXISTS personalisation_enabled boolean NOT NULL DEFAULT true;
