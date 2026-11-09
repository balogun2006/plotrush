ALTER TABLE app_private.entitlements ADD COLUMN IF NOT EXISTS dispute_hold boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS app_private.payment_disputes (
 provider_id text PRIMARY KEY, order_id uuid NOT NULL REFERENCES app_private.orders(id),
 provider_status text NOT NULL, resolution text,
 refund_minor integer CHECK(refund_minor>=0),
 provider_updated_at timestamptz NOT NULL, holds_access boolean NOT NULL
);
CREATE INDEX IF NOT EXISTS payment_disputes_order ON app_private.payment_disputes(order_id);
ALTER TABLE app_private.payment_disputes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.payment_disputes FROM PUBLIC;
