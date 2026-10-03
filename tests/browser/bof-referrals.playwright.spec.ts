import { test, expect, Page } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const invitationEmail =
  require("../../netlify/functions/_shared/bof-email.cjs").content();
const user = {
  id: "8f511111-1111-4111-8111-111111111111",
  email: "member@customer.com",
  full_name: "Alex Member",
  is_admin: false,
};
// This is only a browser identity fixture. Every protected API is intercepted;
// the deliberately fake signature cannot authenticate against a real server.
const browserSession = (admin = false) =>
  `${Buffer.from(JSON.stringify({ sub: user.id, email: user.email, admin, exp: 4102444800 })).toString("base64url")}.test-signature`;
const sessionToken = browserSession();
const wallet = {
  joined: true,
  code: "BOFREF-ABCDEF123456",
  availableCents: 2500,
  pendingCents: 1000,
  reservedCents: 0,
  entries: [],
  reservations: [],
};
const item = {
  id: "bof-banner",
  product_type: "banner",
  width_in: 60,
  height_in: 48,
  quantity: 1,
  material: "13oz",
  grommets: "none",
  pole_pockets: "none",
  rope_feet: 0,
  area_sqft: 20,
  unit_price_cents: 10000,
  rope_cost_cents: 0,
  pole_pocket_cost_cents: 0,
  line_total_cents: 10000,
  created_at: "2026-10-02T12:00:00Z",
};
const order = {
  id: "11111111-1111-4111-8111-111111111111",
  order_number: "BOF-TEST-123",
  email: user.email,
  customer_name: "Alex Member",
  status: "paid",
  total_cents: 10600,
  subtotal_cents: 10000,
  created_at: "2026-10-02T12:00:00Z",
  items: [item],
  bof_member: true,
};
async function signIn(page: Page, admin = false) {
  await page.addInitScript(
    ({ u, i, token }) => {
      localStorage.setItem("banners_current_user", JSON.stringify(u));
      localStorage.setItem("cart_owner_user_id", u.id);
      localStorage.setItem("banners_server_session", token);
      localStorage.setItem(
        "cart-storage",
        JSON.stringify({
          state: { items: [i], _cartOwnerId: u.id },
          version: 0,
        }),
      );
    },
    { u: { ...user, is_admin: admin }, i: item, token: browserSession(admin) },
  );
}
async function mock(
  page: Page,
  { expired = false, enabled = true, joined = true, availableCents = 2500 } = {},
) {
  const calls: string[] = [];
  await page.route("**/*", async (route) => {
    const request = route.request(),
      url = new URL(request.url());
    if (url.pathname.startsWith("/.netlify/functions/")) {
      const action = url.searchParams.get("action") || "",
        input = request.method() === "POST" ? request.postDataJSON() || {} : {};
      let body: unknown = { success: true };
      let status = 200;
      if (url.pathname.endsWith("/bof-cash")) {
        calls.push(action);
        if (action === "status") body = { enabled };
        if (action === "wallet") body = { ...wallet, joined, availableCents };
        if (action === "join" || (action === "claim" && !expired))
          joined = true;
        if (action === "claim") {
          body = expired
            ? {
                error:
                  "This link has expired or was already used. Request a new one below.",
              }
            : { user, sessionToken };
          status = expired ? 410 : 200;
        }
        if (action === "request-link")
          body = {
            message:
              "If this email belongs to a BOF customer, a secure sign-in link is on its way.",
          };
        if (action === "quote")
          body = {
            availableCents: 2500,
            usableCents: 2500,
            message: "Use BOF Cash instead of your current promotion.",
            discount: {
              id: "quote",
              code: "BOFCASH-0123456789ABCDEF0123456789ABCDEF",
              discountPercentage: 0,
              discountAmountCents: 2500,
              expiresAt: "2099-01-01",
              discountScope: "order",
            },
          };
        if (action === "admin")
          body = {
            enabled,
            schemaReady: true,
            summary: {
              referred_orders: 2,
              net_sales_cents: 15000,
              contribution_cents: 5000,
              rewards_cents: 1000,
            },
            customers: [
              {
                email: "member@customer.com",
                name: "Alex Member",
                member_code: "ABCDEF123456",
                orders: 2,
                invitation_status: "sent",
              },
              {
                email: "invited@customer.com",
                name: "Taylor Invited",
                member_code: null,
                orders: 1,
                invitation_status: "sent",
              },
              {
                email: "new@customer.com",
                name: "Casey New",
                member_code: null,
                orders: 1,
                invitation_status: null,
              },
            ],
          };
        if (action === "admin-preview")
          body = {
            email: invitationEmail,
          };
        if (action === "send-invitations")
          throw new Error("Browser checks must not send invitations");
      } else if (url.pathname.endsWith("/admin-customers")) {
        body = {
          ok: true,
          customers: [
            {
              email: user.email,
              fullName: "Alex Member",
              firstName: "Alex",
              lastName: "Member",
              completedOrderCount: 1,
              lifetimeRevenueCents: 10600,
              firstOrderAt: order.created_at,
              lastOrderAt: order.created_at,
              periodOrderCount: 1,
              periodRevenueCents: 10600,
              segment: "first_time",
              isLapsed: false,
              marketingEligible: true,
              suppressionReasons: [],
              suppressionReason: "",
              septemberDealStatus: "not_sent",
              bof_member: true,
            },
          ],
        };
      } else if (url.pathname.endsWith("/get-orders")) {
        body = {
          orders: [order],
          pagination: {
            page: 1,
            pageSize: 20,
            totalItems: 1,
            totalPages: 1,
            hasPrevious: false,
            hasNext: false,
          },
          metrics: {
            netProfitCents: 3000,
            totalOrders: 1,
            grossSalesCents: 10000,
            averageOrderValueCents: 10000,
            recordedRefundsCents: 0,
            netSalesCents: 10000,
            newCustomers: 1,
            repeatCustomers: 0,
            repeatRate: 0,
            identifiedCustomers: 1,
          },
          overview: {},
        };
      } else if (url.pathname.endsWith("/get-order")) body = { order };
      else if (url.pathname.endsWith("/get-credit-purchases")) body = [];
      else if (url.pathname.endsWith("/validate-discount-code"))
        body = { valid: false, error: "Returning customer" };
      else if (url.pathname.endsWith("/cart-load"))
        body = { cartData: url.searchParams.has("userId") ? [item] : [] };
      else if (/\/(stripe|paypal)-config$/.test(url.pathname))
        body = { enabled: false };
      if (
        /\/(create-order|stripe-create-payment-intent|paypal-create-order)$/.test(
          url.pathname,
        )
      )
        throw new Error("Browser checks must not make payments");
      await route.fulfill({
        status,
        contentType: "application/json",
        body: JSON.stringify(body),
      });
    } else if (
      url.hostname === "bannersonthefly.com" &&
      [
        "/images/header-logo.png",
        "/images/email/september-grand-opening-banner.jpg",
      ].includes(url.pathname)
    ) {
      await route.fulfill({ path: `public${url.pathname}` });
    } else if (
      !["localhost", "127.0.0.1"].includes(url.hostname) &&
      !["blob:", "data:"].includes(url.protocol)
    )
      await route.abort();
    else await route.continue();
  });
  return calls;
}
test("a guest activates with one click; loading the email link never consumes it", async ({
  page,
}, info) => {
  const calls = await mock(page);
  await page.goto(
    "/bof-cash?share=facebook#claim=11111111-1111-4111-8111-111111111111." +
      "a".repeat(64),
  );
  await expect(
    page.getByRole("button", { name: "Activate BOF Cash & Start Sharing" }),
  ).toBeVisible();
  expect(calls).not.toContain("claim");
  expect(new URL(page.url()).hash).toBe("");
  await page
    .getByRole("button", { name: "Activate BOF Cash & Start Sharing" })
    .click();
  await expect(
    page.getByRole("region", { name: "BOF Cash balance" }),
  ).toContainText("$25.00");
  await expect(page.getByLabel("Your referral link")).toHaveValue(
    "https://bannersonthefly.com/refer/BOFREF-ABCDEF123456",
  );
  await expect(
    page.getByRole("button", { name: "Copy link", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await page.screenshot({
    path: info.outputPath("bof-wallet.png"),
    fullPage: true,
  });
});
test("an expired invitation offers a fresh sign-in link", async ({ page }) => {
  await mock(page, { expired: true });
  await page.goto(
    "/bof-cash#claim=11111111-1111-4111-8111-111111111111." + "b".repeat(64),
  );
  await page
    .getByRole("button", { name: "Activate BOF Cash & Start Sharing" })
    .click();
  await expect(page.getByRole("alert")).toContainText("expired");
  await page.getByLabel("Need a fresh link?").fill("guest@customer.com");
  await page.getByRole("button", { name: "Email me a secure link" }).click();
  await expect(page.getByRole("status")).toContainText("secure sign-in link");
});
test("guest activation opens past orders and older orders load without losing history after a retry", async ({
  page,
}) => {
  await mock(page);
  // A reserved, fully intercepted origin exercises the production order adapter.
  // localhost deliberately selects the app's unrelated demo-order storage.
  const historyOrigin = "https://bof-browser-history.test";
  await page.route(`${historyOrigin}/**`, async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith("/.netlify/functions/"))
      return route.fallback();
    const response = await route.fetch({
      url: `http://127.0.0.1:4175${url.pathname}${url.search}`,
    });
    await route.fulfill({ response });
  });
  const history = Array.from({ length: 25 }, (_, index) => ({
    ...order,
    id: `11111111-1111-4111-8111-1111${String(index + 1).padStart(8, "0")}`,
    order_number: `BOF-HISTORY-${index + 1}`,
  }));
  const requestedPages: string[] = [];
  let failedSecondPage = false;
  await page.route("**/.netlify/functions/get-orders?**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    expect(url.searchParams.get("user_id")).toBe(user.id);
    expect(request.headers().authorization).toBe(`Bearer ${sessionToken}`);
    const requestedPage = url.searchParams.get("page") || "1";
    requestedPages.push(requestedPage);
    if (requestedPage === "2" && !failedSecondPage) {
      failedSecondPage = true;
      return route.fulfill({
        status: 503,
        json: { error: "Order history temporarily unavailable" },
      });
    }
    await route.fulfill({
      json: requestedPage === "1" ? history.slice(0, 20) : history.slice(20),
    });
  });
  await page.goto(
    `${historyOrigin}/bof-cash#claim=11111111-1111-4111-8111-111111111111.` +
      "c".repeat(64),
  );
  await page
    .getByRole("button", { name: "Activate BOF Cash & Start Sharing" })
    .click();
  await expect(
    page.getByRole("region", { name: "Share BOF and earn rewards" }),
  ).toBeVisible();
  await page.goto(`${historyOrigin}/my-orders`);
  await expect(
    page.getByText(
      "Your past orders using this verified email appear here, including guest checkouts.",
    ),
  ).toBeVisible();
  await expect(page.getByText("Orders shown").locator("..")).toContainText(
    "20",
  );
  await expect(
    page.getByText("#00000020", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(page.getByText("#00000025", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Load more orders" }).click();
  await expect(page.getByRole("alert")).toContainText(
    "Your order history could not be loaded. Please try again.",
  );
  await expect(
    page.getByText("#00000020", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.getByText("Total Orders").locator("..")).toContainText(
    "25",
  );
  await expect(
    page.getByText("#00000001", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByText("#00000025", { exact: true }).filter({ visible: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Load more orders" }),
  ).toHaveCount(0);
  await expect(page.getByRole("alert")).toHaveCount(0);
  expect(requestedPages).toEqual(["1", "2", "2"]);
});
for (const scenario of ["guest", "new-account", "empty-wallet", "pending-only"] as const) {
  test(`checkout hides BOF Cash for ${scenario}`, async ({ page }) => {
    if (scenario === "guest") {
      await page.addInitScript((i) => {
        localStorage.setItem("cart-storage", JSON.stringify({ state: { items: [i] }, version: 0 }));
      }, item);
    } else {
      await signIn(page);
    }
    const calls = await mock(page, { joined: scenario !== "new-account", availableCents: 0 });
    await page.goto("/checkout");
    await expect(page.getByTestId("checkout-order-totals").first()).toBeVisible();
    await expect.poll(() => calls.includes(scenario === "guest" ? "status" : "wallet")).toBe(true);
    await expect(page.getByRole("region", { name: "BOF Cash at checkout" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Check my BOF Cash" })).toHaveCount(0);
    expect(calls).not.toContain("quote");
    if (scenario === "guest") expect(calls).not.toContain("wallet");
  });
}

test("site navigation is present across routes except the Google Ads landing page", async ({ page }, info) => {
  await mock(page);
  const mobile = info.project.name.includes("portrait");
  for (const path of ["/design", "/design?product=yard-sign", "/double-sided-banners", "/large-banners-fast", "/fall-festival-banners", "/bof-cash-test", "/canva-test", "/design/canva-editor", "/pdf-diagnostic", "/missing-page"]) {
    await page.goto(path);
    if (mobile) {
      await page.getByRole("button", { name: "Open navigation menu" }).click();
      await expect(page.getByRole("navigation", { name: "Mobile navigation" })).toBeVisible();
      await page.getByRole("button", { name: "Close navigation menu" }).click();
    } else {
      await expect(page.getByRole("navigation", { name: "Primary navigation" })).toBeVisible();
    }
  }
  await page.goto("/google-ads-banner");
  await expect(page.getByRole("button", { name: "Shopping cart", exact: true })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Primary navigation" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open navigation menu" })).toHaveCount(0);
});

test("checkout shows usable credit, applies it once, and restores totals on removal", async ({
  page,
}) => {
  await signIn(page);
  await mock(page);
  await page.goto("/checkout");
  const box = page.getByRole("region", { name: "BOF Cash at checkout" });
  await box.getByRole("button", { name: "Check my BOF Cash" }).click();
  await expect(box).toContainText("$25.00 usable");
  await box.getByRole("button", { name: "Use $25.00 BOF Cash" }).click();
  await expect(box).toContainText("BOF Cash applied.");
  await expect(page.getByTestId("checkout-order-totals").first()).toContainText(
    "$79.50",
  );
  await box.getByRole("button", { name: "Remove BOF Cash" }).click();
  await expect(page.getByTestId("checkout-order-totals").first()).toContainText(
    "$106.00",
  );
});
test("admin distinguishes a joined member from an invitation and requires an email preview", async ({
  page,
}, info) => {
  await signIn(page, true);
  const calls = await mock(page);
  await page.goto("/admin/referrals");
  const joined = page.locator("li").filter({ hasText: "Alex Member" });
  await expect(joined.getByLabel("BOF Cash member")).toBeVisible();
  await expect(joined.getByRole("checkbox")).toBeDisabled();
  await expect(
    page.locator("li").filter({ hasText: "Taylor Invited" }),
  ).toContainText("Invited");
  await expect(
    page
      .locator("li")
      .filter({ hasText: "Taylor Invited" })
      .getByLabel("BOF Cash member"),
  ).toHaveCount(0);
  await page.getByRole("checkbox", { name: "Invite new@customer.com" }).check();
  await page
    .getByRole("button", { name: "Preview 1 invitation", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("new@customer.com");
  expect(calls).not.toContain("send-invitations");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const emailFrame = page.frameLocator(
    'iframe[title="BOF Cash invitation preview"]',
  );
  const activationLink = emailFrame.getByRole("link", {
    name: /Activate BOF Cash & Start Sharing/,
  });
  await expect(emailFrame.getByAltText("Banners On The Fly")).toBeVisible();
  await expect
    .poll(() =>
      emailFrame
        .getByAltText("Banners On The Fly")
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect
    .poll(() =>
      emailFrame
        .getByAltText(/A colorful grand-opening/)
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(activationLink).toHaveCount(1);
  await expect(
    emailFrame.getByText("Choose Facebook, text, or email", { exact: true }),
  ).toBeVisible();
  await expect(emailFrame.locator("body")).toContainText(
    "Your past orders under this email will appear in your account automatically, including guest orders.",
  );
  for (const name of ["Share on Facebook", "Text a friend", "Email a friend"])
    await expect(emailFrame.getByRole("link", { name })).toHaveCount(0);
  await expect(activationLink).toHaveAttribute("aria-disabled", "true");
  await expect(activationLink).not.toHaveAttribute("href");
  await activationLink.dispatchEvent("click");
  await expect(
    emailFrame.getByRole("heading", { name: "Share BOF. Earn BOF Cash." }),
  ).toBeVisible();
  expect(calls).not.toContain("claim");
  const email = page.locator('iframe[title="BOF Cash invitation preview"]');
  await email.screenshot({
    path: info.outputPath("bof-invitation-email-desktop.png"),
    style: "header { visibility: hidden !important; }",
  });
  await page.getByRole("button", { name: "Mobile", exact: true }).click();
  await expect
    .poll(async () => (await email.boundingBox())?.width)
    .toBeLessThanOrEqual(375);
  await expect
    .poll(() =>
      emailFrame
        .locator("body")
        .evaluate((el) => el.scrollWidth <= el.clientWidth),
    )
    .toBe(true);
  await email.screenshot({
    path: info.outputPath("bof-invitation-email-mobile.png"),
    style: "header { visibility: hidden !important; }",
  });
  await page.getByRole("button", { name: "Desktop", exact: true }).click();
  await page
    .getByRole("button", { name: "See customer sharing", exact: true })
    .first()
    .click();
  const previewDialog = page.getByRole("dialog");
  await expect(previewDialog).toContainText(
    "What customers see after activation",
  );
  await expect(
    previewDialog.getByRole("link", { name: "Share on Facebook" }),
  ).not.toHaveAttribute("href");
  await previewDialog
    .getByRole("button", { name: "Copy link", exact: true })
    .click();
  await expect(previewDialog.getByRole("status")).toContainText(
    "This is a preview",
  );
  await previewDialog.screenshot({
    path: info.outputPath("bof-customer-sharing-preview.png"),
  });
  await page.getByRole("button", { name: "Close sharing preview" }).click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({
    path: info.outputPath("bof-admin.png"),
    fullPage: true,
  });
});
test("the inactive launch switch hides invitations and rewards", async ({
  page,
}) => {
  await mock(page, { enabled: false });
  await page.goto("/bof-cash");
  await expect(
    page.getByRole("heading", { name: "Coming soon" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Email me a secure link" }),
  ).toHaveCount(0);
});
for (const route of ["/admin/customers", "/admin/orders"]) {
  test(`joined customers have a star beside their name on ${route}`, async ({
    page,
  }) => {
    await signIn(page, true);
    await mock(page);
    await page.goto(route);
    const star = page
      .getByLabel("BOF Cash member")
      .filter({ visible: true })
      .first();
    await expect(star).toBeVisible();
    await expect(star.locator("..")).toContainText("Alex Member");
  });
}

test("sharing uses the public referral link across Facebook, text, email, and copy controls", async ({
  page,
}, info) => {
  await signIn(page);
  await mock(page);
  await page.addInitScript(() => {
    (window as any).sharedValues = [];
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (value: string) => {
          (window as any).sharedValues.push(value);
        },
      },
    });
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async (value: unknown) => {
        (window as any).nativeShare = value;
      },
    });
  });
  await page.goto("/bof-cash?share=facebook");
  const sharing = page.getByRole("region", {
    name: "Share BOF and earn rewards",
  });
  const link = "https://bannersonthefly.com/refer/BOFREF-ABCDEF123456";
  const facebook = new URL(
    (await sharing
      .getByRole("link", { name: "Share on Facebook" })
      .getAttribute("href"))!,
  );
  expect(facebook.hostname).toBe("www.facebook.com");
  expect(facebook.searchParams.get("u")).toBe(link);
  for (const label of ["Text a friend", "Email a friend"]) {
    const href = (await sharing
      .getByRole("link", { name: label })
      .getAttribute("href"))!;
    expect(decodeURIComponent(href)).toContain(link);
    expect(decodeURIComponent(href)).toContain(
      "I earn BOF Cash on qualifying referrals, too.",
    );
    expect(href).not.toContain("claim");
  }
  for (const name of ["Copy link", "Copy code", "Copy message"])
    await sharing.getByRole("button", { name, exact: true }).click();
  const copied = await page.evaluate(() => (window as any).sharedValues);
  expect(copied[0]).toBe(link);
  expect(copied[1]).toBe("BOFREF-ABCDEF123456");
  expect(copied[2]).toContain(link);
  expect(copied[2]).toContain("qualifying");
  expect(
    await sharing
      .getByLabel("Your ready-to-send message")
      .evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
  ).toBe(true);
  await sharing.getByRole("button", { name: "More sharing options" }).click();
  expect(await page.evaluate(() => (window as any).nativeShare.url)).toBe(link);
  expect(
    await sharing.evaluate((el) =>
      Boolean(
        el.compareDocumentPosition(
          document.querySelector('[aria-label="BOF Cash balance"]')!,
        ) & Node.DOCUMENT_POSITION_FOLLOWING,
      ),
    ),
  ).toBe(true);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - innerWidth,
    ),
  ).toBeLessThanOrEqual(1);
  await sharing.screenshot({
    path: info.outputPath("bof-sharing-tools.png"),
    style: "header { visibility: hidden !important; }",
  });
});

test("a signed-in customer finds BOF Cash in their account and joins without re-entering an email", async ({
  page,
}, info) => {
  await signIn(page);
  const calls = await mock(page, { joined: false });
  await page.goto("/my-orders");
  const card = page.getByRole("region", { name: "Your BOF Cash" });
  await expect(
    card.getByRole("link", { name: "Get my referral link" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "BOF Cash", exact: true }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "BOF Cash", exact: true }).click();
  await expect(page.getByLabel("Order email address")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Activate BOF Cash & Start Sharing" })
    .click();
  expect(calls).toContain("join");
  await expect(
    page.getByRole("region", { name: "Share BOF and earn rewards" }),
  ).toBeVisible();
  await page.goto("/my-orders");
  await expect(card).toContainText("$25.00 available");
  await expect(
    card.getByRole("link", { name: "Share & view my wallet" }),
  ).toBeVisible();
  await card.screenshot({
    path: info.outputPath("bof-account-card.png"),
    style: "header { visibility: hidden !important; }",
  });
});

test("the account keeps BOF Cash discoverable before launch without activating rewards", async ({
  page,
}) => {
  await signIn(page);
  const calls = await mock(page, { enabled: false });
  await page.goto("/my-orders");
  const card = page.getByRole("region", { name: "Your BOF Cash" });
  await expect(card).toContainText("Referral rewards are coming soon");
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await expect(
    page.getByRole("menuitem", { name: "BOF Cash", exact: true }),
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "BOF Cash", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Coming soon" }),
  ).toBeVisible();
  expect(calls).not.toContain("wallet");
  expect(calls).not.toContain("join");
});

for (const duringLoad of [false, true]) {
  test(`signing out clears the prior customer's wallet${duringLoad ? " even while it is loading" : " and sharing tools"}`, async ({
    page,
  }) => {
    await signIn(page);
    await mock(page);
    let releaseWallet: (() => void) | undefined;
    let notifyWalletRequest: (() => void) | undefined;
    const walletRequested = new Promise<void>((resolve) => {
      notifyWalletRequest = resolve;
    });
    if (duringLoad)
      await page.route(
        "**/.netlify/functions/bof-cash?action=wallet",
        async (route) => {
          notifyWalletRequest?.();
          await new Promise<void>((resolve) => {
            releaseWallet = resolve;
          });
          await route.fulfill({ json: wallet });
        },
      );
    await page.goto("/bof-cash");
    if (duringLoad) await walletRequested;
    else
      await expect(
        page.getByRole("region", { name: "BOF Cash balance" }),
      ).toContainText("$25.00");
    await page.evaluate(() => {
      localStorage.removeItem("banners_current_user");
      localStorage.removeItem("banners_server_session");
      sessionStorage.removeItem("banners_server_session");
      window.dispatchEvent(new Event("user-changed"));
    });
    await expect(page.getByLabel("Order email address")).toBeVisible();
    if (duringLoad) {
      const response = page.waitForResponse(
        (result) =>
          new URL(result.url()).searchParams.get("action") === "wallet",
      );
      releaseWallet?.();
      await (await response).finished();
      await page.evaluate(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      );
    }
    await expect(
      page.getByRole("region", { name: "BOF Cash balance" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Share BOF and earn rewards" }),
    ).toHaveCount(0);
    await expect(page.getByLabel("Your referral link")).toHaveCount(0);
  });
}

test("an expired account session clears the wallet and offers a new secure sign-in link", async ({
  page,
}) => {
  await signIn(page);
  const calls = await mock(page);
  await page.route(
    "**/.netlify/functions/bof-cash?action=wallet",
    async (route) => {
      await route.fulfill({
        status: 401,
        json: { error: "Verified sign-in required" },
      });
    },
  );
  await page.goto("/bof-cash");
  await expect(page.getByRole("alert")).toContainText(
    "Your sign-in has expired. Request a fresh secure link below.",
  );
  await expect(
    page.getByRole("region", { name: "BOF Cash balance" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("region", { name: "Share BOF and earn rewards" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("banners_current_user")),
  ).toBeNull();
  expect(
    await page.evaluate(() => localStorage.getItem("banners_server_session")),
  ).toBeNull();
  await page.getByLabel("Order email address").fill(user.email);
  await page.getByRole("button", { name: "Email me a secure link" }).click();
  await expect(page.getByRole("status")).toContainText("secure sign-in link");
  expect(calls).toContain("request-link");
});

test("a friend opens a shared link and keeps the referral when shopping as a guest", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/refer/BOFREF-ABCDEF123456");
  await expect(
    page.getByRole("heading", {
      name: "Save up to $25 on a qualifying first order",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("You can check out as a guest.", { exact: false }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Shop with this referral" }).click();
  await expect(page).toHaveURL(/\/$/);
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("bof_referral_v1")!),
  );
  expect(saved.code).toBe("BOFREF-ABCDEF123456");
  expect(saved.expires).toBeGreaterThan(Date.now());
});
