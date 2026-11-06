CREATE TABLE IF NOT EXISTS app_private.rooms (
 id uuid PRIMARY KEY,
 host_id uuid NOT NULL REFERENCES app_private.principals(id),
 case_version_id text NOT NULL REFERENCES app_private.case_versions(id),
 invite_hash text NOT NULL UNIQUE,
 state_version integer NOT NULL DEFAULT 1,
 state jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '24 hours'
);
CREATE TABLE IF NOT EXISTS app_private.room_members (
 room_id uuid NOT NULL REFERENCES app_private.rooms(id),
 principal_id uuid NOT NULL REFERENCES app_private.principals(id),
 nickname text NOT NULL CHECK(length(nickname) BETWEEN 1 AND 24),
 seat integer NOT NULL CHECK(seat BETWEEN 0 AND 5),
 ready boolean NOT NULL DEFAULT false,
 departed boolean NOT NULL DEFAULT false,
 joined_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(room_id,principal_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS room_active_seat ON app_private.room_members(room_id,seat) WHERE NOT departed;
CREATE INDEX IF NOT EXISTS member_rooms ON app_private.room_members(principal_id);
CREATE INDEX IF NOT EXISTS rooms_expiry ON app_private.rooms(expires_at);
ALTER TABLE app_private.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.room_members ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.rooms, app_private.room_members FROM PUBLIC;
