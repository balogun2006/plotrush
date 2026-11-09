ALTER TABLE app_private.payment_attempts ADD COLUMN IF NOT EXISTS authorization_url text;
ALTER TABLE app_private.payment_attempts ADD COLUMN IF NOT EXISTS setup_state text NOT NULL DEFAULT 'new' CHECK(setup_state IN ('new','initialising','ready','uncertain','failed'));
ALTER TABLE app_private.payment_attempts ADD COLUMN IF NOT EXISTS setup_lease uuid;
ALTER TABLE app_private.payment_attempts ADD COLUMN IF NOT EXISTS setup_until timestamptz;
ALTER TABLE app_private.payment_attempts ADD COLUMN IF NOT EXISTS next_verify_at timestamptz NOT NULL DEFAULT now()+interval '1 minute';
CREATE TABLE IF NOT EXISTS app_private.webhook_inbox (
 id uuid PRIMARY KEY, environment text NOT NULL CHECK(environment IN ('test','live')), dedup_key text NOT NULL UNIQUE, event_type text NOT NULL,
 reference text, transaction_id text, state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','done','ignored','exception')),
 attempts integer NOT NULL DEFAULT 0, lease uuid, lease_until timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(), error_code text,
 created_at timestamptz NOT NULL DEFAULT now(), completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS webhook_pending ON app_private.webhook_inbox(state,next_attempt_at);
CREATE TABLE IF NOT EXISTS app_private.payment_receipts (
 id uuid PRIMARY KEY, order_id uuid NOT NULL UNIQUE REFERENCES app_private.orders(id),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','sending','sent')),
 attempts integer NOT NULL DEFAULT 0, lease uuid, lease_until timestamptz,
 next_attempt_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz
);
ALTER TABLE app_private.webhook_inbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.payment_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.webhook_inbox,app_private.payment_receipts FROM PUBLIC;
