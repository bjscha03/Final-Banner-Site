import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import bof from "./_shared/bof-service.cjs";
import { evaluateCart } from "./_shared/bof-policy.mjs";

const BRANCH = "br-delicate-boat-ae77mvtt";
const TESTER = "b.schaefermarketer@outlook.com";
const AUDIENCE = "bof-isolated-test-v1";
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const CODE = /^BOFREF-[A-F0-9]{12}$/;
const headers = { "Content-Type": "application/json", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Robots-Tag": "noindex,nofollow" };
const json = (status, body) => new Response(JSON.stringify({ isolatedTest: true, ...body }), { status, headers });
const fail = (status, message) => { throw Object.assign(new Error(message), { statusCode: status }); };
const hash = (value) => createHash("sha256").update(value).digest("hex");
const databaseIdentity = (value) => {
  try { const url = new URL(value); return `${url.hostname.replace(/-pooler(?=\.)/, "")}${url.pathname}`; }
  catch { return ""; }
};
export function testConfiguration(env = process.env) {
  const database = env.BOF_TEST_DATABASE_URL, secret = env.BOF_TEST_SESSION_SECRET;
  if (!databaseIdentity(database) || env.BOF_TEST_BRANCH_ID !== BRANCH || !secret || secret.length < 32 ||
    secret === env.AUTH_SESSION_SECRET || secret === env.CLOUDINARY_API_SECRET ||
    [env.NETLIFY_DATABASE_URL, env.DATABASE_URL].some((production) => production && databaseIdentity(production) === databaseIdentity(database)))
    fail(503, "The isolated test environment is not available yet.");
  let origin;
  try {
    const configured = new URL(env.BOF_TEST_PUBLIC_SITE_URL || "https://bannersonthefly.com");
    if (configured.protocol !== "https:" || configured.username || configured.password || configured.pathname !== "/" || configured.search || configured.hash ||
      !/^(?:bannersonthefly\.com|deploy-preview-\d+--bannersonthefly\.netlify\.app)$/.test(configured.hostname)) throw new Error("invalid origin");
    origin = configured.origin;
  } catch { fail(503, "The isolated test address is not configured."); }
  return { database, secret, origin };
}
export function signTestSession(person, secret) {
  const payload = Buffer.from(JSON.stringify({ sub: person.id, email: TESTER, aud: AUDIENCE, branch: BRANCH, exp: Math.floor(Date.now() / 1000) + 28800 })).toString("base64url");
  return `${payload}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}
export function verifyTestSession(token, secret) {
  if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token || "") || token.length > 2048) return null;
  const [payload, signature] = token.split(".");
  const expected = createHmac("sha256", secret).update(payload).digest("base64url");
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const session = JSON.parse(Buffer.from(payload, "base64url").toString());
    return session.aud === AUDIENCE && session.branch === BRANCH && session.email === TESTER && UUID.test(session.sub) && session.exp > Date.now() / 1000 ? session : null;
  } catch { return null; }
}
const fixtureId = (member, key, kind) => {
  const value = hash(`${AUDIENCE}:${member}:${key}:${kind}`);
  return `${value.slice(0,8)}-${value.slice(8,12)}-4${value.slice(13,16)}-a${value.slice(17,20)}-${value.slice(20,32)}`;
};
const cart = [{ id: "isolated-test-banner", product_type: "banner", width_in: 120, height_in: 48, material: "13oz", quantity: 1 }];
async function wallet(sql, person) {
  const data = await bof.wallet(sql, person.id);
  const pastOrders = await sql`SELECT id,status,total_cents,created_at FROM orders WHERE user_id=${person.id}::uuid AND lower(btrim(email))=${TESTER}
    AND (checkout_idempotency_key IS NULL OR checkout_idempotency_key NOT LIKE 'bof-isolated:%') ORDER BY created_at DESC LIMIT 20`;
  return { ...data, code: `BOFREF-${person.code}`, pastOrders, email: TESTER };
}
function sharePage(code, origin) {
  // This is a real public test link, but never an offer redeemable on live orders.
  const url = `${origin}/bof-cash-test/share/${code}`;
  const image = "https://bannersonthefly.com/images/email/september-grand-opening-banner.jpg";
  const title = `BOF Cash TEST · ${code}`;
  const description = "Isolated BOF referral test. Simulated savings and rewards only; no real discount, payment, or BOF Cash.";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${title}</title><meta property="og:type" content="website"><meta property="og:site_name" content="Banners On The Fly"><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="og:url" content="${url}"><meta property="og:image" content="${image}"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><style>body{margin:0;background:#f1f5f9;font:16px/1.6 Arial;color:#122641}main{max-width:660px;margin:36px auto;padding:24px}article{overflow:hidden;border-radius:20px;background:white;border:1px solid #dde4ef}img{display:block;width:100%;height:auto}.content{padding:28px}.test{font-size:12px;font-weight:bold;color:#92400e;background:#fef3c7;padding:12px;border-radius:8px}h1{font-size:32px;line-height:1.2}.code{font:700 18px monospace;overflow-wrap:anywhere}a{display:block;text-align:center;padding:15px;background:#c2410c;color:white;border-radius:10px;text-decoration:none;font-weight:bold}a:focus-visible{outline:3px solid #18448d;outline-offset:4px}</style></head><body><main><article><img src="${image}" width="1200" height="630" alt="A colorful custom grand-opening banner"><div class="content"><p class="test">ISOLATED TEST — NO LIVE DISCOUNT OR FUNDS</p><h1>Your referral link works.</h1><p>This page identifies the right test member using their code. Only the authorized tester can simulate an order and credit in the test wallet.</p><p class="code">${code}</p><p>A live qualifying first order may save up to $25. This test page does not apply savings to ordinary checkout.</p><a href="/bof-cash-test?ref=${code}#testing">Continue the isolated referral test →</a></div></article></main></body></html>`;
  return new Response(html, { headers: { ...headers, "Content-Type": "text/html; charset=utf-8", "Content-Security-Policy": "default-src 'none'; img-src https://bannersonthefly.com; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" } });
}
export default async function handler(request) {
  try {
    const url = new URL(request.url);
    // Modern Netlify functions can retain the original public URL rather than
    // the rewrite target's query string. Support that canonical share route.
    const pathCode = url.pathname.match(/^\/bof-cash-test\/share\/([^/]+)\/?$/)?.[1];
    const action = pathCode ? "share" : url.searchParams.get("action") || "wallet";
    if (!["GET", "POST", "HEAD"].includes(request.method)) return json(405, { error: "Method not allowed." });
    const origin = request.headers.get("origin");
    if (request.method === "POST" && origin && origin !== url.origin) return json(403, { error: "Open this test on the BOF website." });
    if (action !== "share" && request.method !== "POST") return json(405, { error: "Use the explicit test controls." });
    if (action === "share" && request.method === "POST") return json(405, { error: "Method not allowed." });
    const config = testConfiguration();
    const sql = neon(config.database);
    const branch = await sql`SELECT current_setting('neon.branch_id',true) AS branch_id`;
    if (branch[0]?.branch_id !== BRANCH) return json(503, { error: "The isolated test database could not be verified." });
    if (action === "share") {
      const code = pathCode || url.searchParams.get("code") || "";
      if (!CODE.test(code)) return json(404, { error: "Test referral not found." });
      const member = await sql`SELECT 1 FROM bof_members m JOIN profiles p ON p.id=m.user_id WHERE m.code=${code.slice(7)} AND m.enabled AND lower(btrim(p.email))=${TESTER} LIMIT 1`;
      if (!member.length) return json(404, { error: "Test referral not found." });
      // These are the only hosts on which this owner test is published. Never
      // reflect forwarded Host headers or arbitrary URL text into social HTML.
      if (url.origin !== config.origin) return json(400, { error: "Open the test on the BOF website." });
      const response = sharePage(code, config.origin);
      return request.method === "HEAD" ? new Response(null, { headers: response.headers }) : response;
    }
    const rawBody = await request.text();
    if (rawBody.length > 4096) return json(413, { error: "Request too large." });
    let input; try { input = JSON.parse(rawBody || "{}"); } catch { return json(400, { error: "Invalid request." }); }
    if (!input || typeof input !== "object" || Array.isArray(input)) return json(400, { error: "Invalid request." });
    if (action === "claim") {
      if (!/^[a-f0-9-]{36}\.[a-f0-9]{64}$/.test(input.token || "")) return json(400, { error: "Open the private test link from your email." });
      const invitation = await sql`SELECT email FROM bof_invitations WHERE token_hash=${hash(input.token)} AND claimed_at IS NULL AND expires_at>now()`;
      if (invitation[0]?.email !== TESTER) return json(410, { error: "This private test link expired or was already used." });
      const [person] = await sql`SELECT * FROM bof_claim_invitation(${hash(input.token)},${randomBytes(6).toString("hex").toUpperCase()})`;
      if (person?.email !== TESTER) return json(403, { error: "This test is available only to its invited owner." });
      return json(200, { sessionToken: signTestSession(person, config.secret) });
    }
    const session = verifyTestSession((request.headers.get("authorization") || "").replace(/^Bearer\s+/i, ""), config.secret);
    if (!session) return json(401, { error: "Activate the private test link from your email first." });
    const [person] = await sql`SELECT p.id,m.code FROM profiles p JOIN bof_members m ON m.user_id=p.id WHERE p.id=${session.sub}::uuid AND lower(btrim(p.email))=${TESTER} AND p.email_verified AND NOT p.is_admin AND m.enabled`;
    if (!person) return json(401, { error: "This test account is not activated." });
    if (action === "wallet") return json(200, await wallet(sql, person));
    if (action === "mature") {
      await sql`UPDATE bof_order_benefits SET shipped_at=now()-interval '15 days' WHERE referrer_id=${person.id}::uuid AND state='paid' AND cost_snapshot->>'isolatedTest'='true'`;
      await sql`UPDATE bof_cash_entries e SET available_at=b.shipped_at+interval '14 days' FROM bof_order_benefits b WHERE b.order_id=e.order_id AND e.member_id=${person.id}::uuid AND e.kind='reward' AND b.state='paid' AND b.cost_snapshot->>'isolatedTest'='true'`;
      return json(200, { ...await wallet(sql, person), message: "Simulated 15 days after shipment. Test rewards are available now." });
    }
    if (!["refer", "redeem"].includes(action)) return json(404, { error: "Unknown test action." });
    if (!UUID.test(input.idempotencyKey || "")) return json(400, { error: "Refresh and try this test again." });
    if (action === "refer" && input.referralCode !== `BOFREF-${person.code}`) return json(400, { error: "Open your test referral link before simulating a referred order." });
    const id = fixtureId(person.id, input.idempotencyKey, action), key = `bof-isolated:${person.id}:${action}:${input.idempotencyKey}`;
    const existing = await sql`SELECT id FROM orders WHERE id=${id}::uuid AND checkout_idempotency_key=${key}`;
    const count = await sql`SELECT count(*)::integer AS n FROM orders WHERE checkout_idempotency_key LIKE ${`bof-isolated:${person.id}:%`}`;
    if (!existing.length && count[0].n >= 30) return json(409, { error: "This test has reached its 30 simulated order limit." });
    const balance = action === "redeem" ? (await wallet(sql, person)).availableCents : 0;
    // Replays must preserve the original quote amount even after its balance
    // has been spent. bof_reserve/bof_settle then enforce ledger idempotency.
    const prior = existing.length ? await sql`SELECT wallet_cents FROM bof_order_benefits WHERE order_id=${id}::uuid` : [];
    const financial = evaluateCart(cart, { kind: action === "redeem" ? "wallet" : "friend", balanceCents: prior[0]?.wallet_cents || balance });
    if (!financial.eligible) return json(409, { error: financial.reason });
    const cash = action === "redeem" ? financial.discountCents : 0, reward = action === "refer" ? financial.rewardCents : 0;
    const buyer = action === "refer" ? `${id}@bof-test.invalid` : TESTER;
    const quote = cash ? `BOFCASH-${id.replaceAll("-", "").toUpperCase()}` : null;
    const snapshot = JSON.stringify({ ...financial, items: undefined, isolatedTest: true });
    const taxCents = Math.round(financial.netCents * 0.06);
    await sql`INSERT INTO orders(id,email,user_id,status,subtotal_cents,tax_cents,total_cents,is_test_order,checkout_idempotency_key) VALUES(${id}::uuid,${buyer},${action === "redeem" ? person.id : null}::uuid,'pending',${financial.netCents},${taxCents},${financial.netCents + taxCents},false,${key}) ON CONFLICT(id) DO NOTHING`;
    if (cash) await sql`INSERT INTO bof_quotes(code,member_id,cart_hash,amount_cents,expires_at) VALUES(${quote},${person.id}::uuid,${financial.cartHash},${cash},now()+interval '30 minutes') ON CONFLICT(code) DO NOTHING`;
    await sql`SELECT bof_reserve(${id}::uuid,${buyer},${reward ? person.id : null}::uuid,${reward},${cash ? person.id : null}::uuid,${cash},${reward ? financial.discountCents : 0},${financial.contributionCents},${financial.netCents},${snapshot}::jsonb,${quote})`;
    await sql`UPDATE orders SET status='shipped' WHERE id=${id}::uuid AND checkout_idempotency_key=${key}`;
    await sql`SELECT bof_settle(${id}::uuid)`;
    return json(200, { ...await wallet(sql, person), message: action === "refer" ? `Simulated qualifying referral: $${reward/100} test reward is pending.` : `Simulated checkout used $${cash/100} of test BOF Cash. No payment was made.`, simulatedOrder: { id, eligibleCents: financial.eligibleCents, discountCents: financial.discountCents, rewardCents: reward } });
  } catch (error) {
    console.error("[bof-cash-test]", { code: error.code || null, status: error.statusCode || 503 });
    return json(error.statusCode || 503, { error: error.statusCode ? error.message : "The isolated test could not finish. Please try again; no live orders or money were changed." });
  }
}
