ALTER TABLE app_private.staff_members DROP CONSTRAINT IF EXISTS staff_members_roles_check;
ALTER TABLE app_private.staff_members ADD CONSTRAINT staff_members_roles_check
 CHECK(roles <@ ARRAY['content_editor','content_publisher','finance','admin']::text[] AND cardinality(roles)>0);
CREATE TABLE IF NOT EXISTS app_private.refund_requests (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES app_private.orders(id),
 reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),
 created_at timestamptz NOT NULL DEFAULT now(), closed_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS one_open_refund_request ON app_private.refund_requests(order_id) WHERE closed_at IS NULL;
CREATE TABLE IF NOT EXISTS app_private.refunds (
 provider_id text PRIMARY KEY, order_id uuid NOT NULL REFERENCES app_private.orders(id),
 amount_minor integer NOT NULL CHECK(amount_minor>0),
 recorded_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refunds_order ON app_private.refunds(order_id);
ALTER TABLE app_private.refund_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON app_private.refund_requests, app_private.refunds FROM PUBLIC;
