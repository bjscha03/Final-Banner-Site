import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { Context } from "@netlify/functions";
import auth from "./_shared/server-auth.cjs";
import navigation from "./_shared/site-navigation.cjs";

const SITE = "https://bannersonthefly.com";
const PHOTO = "/images/email/september-grand-opening-banner.jpg";
const CODE_PATTERN = /^BOFREF-[A-F0-9]{12}$/;

// The page contains only public referral data. Account claim tokens, customer
// names, emails, balances, and order details must never enter share metadata.
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char]!);
const environment = (name: string) =>
  (globalThis as typeof globalThis & { Netlify?: { env: { get: (name: string) => string | undefined } } })
    .Netlify?.env.get(name) ?? process.env[name];

// This is deliberately independent of request Host and forwarded headers.
// A copied link always points at the actual BOF site, never an injected host.
export function referralOrigin() {
  try {
    const configured = new URL(environment("BOF_PUBLIC_SITE_URL") || SITE);
    if (configured.protocol === "https:" && !configured.username && !configured.password &&
      (configured.hostname === "bannersonthefly.com" || configured.hostname === "www.bannersonthefly.com" || configured.hostname.endsWith(".netlify.app")))
      return configured.origin;
  } catch { /* An invalid optional setting must never create a broken share URL. */ }
  return SITE;
}

const attributionScript = `(() => {
  const code = document.body.dataset.referralCode;
  if (!/^BOFREF-[A-F0-9]{12}$/.test(code || "")) return;
  const message = document.getElementById("referral-saved");
  try {
    localStorage.setItem("bof_referral_v1", JSON.stringify({ code, expires: Date.now() + 30 * 86400000 }));
    if (message) message.textContent = "Your referral is saved. We’ll check your savings at checkout.";
  } catch {
    if (message) message.textContent = "Keep your code handy and enter it at checkout.";
  }
})();`;
const scriptHash = createHash("sha256").update(attributionScript).digest("base64");

type PageState = "active" | "invalid" | "paused" | "coming-soon" | "unavailable" | "preview";
const copy = {
  invalid: ["This referral link isn’t available.", "Ask your friend for their current referral link. You can still explore banners, yard signs, and car magnets below."],
  paused: ["Referral offers are taking a break.", "New referral savings are temporarily paused. Visit Banners On The Fly for your next project."],
  "coming-soon": ["Good things are worth sharing.", "BOF Cash is coming soon. Explore banners, yard signs, and car magnets while we get everything ready."],
  unavailable: ["Let’s try that again in a moment.", "We couldn’t check this referral right now. Refresh this page shortly to see your offer."],
  preview: ["This is a review preview.", "Customer referral offers are available on the live Banners On The Fly website when BOF Cash is open."],
};

export function renderReferralPage(code: string, state: PageState, origin = SITE) {
  const active = state === "active" && CODE_PATTERN.test(code);
  const safeCode = active ? code : "";
  const title = active
    ? `Save up to $25 · ${safeCode} | Banners On The Fly`
    : `${copy[state === "active" ? "invalid" : state][0]} | Banners On The Fly`;
  const description = active
    ? `Use ${safeCode} for 25% off eligible banners and yard signs or 10% off car magnets, up to $25 on a qualifying first order. Minimums apply. Your friend may earn BOF Cash.`
    : copy[state === "active" ? "invalid" : state][1];
  const canonical = `${origin}${CODE_PATTERN.test(code) ? `/refer/${code}` : "/bof-cash"}`;
  const e = escapeHtml;
  return `<!doctype html>
<html lang="en" prefix="og: https://ogp.me/ns#">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${e(title)}</title>
  <meta name="description" content="${e(description)}">
  <meta name="robots" content="noindex,follow">
  <meta name="referrer" content="strict-origin-when-cross-origin">
  <link rel="canonical" href="${e(canonical)}">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="Banners On The Fly">
  <meta property="og:locale" content="en_US">
  <meta property="og:url" content="${e(canonical)}">
  <meta property="og:title" content="${e(title)}">
  <meta property="og:description" content="${e(description)}">
  <meta property="og:image" content="${e(origin + PHOTO)}">
  <meta property="og:image:secure_url" content="${e(origin + PHOTO)}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="A colorful custom grand-opening banner outside a coffee shop">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${e(title)}">
  <meta name="twitter:description" content="${e(description)}">
  <meta name="twitter:image" content="${e(origin + PHOTO)}">
  <style>
    *{box-sizing:border-box}body{margin:0;background:#f7f8fa;color:#142641;font-family:Arial,Helvetica,sans-serif;-webkit-font-smoothing:antialiased}a{color:inherit}.site-header{background:#fff;border-bottom:1px solid #e5e7eb}.header-inner{max-width:1120px;margin:auto;padding:21px 28px;display:flex;align-items:center;justify-content:space-between;gap:20px}.logo{width:214px;height:auto;display:block}.header-link{font-size:14px;font-weight:700;text-decoration:none}.header-link:hover{text-decoration:underline}main{max-width:1120px;padding:46px 28px 32px;margin:auto}.hero{display:grid;grid-template-columns:1.04fr 1fr;overflow:hidden;border-radius:24px;background:#122641;box-shadow:0 18px 44px #12264112}.hero-copy{padding:44px 36px;color:#fff}.eyebrow{display:inline-block;font-size:12px;font-weight:800;letter-spacing:1.7px;text-transform:uppercase;color:#ffcb9f;margin:0 0 22px}.hero h1{font-size:clamp(34px,4vw,48px);line-height:1.08;letter-spacing:-1.7px;margin:0 0 20px;max-width:490px}.hero h1 span{color:#ffb56e}.intro{font-size:17px;line-height:1.6;color:#d9e3f0;margin:0 0 24px;max-width:480px}.hero-photo{min-height:390px;width:100%;height:100%;object-fit:cover;object-position:46% 50%}.code-label{display:block;color:#d9e3f0;font-size:12px;font-weight:700;margin-bottom:7px}.code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:18px;letter-spacing:.4px;font-weight:700;display:inline-block;padding:11px 14px;background:#ffffff10;border:1px solid #ffffff30;border-radius:9px;max-width:100%;overflow-wrap:anywhere}.cta{display:inline-flex;align-items:center;justify-content:center;gap:12px;background:#c2410c;color:#fff;padding:16px 22px;margin-top:25px;border-radius:10px;font-weight:800;font-size:16px;text-decoration:none;min-height:52px}.cta:hover{background:#9a3412}.cta:focus-visible,.header-link:focus-visible,a:focus-visible{outline:3px solid #ffb56e;outline-offset:4px}.saved{font-size:12px;color:#d9e3f0;line-height:1.6;margin:13px 0 0;max-width:360px}.details{display:grid;grid-template-columns:1fr 1fr 1fr;gap:22px;margin:28px 0 26px}.detail{background:#fff;border:1px solid #e4e8ee;border-radius:14px;padding:22px}.detail h2{font-size:15px;line-height:1.5;margin:0 0 7px}.detail p{color:#5b687a;font-size:14px;line-height:1.6;margin:0}.terms{font-size:12px;line-height:1.7;color:#637083;max-width:930px}.terms a{text-underline-offset:3px}footer{max-width:1120px;margin:auto;padding:0 28px 30px;font-size:12px;color:#637083;display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap}footer a{text-underline-offset:3px}
    @media(max-width:720px){.header-inner{padding:17px 20px}.logo{width:180px}.header-link{font-size:12px}main{padding:24px 16px}.hero{grid-template-columns:1fr;border-radius:19px}.hero-copy{padding:30px 25px}.hero h1{font-size:39px}.eyebrow{margin-bottom:18px}.intro{font-size:16px}.hero-photo{min-height:0;height:230px;object-position:center}.details{grid-template-columns:1fr;gap:12px;margin-top:20px}.detail{padding:18px 20px}.cta{width:100%}.code{font-size:17px}.saved{max-width:none}footer{padding:0 20px 25px}.terms{padding:0 4px}}
    @media(prefers-reduced-motion:no-preference){.cta{transition:background .15s ease}}
  </style>
</head>
<body${active ? ` data-referral-code="${e(safeCode)}"` : ""}>
  <header class="site-header"><div class="header-inner"><a href="/" aria-label="Banners On The Fly home"><img class="logo" src="${e(origin)}/images/header-logo.png" alt="Banners On The Fly" width="214" height="60"></a>${navigation.siteNavigation()}</div></header>
  <main>
    <section class="hero" aria-labelledby="offer-heading">
      <div class="hero-copy">
        <p class="eyebrow">${active ? "A good word. A great deal." : "Banners On The Fly · BOF Cash"}</p>
        <h1 id="offer-heading">${active ? "Your next big idea.<br><span>Up to $25 off.</span>" : e(copy[state === "active" ? "invalid" : state][0])}</h1>
        <p class="intro">${active ? "Your friend sent you savings on banners, yard signs, and car magnets for your first qualifying BOF order." : e(description)}</p>
        ${active ? `<div><span class="code-label">YOUR FRIEND’S REFERRAL CODE</span><span class="code">${e(safeCode)}</span></div>` : ""}
        <a class="cta" href="/">${active ? "Shop with this referral" : "Explore Banners On The Fly"} <span aria-hidden="true">→</span></a>
        ${active ? '<p class="saved" id="referral-saved" role="status">Use this code at checkout to check your savings.</p><noscript><p class="saved">Enter your referral code at checkout. You can check out as a guest.</p></noscript>' : ""}
      </div>
      <img class="hero-photo" src="${e(origin + PHOTO)}" alt="A vibrant custom banner celebrating a local coffee shop’s grand opening" width="1200" height="630" fetchpriority="high">
    </section>
    ${active ? `<section class="details" aria-label="Your referral offer"><div class="detail"><h2>25% off banners &amp; yard signs</h2><p>Make your business, event, or next big announcement stand out.</p></div><div class="detail"><h2>10% off car magnets</h2><p>Take your message wherever the road takes you.</p></div><div class="detail"><h2>Guest checkout welcome</h2><p>Shop and check out as a guest. Your friend may earn BOF Cash when your order qualifies.</p></div></section><p class="terms">Up to $25 total savings on a qualifying first order. $50 merchandise minimum, or $75 when the order includes magnets. Eligible products only. Cannot be combined with other offers or BOF Cash. Final eligibility and savings are confirmed at checkout. No photo or social post is required. <a href="/bof-cash#terms">View BOF Cash terms</a>.</p>` : ""}
  </main>
  <footer><span>Made for your next big idea.</span><a href="mailto:info@bannersonthefly.com">Need a hand? Contact BOF</a></footer>
  ${active ? `<script>${attributionScript}</script>` : ""}
</body>
</html>`;
}

function response(request: Request, code: string, state: PageState, status = 200) {
  const origin = referralOrigin();
  return new Response(request.method === "HEAD" ? null : renderReferralPage(code, state, origin), {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "strict-origin-when-cross-origin",
      "X-Robots-Tag": "noindex, follow",
      // The existing Netlify image integration redirects BOF image paths to
      // this Cloudinary account, including the logo and referral hero.
      "Content-Security-Policy": `default-src 'none'; img-src ${origin} https://res.cloudinary.com/dtrxl120u/; style-src 'unsafe-inline'; script-src 'sha256-${scriptHash}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
      ...(status === 503 ? { "Retry-After": "60" } : {}),
    },
  });
}

export default async function handler(request: Request, context: Context) {
  if (!["GET", "HEAD"].includes(request.method))
    return new Response("Method not allowed", { status: 405, headers: { Allow: "GET, HEAD", "Cache-Control": "no-store" } });
  const url = new URL(request.url);
  const code = context?.params?.code || url.searchParams.get("code") || url.pathname.match(/^\/refer\/([^/]+)\/?$/)?.[1] || "";
  if (!CODE_PATTERN.test(code)) return response(request, "", "invalid", 404);
  const event = { headers: Object.fromEntries(request.headers), rawUrl: request.url };
  if (!event.headers.host) event.headers.host = url.host;
  if (/^deploy-preview-\d+--.+\.netlify\.app$/i.test(url.hostname) || auth.isDeployPreviewEnvironment(event))
    return response(request, code, "preview");
  if (environment("BOF_REFERRAL_ENABLED") !== "true")
    return response(request, code, environment("BOF_REFERRAL_LAUNCHED_AT") ? "paused" : "coming-soon");
  const database = environment("NETLIFY_DATABASE_URL") || environment("DATABASE_URL");
  if (!database) return response(request, code, "unavailable", 503);
  try {
    const sql = neon(database);
    const members = await sql`SELECT 1 AS valid FROM bof_members WHERE code=${code.slice(7)} AND enabled LIMIT 1`;
    return members.length ? response(request, code, "active") : response(request, code, "invalid", 404);
  } catch (error) {
    // No submitted codes, connection strings, or customer details in logs.
    console.error("[bof-referral] public referral lookup unavailable", { code: (error as { code?: string })?.code || null });
    return response(request, code, "unavailable", 503);
  }
}
