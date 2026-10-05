-- Explicit owner-approved activation exceptions. These grant no credit, create
-- no orders, and never verify an email; the ordinary single-use link does that.
-- Bind each grant to BOTH an existing profile and its current normalized email.
CREATE TABLE IF NOT EXISTS bof_activation_exceptions (
  user_id uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE CHECK (email = lower(btrim(email)) AND email <> ''),
  reason text NOT NULL CHECK (length(btrim(reason)) > 0),
  granted_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

CREATE OR REPLACE FUNCTION bof_can_activate(p_email text)
RETURNS boolean LANGUAGE sql STABLE AS $$
  SELECT EXISTS (
    SELECT 1 FROM orders o WHERE lower(btrim(o.email))=lower(btrim(p_email))
      AND NOT coalesce(o.is_test_order,false)
      AND o.status IN ('paid','in_production','shipped','delivered','fulfilled')
  ) OR EXISTS (
    SELECT 1 FROM bof_activation_exceptions e JOIN profiles p ON p.id=e.user_id
    WHERE e.email=lower(btrim(p_email)) AND lower(btrim(p.email))=e.email
      AND NOT coalesce(p.is_admin,false) AND e.revoked_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM profiles other
        WHERE lower(btrim(other.email))=e.email AND other.id<>e.user_id)
  )
$$;

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
  IF NOT bof_can_activate(invite.email)
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
