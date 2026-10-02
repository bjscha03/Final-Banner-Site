import { afterEach, describe, expect, it, vi } from "vitest";
import email from "../_shared/bof-email.cjs";

afterEach(() => vi.unstubAllEnvs());

describe("BOF activation email contract", () => {
  it("sends an unjoined customer to secure activation before exposing sharing actions", () => {
    const link = "https://bannersonthefly.com/bof-cash#claim=example.secure-token";
    const result = email.content({ link });
    expect(result.html).toContain('href="' + link + '"');
    expect(result.html).toContain("Activate BOF Cash &amp; Start Sharing");
    expect(result.html).not.toMatch(/facebook\.com|sms:|mailto:|share=facebook|share=text|share=email/);
    expect(result.text).toContain("including guest orders");
    expect(result.text).toContain("No photos, reviews, or public posts required");
    expect(result.html).toContain("/images/header-logo.png");
    expect(result.html).toContain("/images/email/september-grand-opening-banner.jpg");
  });

  it("uses one configured origin for activation, branding, and full terms", async () => {
    vi.stubEnv("BOF_PUBLIC_SITE_URL", "https://bof-isolated-test.netlify.app/");
    vi.stubEnv("AUTH_SESSION_SECRET", "isolated-test-secret");
    const sql = vi.fn(async () => []);
    const link = await email.invitation(sql, "guest@example.com", {
      id: "00000000-0000-4000-8000-000000000001",
    });
    expect(link).toMatch(/^https:\/\/bof-isolated-test\.netlify\.app\/bof-cash#claim=/);
    expect(link).not.toContain("guest@example.com");
    const result = email.content({ link });
    expect(result.html).toContain("https://bof-isolated-test.netlify.app/images/header-logo.png");
    expect(result.text).toContain("https://bof-isolated-test.netlify.app/bof-cash#terms");
    expect(result.html).not.toContain("https://bannersonthefly.com");
    expect(sql.mock.calls[0][3]).not.toContain(link.split("#claim=")[1]);
  });

  it.each([
    "http://insecure.example.com",
    "https://name:secret@example.com",
    "https://example.com/another-path",
    "https://example.com/?next=elsewhere",
    "https://example.com/#fragment",
  ])("rejects an unsafe configured account origin: %s", (value) => {
    vi.stubEnv("BOF_PUBLIC_SITE_URL", value);
    expect(() => email.content()).toThrow("must be an HTTPS origin");
  });

  it("escapes account URLs in HTML without damaging plain-text access links", () => {
    const link = 'https://bannersonthefly.com/bof-cash?x="quoted"&y=1#claim=token';
    const result = email.content({ link, access: true });
    expect(result.html).toContain('x=&quot;quoted&quot;&amp;y=1#claim=token');
    expect(result.text).toContain(link);
    expect(result.text).toContain("expires in 15 minutes and works once");
    expect(result.html).not.toContain("Unsubscribe from marketing emails");
  });
});
