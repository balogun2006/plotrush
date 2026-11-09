ALTER TABLE app_private.principals ADD COLUMN IF NOT EXISTS merged_into uuid REFERENCES app_private.principals(id);
CREATE TABLE IF NOT EXISTS app_private.accounts (
 principal_id uuid PRIMARY KEY REFERENCES app_private.principals(id),
 email text NOT NULL UNIQUE CHECK(length(email)<=254),
 verified_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_private.auth_challenges (
 id uuid PRIMARY KEY, principal_id uuid NOT NULL REFERENCES app_private.principals(id),
 email text NOT NULL, code_hash text NOT NULL, attempts integer NOT NULL DEFAULT 0,
 expires_at timestamptz NOT NULL DEFAULT now()+interval '10 minutes',
 used_at timestamptz, delivered boolean NOT NULL DEFAULT false, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_challenge_expiry ON app_private.auth_challenges(expires_at);
CREATE TABLE IF NOT EXISTS app_private.audit_events (
 id uuid PRIMARY KEY, actor_id uuid NOT NULL REFERENCES app_private.principals(id),
 action text NOT NULL, entity_id text NOT NULL, details jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS app_private.products (
 id text PRIMARY KEY, case_key text NOT NULL, mode text NOT NULL CHECK(mode IN ('solo','group')),
 active boolean NOT NULL DEFAULT false, UNIQUE(case_key,mode)
);
CREATE TABLE IF NOT EXISTS app_private.price_versions (
 id text PRIMARY KEY, product_id text NOT NULL REFERENCES app_private.products(id),
 amount_minor bigint NOT NULL CHECK(amount_minor>0 AND amount_minor<=100000000),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'), active boolean NOT NULL DEFAULT false,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS one_active_price ON app_private.price_versions(product_id,currency) WHERE active;
CREATE TABLE IF NOT EXISTS app_private.orders (
 id uuid PRIMARY KEY, buyer_id uuid NOT NULL REFERENCES app_private.principals(id),
 product_id text NOT NULL REFERENCES app_private.products(id), price_version_id text NOT NULL REFERENCES app_private.price_versions(id),
 amount_minor bigint NOT NULL CHECK(amount_minor>0), currency text NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','expired')),
 environment text NOT NULL CHECK(environment IN ('development','test','live')),
 idempotency_key uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 minutes',
 paid_at timestamptz, UNIQUE(buyer_id,idempotency_key)
);
CREATE TABLE IF NOT EXISTS app_private.payment_attempts (
 id uuid PRIMARY KEY, order_id uuid NOT NULL REFERENCES app_private.orders(id),
 provider text NOT NULL, reference text NOT NULL UNIQUE, transaction_id text UNIQUE,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','succeeded')),
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(order_id,provider)
);
CREATE TABLE IF NOT EXISTS app_private.entitlements (
 id uuid PRIMARY KEY, owner_id uuid NOT NULL REFERENCES app_private.principals(id),
 product_id text NOT NULL REFERENCES app_private.products(id), origin_order_id uuid NOT NULL REFERENCES app_private.orders(id),
 state text NOT NULL DEFAULT 'active' CHECK(state IN ('active','suspended','revoked')),
 granted_at timestamptz NOT NULL DEFAULT now(), UNIQUE(owner_id,product_id)
);
ALTER TABLE app_private.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.auth_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.price_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.payment_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_private.entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON ALL TABLES IN SCHEMA app_private FROM PUBLIC;
ALTER TABLE app_private.attempts DROP CONSTRAINT IF EXISTS attempts_state_check;
ALTER TABLE app_private.attempts ADD CONSTRAINT attempts_state_check CHECK(state IN ('investigating','revealed','abandoned'));
INSERT INTO app_private.products(id,case_key,mode) VALUES('wedding-gift-solo','wedding-gift','solo'),('wedding-gift-group','wedding-gift','group') ON CONFLICT DO NOTHING;
INSERT INTO app_private.price_versions(id,product_id,amount_minor,currency) VALUES('demo-wedding-solo-ngn-v1','wedding-gift-solo',200000,'NGN'),('demo-wedding-group-ngn-v1','wedding-gift-group',400000,'NGN') ON CONFLICT DO NOTHING;
