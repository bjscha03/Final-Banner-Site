-- Additive only. Program remains OFF until BOF_REFERRAL_ENABLED=true.
-- Do not enable until payment/refund checks in docs/referrals/launch.md pass.
CREATE TABLE IF NOT EXISTS bof_members (
  user_id uuid PRIMARY KEY REFERENCES profiles(id),
  code text NOT NULL UNIQUE CHECK (code ~ '^[A-F0-9]{12}$'),
  enabled boolean NOT NULL DEFAULT true,
  joined_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bof_invitations (
  id uuid PRIMARY KEY,
  email text NOT NULL,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  claimed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bof_invitation_email_idx ON bof_invitations(email, created_at DESC);
CREATE TABLE IF NOT EXISTS bof_rate_limits (
  bucket text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE TABLE IF NOT EXISTS bof_quotes (
  code text PRIMARY KEY,
  member_id uuid NOT NULL REFERENCES bof_members(user_id),
  cart_hash text NOT NULL,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  expires_at timestamptz NOT NULL,
  order_id uuid UNIQUE REFERENCES orders(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS bof_order_benefits (
  order_id uuid PRIMARY KEY REFERENCES orders(id),
  buyer_email text NOT NULL,
  referrer_id uuid REFERENCES bof_members(user_id),
  reward_cents integer NOT NULL DEFAULT 0 CHECK (reward_cents IN (0,500,1000)),
  reward_eligible boolean NOT NULL DEFAULT true,
  wallet_member_id uuid REFERENCES bof_members(user_id),
  wallet_cents integer NOT NULL DEFAULT 0 CHECK (wallet_cents >= 0),
  friend_discount_cents integer NOT NULL DEFAULT 0 CHECK (friend_discount_cents >= 0),
  contribution_cents integer NOT NULL,
  net_merchandise_cents integer NOT NULL,
  cost_snapshot jsonb NOT NULL,
  state text NOT NULL DEFAULT 'held' CHECK (state IN ('held','paid','released','reversed')),
  shipped_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((wallet_member_id IS NULL) = (wallet_cents = 0)),
  CHECK ((referrer_id IS NULL) = (reward_cents = 0))
);
-- A first-order benefit cannot be won by two simultaneous checkouts.
CREATE UNIQUE INDEX IF NOT EXISTS bof_first_customer_idx ON bof_order_benefits(buyer_email)
  WHERE referrer_id IS NOT NULL AND state IN ('held','paid','reversed');
CREATE TABLE IF NOT EXISTS bof_cash_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid NOT NULL REFERENCES bof_members(user_id),
  order_id uuid NOT NULL REFERENCES orders(id),
  event_key text NOT NULL UNIQUE,
  kind text NOT NULL CHECK (kind IN ('reward','redemption','reward_reversal','redemption_refund')),
  amount_cents integer NOT NULL CHECK (amount_cents <> 0),
  available_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bof_cash_balance_idx ON bof_cash_entries(member_id, available_at);

-- All balance changes take the same member row lock, including credit maturity.
CREATE OR REPLACE FUNCTION bof_reserve(p_order uuid, p_email text, p_referrer uuid,
  p_reward integer, p_wallet uuid, p_cash integer, p_discount integer,
  p_contribution integer, p_net integer, p_cost jsonb, p_quote text)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE existing bof_order_benefits%ROWTYPE; balance bigint; q bof_quotes%ROWTYPE;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('bof-buyer:' || p_email, 0));
  SELECT * INTO existing FROM bof_order_benefits WHERE order_id=p_order FOR UPDATE;
  IF FOUND THEN
    IF existing.buyer_email IS DISTINCT FROM p_email OR existing.wallet_cents<>p_cash
      OR existing.wallet_member_id IS DISTINCT FROM p_wallet OR existing.referrer_id IS DISTINCT FROM p_referrer
      OR existing.reward_cents<>p_reward THEN RAISE EXCEPTION 'BOF_CHECKOUT_CHANGED'; END IF;
    IF existing.state <> 'released' THEN RETURN true; END IF;
  END IF;
  -- Stable ordering avoids deadlocks on orders involving two members.
  PERFORM user_id FROM bof_members WHERE user_id IN (p_wallet,p_referrer) ORDER BY user_id FOR UPDATE;
  IF p_referrer IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM bof_members m JOIN profiles p ON p.id=m.user_id
      WHERE m.user_id=p_referrer AND m.enabled AND lower(btrim(p.email))<>p_email)
      OR EXISTS (SELECT 1 FROM orders WHERE lower(btrim(email))=p_email AND id<>p_order
        AND NOT coalesce(is_test_order,false) AND (status IN ('paid','in_production','shipped','delivered','fulfilled','refunded')
          OR nullif(to_jsonb(orders)->>'paypal_capture_id','') IS NOT NULL
          OR payment_reconciliation_status IN ('complete','completed')))
      OR EXISTS (SELECT 1 FROM bof_order_benefits WHERE buyer_email=p_email AND order_id<>p_order
        AND referrer_id IS NOT NULL AND state IN ('held','paid','reversed'))
    THEN RAISE EXCEPTION 'BOF_FIRST_ORDER_UNAVAILABLE'; END IF;
  END IF;
  IF p_wallet IS NOT NULL THEN
    SELECT * INTO q FROM bof_quotes WHERE code=p_quote FOR UPDATE;
    IF NOT FOUND OR q.member_id<>p_wallet OR q.amount_cents<>p_cash
      OR (q.order_id IS NOT NULL AND q.order_id<>p_order)
      OR (q.order_id IS NULL AND q.expires_at<=now())
      OR NOT EXISTS (SELECT 1 FROM bof_members WHERE user_id=p_wallet AND enabled)
    THEN RAISE EXCEPTION 'BOF_QUOTE_EXPIRED'; END IF;
    SELECT coalesce(sum(amount_cents),0) INTO balance FROM bof_cash_entries
      WHERE member_id=p_wallet AND available_at<=now();
    balance := balance - coalesce((SELECT sum(wallet_cents) FROM bof_order_benefits
      WHERE wallet_member_id=p_wallet AND state='held' AND order_id<>p_order),0);
    IF balance<p_cash THEN RAISE EXCEPTION 'BOF_BALANCE_CHANGED'; END IF;
    UPDATE bof_quotes SET order_id=p_order WHERE code=p_quote;
  END IF;
  INSERT INTO bof_order_benefits(order_id,buyer_email,referrer_id,reward_cents,wallet_member_id,
    wallet_cents,friend_discount_cents,contribution_cents,net_merchandise_cents,cost_snapshot)
  VALUES(p_order,p_email,p_referrer,p_reward,p_wallet,p_cash,p_discount,p_contribution,p_net,p_cost)
  ON CONFLICT(order_id) DO UPDATE SET state='held',cost_snapshot=excluded.cost_snapshot,capture_started_at=NULL,created_at=now();
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION bof_settle(p_order uuid) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE b bof_order_benefits%ROWTYPE; o orders%ROWTYPE;
BEGIN
  SELECT * INTO b FROM bof_order_benefits WHERE order_id=p_order FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT * INTO o FROM orders WHERE id=p_order;
  IF coalesce(o.is_test_order,false) OR o.status NOT IN ('paid','in_production','shipped','delivered','fulfilled')
    OR b.state IN ('released','reversed') THEN RETURN false; END IF;
  PERFORM user_id FROM bof_members WHERE user_id IN (b.wallet_member_id,b.referrer_id) ORDER BY user_id FOR UPDATE;
  IF b.wallet_cents>0 THEN
    INSERT INTO bof_cash_entries(member_id,order_id,event_key,kind,amount_cents,available_at)
      VALUES(b.wallet_member_id,p_order,'spend:'||p_order,'redemption',-b.wallet_cents,now())
      ON CONFLICT(event_key) DO NOTHING;
  END IF;
  IF b.state='held' AND b.referrer_id IS NOT NULL AND EXISTS (SELECT 1 FROM orders other
    WHERE lower(btrim(other.email))=b.buyer_email AND other.id<>p_order AND NOT coalesce(other.is_test_order,false)
      AND (other.status IN ('paid','in_production','shipped','delivered','fulfilled','refunded')
        OR nullif(to_jsonb(other)->>'paypal_capture_id','') IS NOT NULL)) THEN
    b.reward_eligible := false;
    UPDATE bof_order_benefits SET reward_eligible=false WHERE order_id=p_order;
  END IF;
  IF b.reward_cents>0 AND b.reward_eligible THEN
    INSERT INTO bof_cash_entries(member_id,order_id,event_key,kind,amount_cents)
      VALUES(b.referrer_id,p_order,'earn:'||p_order,'reward',b.reward_cents)
      ON CONFLICT(event_key) DO NOTHING;
  END IF;
  UPDATE bof_order_benefits SET state='paid', paid_at=coalesce(paid_at,now()),
    shipped_at=CASE WHEN o.status IN ('shipped','delivered','fulfilled') THEN coalesce(shipped_at,now()) ELSE shipped_at END
    WHERE order_id=p_order;
  UPDATE bof_cash_entries SET available_at=b2.shipped_at+interval '14 days'
    FROM bof_order_benefits b2 WHERE bof_cash_entries.order_id=p_order AND b2.order_id=p_order
      AND kind='reward' AND available_at IS NULL AND b2.shipped_at IS NOT NULL;
  RETURN true;
END $$;

-- Only call after a provider has definitively canceled/failed the payment.
CREATE OR REPLACE FUNCTION bof_release(p_order uuid) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE b bof_order_benefits%ROWTYPE;
BEGIN
  SELECT * INTO b FROM bof_order_benefits WHERE order_id=p_order FOR UPDATE;
  IF NOT FOUND OR b.state<>'held' THEN RETURN false; END IF;
  PERFORM user_id FROM bof_members WHERE user_id=b.wallet_member_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM orders WHERE id=p_order AND status='pending') THEN
    UPDATE bof_order_benefits SET state='released' WHERE order_id=p_order;
    RETURN true;
  END IF;
  RETURN false;
END $$;

-- p_refunded is cumulative provider-confirmed cash refunded; p_paid is original cash charge.
-- Any refund/dispute revokes the reward; partial refunds return spent cash proportionally.
CREATE OR REPLACE FUNCTION bof_reverse(p_order uuid,p_refunded integer,p_paid integer,p_dispute boolean DEFAULT false)
RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE b bof_order_benefits%ROWTYPE; returned integer; target integer; reward_time timestamptz;
BEGIN
  SELECT * INTO b FROM bof_order_benefits WHERE order_id=p_order FOR UPDATE;
  IF NOT FOUND OR b.state NOT IN ('held','paid','reversed') THEN RETURN false; END IF;
  IF b.state='held' AND NOT EXISTS (SELECT 1 FROM orders WHERE id=p_order AND status IN ('paid','in_production','shipped','delivered','fulfilled','refunded')) THEN RETURN false; END IF;
  PERFORM user_id FROM bof_members WHERE user_id IN (b.wallet_member_id,b.referrer_id) ORDER BY user_id FOR UPDATE;
  IF b.state='held' AND b.wallet_cents>0 THEN
    INSERT INTO bof_cash_entries(member_id,order_id,event_key,kind,amount_cents,available_at)
      VALUES(b.wallet_member_id,p_order,'spend:'||p_order,'redemption',-b.wallet_cents,now()) ON CONFLICT(event_key) DO NOTHING;
  END IF;
  IF b.reward_cents>0 THEN
    SELECT available_at INTO reward_time FROM bof_cash_entries WHERE event_key='earn:'||p_order;
    IF reward_time IS NULL OR reward_time>now() THEN
      -- Prevent a pending credit maturing after a refund.
      UPDATE bof_cash_entries SET available_at=NULL WHERE event_key='earn:'||p_order;
    ELSE
      INSERT INTO bof_cash_entries(member_id,order_id,event_key,kind,amount_cents,available_at)
        VALUES(b.referrer_id,p_order,'reverse:'||p_order,'reward_reversal',-b.reward_cents,now())
        ON CONFLICT(event_key) DO NOTHING;
    END IF;
  END IF;
  IF b.wallet_cents>0 AND NOT p_dispute AND p_paid>0 AND p_refunded>0 THEN
    target := floor(b.wallet_cents::numeric*least(p_refunded,p_paid)/p_paid);
    SELECT coalesce(sum(amount_cents),0) INTO returned FROM bof_cash_entries WHERE order_id=p_order AND kind='redemption_refund';
    IF target>returned THEN
      INSERT INTO bof_cash_entries(member_id,order_id,event_key,kind,amount_cents,available_at)
        VALUES(b.wallet_member_id,p_order,'return:'||p_order||':'||target,'redemption_refund',target-returned,now())
        ON CONFLICT(event_key) DO NOTHING;
    END IF;
  END IF;
  UPDATE bof_order_benefits SET state='reversed' WHERE order_id=p_order;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION bof_claim_invitation(p_hash text,p_member_code text)
RETURNS TABLE(id uuid,email text,full_name text,username text,is_admin boolean) LANGUAGE plpgsql AS $$
DECLARE invite bof_invitations%ROWTYPE; person profiles%ROWTYPE;
BEGIN
  SELECT * INTO invite FROM bof_invitations WHERE token_hash=p_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'BOF_LINK_EXPIRED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('bof-account:'||invite.email,0));
  SELECT * INTO invite FROM bof_invitations WHERE token_hash=p_hash FOR UPDATE;
  IF invite.claimed_at IS NOT NULL OR invite.expires_at<=now() THEN RAISE EXCEPTION 'BOF_LINK_EXPIRED'; END IF;
  SELECT * INTO person FROM profiles p WHERE lower(btrim(p.email))=invite.email ORDER BY p.created_at LIMIT 1 FOR UPDATE;
  IF FOUND AND person.is_admin THEN RAISE EXCEPTION 'BOF_ADMIN_SIGN_IN_REQUIRED'; END IF;
  IF NOT EXISTS (SELECT 1 FROM orders o WHERE lower(btrim(o.email))=invite.email
    AND NOT coalesce(o.is_test_order,false) AND o.status IN ('paid','in_production','shipped','delivered','fulfilled'))
    THEN RAISE EXCEPTION 'BOF_CUSTOMER_REQUIRED'; END IF;
  IF person.id IS NULL THEN
    INSERT INTO profiles(id,email,username,full_name,is_admin,email_verified,created_at,updated_at)
      VALUES(gen_random_uuid(),invite.email,'bof_'||lower(p_member_code),'',false,true,now(),now()) RETURNING * INTO person;
  ELSE
    UPDATE profiles p SET email_verified=true,updated_at=now() WHERE p.id=person.id;
  END IF;
  INSERT INTO bof_members(user_id,code) VALUES(person.id,p_member_code) ON CONFLICT(user_id) DO NOTHING;
  UPDATE orders o SET user_id=person.id WHERE o.user_id IS NULL AND lower(btrim(o.email))=invite.email;
  UPDATE bof_invitations SET claimed_at=now() WHERE bof_invitations.email=invite.email AND claimed_at IS NULL;
  RETURN QUERY SELECT person.id,person.email::text,person.full_name::text,person.username::text,false;
END $$;

ALTER TABLE bof_order_benefits ADD COLUMN IF NOT EXISTS capture_started_at timestamptz;
CREATE TABLE IF NOT EXISTS bof_provider_refunds (
  provider text NOT NULL CHECK (provider IN ('stripe','paypal')),
  refund_id text NOT NULL,
  order_id uuid NOT NULL REFERENCES orders(id),
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(provider,refund_id)
);
CREATE OR REPLACE FUNCTION bof_begin_payment(p_order uuid) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE current_state text;
BEGIN
  SELECT state INTO current_state FROM bof_order_benefits WHERE order_id=p_order FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF current_state NOT IN ('held','paid') THEN RETURN false; END IF;
  UPDATE bof_order_benefits SET capture_started_at=now() WHERE order_id=p_order;
  RETURN true;
END $$;

CREATE TABLE IF NOT EXISTS bof_order_touchpoints (
  order_id uuid PRIMARY KEY REFERENCES orders(id),
  first_shipped_at timestamptz NOT NULL DEFAULT now()
);

-- Stripe refund objects may move from pending to succeeded, or later fail.
-- Keep a provider-event watermark and reconcile only successfully refunded cash.
-- Signed adjustments prevent a failed refund from leaving spendable BOF Cash.
CREATE TABLE IF NOT EXISTS bof_stripe_refund_state (
  order_id uuid PRIMARY KEY REFERENCES orders(id),
  event_created bigint NOT NULL DEFAULT 0 CHECK (event_created >= 0),
  confirmed_cents integer NOT NULL DEFAULT 0 CHECK (confirmed_cents >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE bof_stripe_refund_state ADD COLUMN IF NOT EXISTS revision bigint
  NOT NULL DEFAULT 0 CHECK (revision>=0);

-- Capture this revision BEFORE fetching the canonical Stripe charge/refunds.
-- The revision spans that network read and the later atomic reconciliation.
CREATE OR REPLACE FUNCTION bof_stripe_refund_revision(p_order uuid)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE current_revision bigint;
BEGIN
  PERFORM order_id FROM bof_order_benefits WHERE order_id=p_order FOR UPDATE;
  IF NOT FOUND THEN RETURN NULL; END IF;
  INSERT INTO bof_stripe_refund_state(order_id) VALUES(p_order)
    ON CONFLICT(order_id) DO NOTHING;
  SELECT revision INTO current_revision FROM bof_stripe_refund_state
    WHERE order_id=p_order FOR UPDATE;
  RETURN current_revision;
END $$;

-- Retain the previous signature only to reject callers without a snapshot
-- revision. They must retry using the five-argument guarded function below.
CREATE OR REPLACE FUNCTION bof_reconcile_stripe_refund(
  p_order uuid, p_confirmed integer, p_paid integer, p_event_created bigint DEFAULT 0
) RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'BOF_REFUND_REVISION_REQUIRED';
END $$;

CREATE OR REPLACE FUNCTION bof_reconcile_stripe_refund(
  p_order uuid, p_confirmed integer, p_paid integer, p_event_created bigint, p_expected_revision bigint
) RETURNS boolean LANGUAGE plpgsql AS $$
DECLARE b bof_order_benefits%ROWTYPE; previous_event bigint; current_revision bigint; returned bigint; target integer;
BEGIN
  IF p_confirmed IS NULL OR p_confirmed<0 OR p_paid IS NULL OR p_paid<=0
    OR p_confirmed>p_paid OR p_event_created IS NULL OR p_event_created<0
  THEN RAISE EXCEPTION 'BOF_REFUND_AMOUNT_INVALID'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision<0
    THEN RAISE EXCEPTION 'BOF_REFUND_REVISION_REQUIRED'; END IF;
  -- Use the same benefit-then-member lock order as settlement and reversal.
  SELECT * INTO b FROM bof_order_benefits WHERE order_id=p_order FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  SELECT event_created,revision INTO previous_event,current_revision FROM bof_stripe_refund_state
    WHERE order_id=p_order FOR UPDATE;
  IF NOT FOUND OR p_expected_revision<>current_revision
    THEN RAISE EXCEPTION 'BOF_REFUND_SNAPSHOT_CHANGED'; END IF;
  IF p_event_created<previous_event THEN RETURN false; END IF;
  -- Revoke referral rewards, without the monotonic cash-return behavior used by
  -- PayPal. This also records any paid checkout's not-yet-settled wallet spend.
  IF NOT bof_reverse(p_order,0,p_paid,false) THEN RETURN false; END IF;
  IF b.wallet_cents>0 THEN
    target := floor(b.wallet_cents::numeric*p_confirmed/p_paid);
    SELECT coalesce(sum(amount_cents),0) INTO returned FROM bof_cash_entries
      WHERE order_id=p_order AND kind='redemption_refund';
    IF target<>returned THEN
      INSERT INTO bof_cash_entries(member_id,order_id,event_key,kind,amount_cents,available_at)
        VALUES(b.wallet_member_id,p_order,'stripe-return:'||p_order||':'||gen_random_uuid(),
          'redemption_refund',target-returned,now());
    END IF;
  END IF;
  -- Advance even for an unchanged cash amount: a concurrent canonical read may
  -- have observed a different provider state within the same event second.
  UPDATE bof_stripe_refund_state SET
    event_created=greatest(event_created,p_event_created),
    confirmed_cents=p_confirmed,revision=revision+1,updated_at=now()
    WHERE order_id=p_order;
  RETURN true;
END $$;
