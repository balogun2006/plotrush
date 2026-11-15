ALTER TABLE app_private.principals ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE TABLE IF NOT EXISTS app_private.privacy_requests (
 id uuid PRIMARY KEY, principal_id uuid NOT NULL REFERENCES app_private.principals(id),
 kind text NOT NULL CHECK(kind IN ('export','deletion')),
 state text NOT NULL CHECK(state IN ('ready','pending','deferred','cancelled','completed')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 requested_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES app_private.accounts(principal_id), review_reason text,
 retention_reference text, backup_reference text
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_privacy_request ON app_private.privacy_requests(principal_id,kind)
 WHERE state IN ('ready','pending','deferred');
CREATE TABLE IF NOT EXISTS app_private.deletion_ledger (
 principal_id uuid PRIMARY KEY, request_id uuid, deleted_at timestamptz NOT NULL DEFAULT now(),
 retention_reference text NOT NULL, backup_reference text NOT NULL
);
ALTER TABLE app_private.privacy_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.deletion_ledger ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.privacy_requests,app_private.deletion_ledger FROM PUBLIC;
