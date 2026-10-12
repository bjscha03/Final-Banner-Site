import { neon } from "@neondatabase/serverless";
import { withLambda } from "@netlify/aws-lambda-compat";
import auth from "./_shared/server-auth.cjs";
import outreach from "./_shared/louisville-outreach.cjs";
import validation from "./_shared/discount-validation.cjs";
import { walletStatus, signedPass } from "./_shared/louisville-wallet.mjs";
const headers = {
  "Content-Type": "application/json",
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow",
  "X-Content-Type-Options": "nosniff",
};
const reply = (statusCode, body) => ({
  statusCode,
  headers,
  body: JSON.stringify(body),
});
export async function handler(event) {
  if (event.httpMethod !== "GET")
    return reply(405, { error: "Method not allowed." });
  const code = String(event.queryStringParameters?.code || "")
    .trim()
    .toUpperCase();
  const action = event.queryStringParameters?.action || "offer";
  if (
    !outreach.CODE_PATTERN.test(code) ||
    !["offer", "wallet"].includes(action)
  )
    return reply(404, { error: "This coupon link is not available." });
  if (auth.isDeployPreviewEnvironment(event))
    return reply(409, { error: "Open this coupon on bannersonthefly.com." });
  try {
    const sql = neon(
      process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL,
    );
    const result = await validation.validateDiscountForCheckout({ sql, code });
    if (!result.valid || result.discount?.campaign !== outreach.CAMPAIGN)
      return reply(200, {
        valid: false,
        code,
        error: result.error || "This coupon is not available.",
      });
    if (action === "offer")
      return reply(200, {
        valid: true,
        code,
        discount: result.discount,
        terms: outreach.TERMS,
        walletReady: (await walletStatus().catch(() => ({ ready: false })))
          .ready,
      });
    const rows =
      await sql`SELECT id,discount_code FROM louisville_outreach_contacts WHERE discount_code=${code}`;
    if (!rows.length)
      return reply(404, { error: "This coupon is not available." });
    const pass = await signedPass(rows[0]);
    return {
      statusCode: 200,
      headers: {
        ...headers,
        "Content-Type": "application/vnd.apple.pkpass",
        "Content-Disposition":
          'attachment; filename="Banners-On-The-Fly-25-Off.pkpass"',
      },
      isBase64Encoded: true,
      body: pass.toString("base64"),
    };
  } catch {
    if (action === "wallet")
      return {
        statusCode: 503,
        headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
        body: `<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Your BOF coupon</title><body style="font:18px/1.6 Arial;padding:32px;max-width:540px;margin:auto;color:#122641"><h1>Your coupon is still here.</h1><p>We couldn’t prepare the Wallet pass right now. You can still use your coupon on our website, or try saving it again later.</p><a href="/louisville-offer?code=${encodeURIComponent(code)}">Open your 25% off coupon →</a></body></html>`,
      };
    return reply(503, {
      error: "Your coupon could not be loaded. Please retry.",
    });
  }
}
export default withLambda(handler);
