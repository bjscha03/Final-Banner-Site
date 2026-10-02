import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";
const query = vi.hoisted(() => vi.fn(async () => [{ valid: 1 }]));
vi.mock("@neondatabase/serverless", () => ({ neon: () => query }));
import handler, { referralOrigin, renderReferralPage } from "../bof-referral.ts";

const CODE = "BOFREF-ABCDEF123456";
const request = (path = `/refer/${CODE}`, options) => new Request(`https://bannersonthefly.com${path}`, options);
const call = (req = request()) => handler(req, { params: {} });
const envKeys = ["DATABASE_URL", "NETLIFY_DATABASE_URL", "BOF_REFERRAL_ENABLED", "BOF_REFERRAL_LAUNCHED_AT", "BOF_PUBLIC_SITE_URL", "CONTEXT", "DEPLOY_PRIME_URL"];
let previous;
beforeEach(() => {
  previous = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
  for (const key of envKeys) delete process.env[key];
  process.env.DATABASE_URL = "test-only";
  process.env.BOF_REFERRAL_ENABLED = "true";
  query.mockReset().mockResolvedValue([{ valid: 1 }]);
});
afterEach(() => {
  for (const key of envKeys) {
    if (previous[key] === undefined) delete process.env[key];
    else process.env[key] = previous[key];
  }
  vi.restoreAllMocks();
});

describe("public BOF referral page", () => {
  it("serves real member code, complete social metadata and terms in the initial HTML", async () => {
    const response = await call();
    const html = await response.text();
    const doc = new JSDOM(html).window.document;
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledTimes(1);
    expect(query.mock.calls[0][0].join("?")).toContain("AND enabled");
    expect(query.mock.calls[0][1]).toBe("ABCDEF123456");
    expect(doc.querySelector('meta[property="og:title"]').content).toContain(`Save up to $25 · ${CODE}`);
    expect(doc.querySelector('meta[property="og:description"]').content).toContain(CODE);
    expect(doc.querySelector('meta[property="og:url"]').content).toBe(`https://bannersonthefly.com/refer/${CODE}`);
    expect(doc.querySelector('meta[property="og:image"]').content).toBe("https://bannersonthefly.com/images/email/september-grand-opening-banner.jpg");
    expect(doc.querySelector('meta[property="og:image:width"]').content).toBe("1200");
    expect(doc.querySelector('meta[property="og:image:height"]').content).toBe("630");
    expect(doc.body.textContent).toContain("$50 merchandise minimum, or $75");
    expect(doc.body.textContent).toContain("No photo or social post is required");
    expect(doc.querySelector(".cta").getAttribute("href")).toBe("/");
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("gives Facebook and people the same HTML without cookies or a login", async () => {
    const human = await (await call()).text();
    const crawler = await (await call(request(`/refer/${CODE}`, { headers: { "user-agent": "facebookexternalhit/1.1" } }))).text();
    expect(crawler).toBe(human);
    expect(crawler).not.toMatch(/sessionToken|claim=|@customer|user_id/);
  });

  it("persists the verified referral using the same storage format checkout reads", () => {
    const dom = new JSDOM(renderReferralPage(CODE, "active"), { url: `https://bannersonthefly.com/refer/${CODE}`, runScripts: "dangerously" });
    const referral = JSON.parse(dom.window.localStorage.getItem("bof_referral_v1"));
    expect(referral.code).toBe(CODE);
    expect(referral.expires).toBeGreaterThan(Date.now() + 29 * 86400000);
    expect(referral.expires).toBeLessThanOrEqual(Date.now() + 30 * 86400000);
    expect(dom.window.document.getElementById("referral-saved").textContent).toContain("referral is saved");
  });

  it("keeps a usable visible code and shop link when browser storage is blocked", () => {
    const dom = new JSDOM(renderReferralPage(CODE, "active"), {
      url: "https://bannersonthefly.com", runScripts: "dangerously",
      beforeParse(window) { Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); } }); },
    });
    expect(dom.window.document.getElementById("referral-saved").textContent).toContain("enter it at checkout");
    expect(dom.window.document.querySelector(".code").textContent).toBe(CODE);
    expect(dom.window.document.querySelector(".cta").getAttribute("href")).toBe("/");
  });

  it.each(["BOFREF-NOTVALID123", "bofref-abcdef123456", "BOFREF-ABCDEF123456evil", '<script>alert(1)</script>'])
    ("rejects malformed code %s before any database query", async (code) => {
      const response = await handler(request(), { params: { code } });
      const html = await response.text();
      expect(response.status).toBe(404);
      expect(query).not.toHaveBeenCalled();
      expect(html).not.toContain("data-referral-code=");
      expect(html).not.toContain("<script>");
      expect(html).not.toContain("Save up to $25");
    });

  it("never treats a syntactically valid but missing or disabled member as a real offer", async () => {
    query.mockResolvedValue([]);
    const response = await call();
    const html = await response.text();
    expect(response.status).toBe(404);
    expect(html).toContain("This referral link isn’t available");
    expect(html).not.toContain("data-referral-code=");
    expect(html).not.toContain("Save up to $25");
  });

  it("honors the launch and pause gates without opening the database", async () => {
    process.env.BOF_REFERRAL_ENABLED = "false";
    expect(await (await call()).text()).toContain("BOF Cash is coming soon");
    process.env.BOF_REFERRAL_LAUNCHED_AT = "2026-10-02T00:00:00Z";
    expect(await (await call()).text()).toContain("Referral offers are taking a break");
    expect(query).not.toHaveBeenCalled();
  });

  it("does not query real members or expose offers on a deploy preview", async () => {
    const response = await call(new Request(`https://deploy-preview-553--bannersonthefly.netlify.app/refer/${CODE}`, {
      headers: { "x-forwarded-host": "bannersonthefly.com" },
    }));
    expect(await response.text()).toContain("This is a review preview");
    expect(query).not.toHaveBeenCalled();
  });

  it("returns a retryable failure without leaking a database error or asserting a discount", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    query.mockRejectedValue(new Error("private connection and customer information"));
    const response = await call();
    const html = await response.text();
    expect(response.status).toBe(503);
    expect(response.headers.get("retry-after")).toBe("60");
    expect(html).not.toContain("private connection");
    expect(html).not.toContain("data-referral-code=");
    expect(html).not.toContain("Save up to $25");
  });

  it("supports Netlify's explicit rewrite and removes tracking or account tokens from metadata", async () => {
    const response = await call(request(`/.netlify/functions/bof-referral?code=${CODE}&claim=secret-token&utm_source=facebook`));
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(html).toContain(`https://bannersonthefly.com/refer/${CODE}`);
    expect(html).not.toContain("secret-token");
    expect(html).not.toContain("utm_source");
  });

  it("uses only trusted deployment configuration for absolute URLs, never request headers", async () => {
    const response = await call(request(`/refer/${CODE}`, { headers: { host: "evil.example", "x-forwarded-host": "evil.example" } }));
    expect(await response.text()).not.toContain("evil.example");
    process.env.BOF_PUBLIC_SITE_URL = "https://bof-test.netlify.app";
    expect(referralOrigin()).toBe("https://bof-test.netlify.app");
    process.env.BOF_PUBLIC_SITE_URL = "https://bannersonthefly.com.evil.example";
    expect(referralOrigin()).toBe("https://bannersonthefly.com");
    process.env.BOF_PUBLIC_SITE_URL = "javascript:alert(1)";
    expect(referralOrigin()).toBe("https://bannersonthefly.com");
  });

  it("has a restrictive CSP that authorizes exactly the referral attribution script", async () => {
    const response = await call();
    const html = await response.text();
    const script = new JSDOM(html).window.document.querySelector("script").textContent;
    const hash = createHash("sha256").update(script).digest("base64");
    expect(response.headers.get("content-security-policy")).toContain(`script-src 'sha256-${hash}'`);
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'none'");
  });

  it("supports HEAD without a body and refuses mutation requests", async () => {
    const head = await call(request(`/refer/${CODE}`, { method: "HEAD" }));
    expect(head.status).toBe(200);
    expect(await head.text()).toBe("");
    query.mockClear();
    const post = await call(request(`/refer/${CODE}`, { method: "POST" }));
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD");
    expect(query).not.toHaveBeenCalled();
  });
});
