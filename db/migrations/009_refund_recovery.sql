ALTER TABLE app_private.refund_requests ADD COLUMN IF NOT EXISTS next_reconcile_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS refund_requests_reconcile_due ON app_private.refund_requests(next_reconcile_at,id) WHERE closed_at IS NULL;
