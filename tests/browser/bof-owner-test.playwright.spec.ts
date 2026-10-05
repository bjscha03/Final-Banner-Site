import { test, expect } from "@playwright/test";

test("owner test activates, carries its referral, simulates the wallet and leaves live account storage untouched", async ({ page }, info) => {
  const code = "BOFREF-ABCDEF123456";
  const livePerson = { id: "33333333-3333-4333-8333-333333333333", email: "live@example.test", is_admin: false };
  const liveAccount = JSON.stringify(livePerson);
  const liveToken = `${Buffer.from(JSON.stringify({ sub: livePerson.id, email: livePerson.email, admin: false, exp: 4102444800 })).toString("base64url")}.test-signature`;
  await page.addInitScript(({ liveAccount, liveToken }) => {
    localStorage.setItem("banners_current_user", liveAccount);
    localStorage.setItem("banners_server_session", liveToken);
    localStorage.setItem("bof_referral_v1", "existing-live-referral");
  }, { liveAccount, liveToken });
  let pending = 0, available = 0;
  const entries: Array<{ kind: string; amount_cents: number; created_at: string }> = [];
  await page.route("**/.netlify/functions/**", async route => {
    const url = new URL(route.request().url());
    if (!url.pathname.endsWith("/bof-cash-test")) return route.fulfill({ json: { success: true } });
    expect(route.request().method()).toBe("POST");
    const action = url.searchParams.get("action");
    if (action === "claim") return route.fulfill({ json: { isolatedTest: true, sessionToken: "signed-isolated-session" } });
    expect(route.request().headers().authorization).toBe("Bearer signed-isolated-session");
    if (action === "refer") {
      expect(route.request().postDataJSON().referralCode).toBe(code);
      pending = 1000;
      entries.push({ kind: "reward", amount_cents: 1000, created_at: "2026-10-02" });
    }
    if (action === "mature") { pending = 0; available = 1000; }
    if (action === "redeem") { available = 0; entries.push({ kind: "redemption", amount_cents: -1000, created_at: "2026-10-17" }); }
    return route.fulfill({ json: { isolatedTest: true, code, email: "b.schaefermarketer@outlook.com", availableCents: available, pendingCents: pending, reservedCents: 0, entries, pastOrders: [{ id: "11111111-1111-4111-8111-111111111111", status: "delivered", total_cents: 7500 }], message: action === "redeem" ? "Simulated checkout used test BOF Cash. No payment was made." : "Test wallet refreshed." } });
  });
  await page.goto("/bof-cash-test#claim=private-test-token");
  await page.getByRole("button", { name: "Activate test BOF Cash & start sharing" }).click();
  await expect(page.getByRole("heading", { name: "Test wallet", exact: true })).toBeVisible();
  expect(page.url()).not.toContain("claim=");
  const draft = page.getByLabel("Your ready-to-send message");
  await expect(draft).toHaveValue(/\[TEST — no real discount or reward\]/);
  expect(await draft.inputValue()).toContain(`/bof-cash-test/share/${code}`);
  const facebook = new URL((await page.getByRole("link", { name: "Share on Facebook" }).getAttribute("href"))!);
  expect(facebook.searchParams.get("u")).toContain(`/bof-cash-test/share/${code}`);
  await expect(page.getByRole("button", { name: "Simulate qualifying referral" })).toBeDisabled();
  await expect(page.getByText("Order 11111111 · delivered")).toBeVisible();
  await page.goto(`/bof-cash-test?ref=${code}#testing`);
  await expect(page.getByText("Your test referral code was carried back correctly.")).toBeVisible();
  await page.getByRole("button", { name: "Simulate qualifying referral" }).click();
  await expect(page.getByText("Simulated referral reward", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Advance 15 days" }).click();
  await page.getByRole("button", { name: "Use test BOF Cash" }).click();
  await expect(page.getByText("Simulated checkout redemption", { exact: true })).toBeVisible();
  await expect(page.getByText("Simulated checkout used test BOF Cash. No payment was made.")).toBeVisible();
  const stored = await page.evaluate(() => ["banners_current_user", "banners_server_session", "bof_referral_v1"].map(key => localStorage.getItem(key)));
  expect(stored).toEqual([liveAccount, liveToken, "existing-live-referral"]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await page.screenshot({ path: info.outputPath("bof-owner-test.png"), fullPage: true });
});
