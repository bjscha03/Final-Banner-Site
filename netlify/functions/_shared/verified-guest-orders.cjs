'use strict';

// Call only after authenticating the account. The database repeats the email
// verification and identity checks so a stale/unverified profile can never
// claim order history by supplying an email address in a request body.
async function linkVerifiedGuestOrders(sql, person) {
  const id = String(person?.id || '');
  const email = String(person?.email || '').trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id) || !email) return 0;

  const linked = await sql`UPDATE orders AS o SET user_id=p.id
    FROM profiles AS p
    WHERE p.id=${id}::uuid AND p.email_verified IS TRUE
      AND lower(btrim(p.email))=${email}
      AND o.user_id IS NULL AND lower(btrim(o.email))=lower(btrim(p.email))
    RETURNING o.id`;
  return linked.length;
}

module.exports = { linkVerifiedGuestOrders };
