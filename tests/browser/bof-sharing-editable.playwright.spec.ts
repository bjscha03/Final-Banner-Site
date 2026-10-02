import { test, expect } from "@playwright/test";

test("referral drafts are ready to send and preserve customer edits in text, email and native sharing", async ({
  page,
}, info) => {
  const code = "BOFREF-ABCDEF123456";
  const link = `https://bannersonthefly.com/refer/${code}`;
  // Deliberately unsigned browser fixture; all protected requests are mocked.
  const sessionToken = `${Buffer.from(JSON.stringify({ sub: "8f511111-1111-4111-8111-111111111111", email: "member@customer.com", admin: false, exp: 4102444800 })).toString("base64url")}.test-signature`;
  await page.addInitScript((token) => {
    localStorage.setItem(
      "banners_current_user",
      JSON.stringify({
        id: "8f511111-1111-4111-8111-111111111111",
        email: "member@customer.com",
        full_name: "Alex Member",
        is_admin: false,
      }),
    );
    localStorage.setItem("banners_server_session", token);
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (value: unknown) => {
        (window as any).nativeShare = value;
      },
    });
  }, sessionToken);
  await page.route("**/.netlify/functions/**", async (route) => {
    const url = new URL(route.request().url());
    let body: unknown = { success: true };
    if (url.pathname.endsWith("/bof-cash")) {
      if (url.searchParams.get("action") === "status") body = { enabled: true };
      if (url.searchParams.get("action") === "wallet")
        body = {
          joined: true,
          code,
          availableCents: 2500,
          pendingCents: 1000,
          reservedCents: 0,
          entries: [],
          reservations: [],
        };
    }
    await route.fulfill({ json: body });
  });
  await page.goto("/bof-cash");
  const sharing = page.getByRole("region", {
    name: "Share BOF and earn rewards",
  });
  const draft = sharing.getByLabel("Your ready-to-send message");
  await expect(draft).toBeEditable();
  const initialMessage = await draft.inputValue();
  expect(initialMessage).toContain(code);
  expect(initialMessage).toContain(link);
  expect(initialMessage).toContain(
    "I earn BOF Cash on qualifying referrals, too.",
  );
  expect(initialMessage).not.toContain("I recently ordered");
  const facebook = new URL(
    (await sharing
      .getByRole("link", { name: "Share on Facebook" })
      .getAttribute("href"))!,
  );
  expect(facebook.hostname).toBe("www.facebook.com");
  expect(facebook.searchParams.get("u")).toBe(link);
  expect(facebook.searchParams.has("quote")).toBe(false);

  const editedMessage = `Hey Taylor! These could work for our fall event. Use my code ${code}:\n${link}\nI earn BOF Cash if you order.`;
  await draft.fill(editedMessage);
  await sharing.getByLabel("Email subject").fill("An idea for our fall event");
  for (const label of ["Text a friend", "Email a friend"]) {
    const href = (await sharing
      .getByRole("link", { name: label })
      .getAttribute("href"))!;
    expect(decodeURIComponent(href)).toContain(editedMessage);
    expect(href).not.toContain("claim");
    if (label === "Email a friend")
      expect(decodeURIComponent(href)).toContain(
        "subject=An idea for our fall event",
      );
    if (label === "Text a friend")
      expect(
        href.startsWith(
          info.project.name.startsWith("webkit-iphone")
            ? "sms:&body="
            : "sms:?body=",
        ),
      ).toBe(true);
  }
  await sharing.getByRole("button", { name: "More sharing options" }).click();
  const nativeShare = await page.evaluate(() => (window as any).nativeShare);
  expect(nativeShare.url).toBe(link);
  expect(nativeShare.text).toContain("Hey Taylor!");
  expect(nativeShare.text).toContain(code);
  expect(nativeShare.title).toBe("An idea for our fall event");
  await sharing.getByRole("button", { name: "Reset message" }).click();
  await expect(draft).toHaveValue(initialMessage);
  expect(
    await draft.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await sharing.screenshot({
    path: info.outputPath("bof-sharing-editable.png"),
    style: "header { visibility: hidden !important; }",
  });
});
