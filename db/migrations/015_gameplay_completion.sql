ALTER TABLE app_private.attempts ADD COLUMN IF NOT EXISTS expires_at timestamptz;
UPDATE app_private.attempts SET expires_at=started_at+interval '7 days' WHERE expires_at IS NULL;
ALTER TABLE app_private.attempts ALTER COLUMN expires_at SET DEFAULT now()+interval '7 days';
ALTER TABLE app_private.attempts ALTER COLUMN expires_at SET NOT NULL;
ALTER TABLE app_private.attempts ADD COLUMN IF NOT EXISTS notes_version integer NOT NULL DEFAULT 0;
ALTER TABLE app_private.attempts ADD COLUMN IF NOT EXISTS termination_reason text CHECK(termination_reason IN ('expired','abandoned','account_merge'));
UPDATE app_private.attempts SET termination_reason='account_merge' WHERE state='abandoned' AND termination_reason IS NULL;
CREATE INDEX IF NOT EXISTS active_attempt_expiry ON app_private.attempts(principal_id,expires_at) WHERE state='investigating';
CREATE TABLE IF NOT EXISTS app_private.command_receipts (
 actor_id uuid NOT NULL REFERENCES app_private.principals(id),route text NOT NULL,key uuid NOT NULL,
 request_hash text NOT NULL,response_ref jsonb NOT NULL,expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours',
 PRIMARY KEY(actor_id,route,key)
);
CREATE TABLE IF NOT EXISTS app_private.room_notes (
 room_id uuid NOT NULL REFERENCES app_private.rooms(id),principal_id uuid NOT NULL REFERENCES app_private.principals(id),
 notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),version integer NOT NULL DEFAULT 0,
 updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(room_id,principal_id)
);
CREATE TABLE IF NOT EXISTS app_private.room_note_archives (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),room_id uuid NOT NULL REFERENCES app_private.rooms(id),
 principal_id uuid NOT NULL REFERENCES app_private.principals(id),notes text NOT NULL CHECK(length(notes)<=2000),
 archived_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_private.room_events (
 room_id uuid NOT NULL REFERENCES app_private.rooms(id),revision integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(room_id,revision)
);
CREATE TABLE IF NOT EXISTS app_private.attempt_events (
 attempt_id uuid NOT NULL REFERENCES app_private.attempts(id) ON DELETE CASCADE,revision integer NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(attempt_id,revision)
);
CREATE TABLE IF NOT EXISTS app_private.room_recoveries (
 source_room_id uuid PRIMARY KEY REFERENCES app_private.rooms(id),target_room_id uuid NOT NULL UNIQUE REFERENCES app_private.rooms(id),
 owner_id uuid NOT NULL REFERENCES app_private.principals(id),invite_code text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE OR REPLACE FUNCTION app_private.record_room_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO app_private.room_events(room_id,revision) VALUES(NEW.id,NEW.state_version) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION app_private.record_attempt_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO app_private.attempt_events(attempt_id,revision) VALUES(NEW.id,NEW.state_version) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS room_event ON app_private.rooms;
CREATE TRIGGER room_event AFTER INSERT OR UPDATE OF state_version ON app_private.rooms FOR EACH ROW EXECUTE FUNCTION app_private.record_room_event();
DROP TRIGGER IF EXISTS attempt_event ON app_private.attempts;
CREATE TRIGGER attempt_event AFTER INSERT OR UPDATE OF state_version ON app_private.attempts FOR EACH ROW EXECUTE FUNCTION app_private.record_attempt_event();
INSERT INTO app_private.room_events(room_id,revision) SELECT id,state_version FROM app_private.rooms ON CONFLICT DO NOTHING;
INSERT INTO app_private.attempt_events(attempt_id,revision) SELECT id,state_version FROM app_private.attempts ON CONFLICT DO NOTHING;
DO $$ DECLARE tab text; BEGIN
 FOREACH tab IN ARRAY ARRAY['command_receipts','room_notes','room_note_archives','room_events','attempt_events','room_recoveries'] LOOP
  EXECUTE format('ALTER TABLE app_private.%I ENABLE ROW LEVEL SECURITY',tab);
  EXECUTE format('REVOKE ALL ON app_private.%I FROM PUBLIC',tab);
 END LOOP;
END $$;
