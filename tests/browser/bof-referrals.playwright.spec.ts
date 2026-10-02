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
    ({ u, i }) => {
      localStorage.setItem("banners_current_user", JSON.stringify(u));
      localStorage.setItem("cart_owner_user_id", u.id);
      localStorage.setItem("banners_server_session", "test-signed-token");
      localStorage.setItem(
        "cart-storage",
        JSON.stringify({
          state: { items: [i], _cartOwnerId: u.id },
          version: 0,
        }),
      );
    },
    { u: { ...user, is_admin: admin }, i: item },
  );
}
async function mock(page: Page, { expired = false, enabled = true } = {}) {
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
        if (action === "wallet") body = wallet;
        if (action === "claim") {
          body = expired
            ? {
                error:
                  "This link has expired or was already used. Request a new one below.",
              }
            : { user, sessionToken: "test-signed-token" };
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
    "/bof-cash#claim=11111111-1111-4111-8111-111111111111." + "a".repeat(64),
  );
  await expect(
    page.getByRole("button", { name: "Activate and open my account" }),
  ).toBeVisible();
  expect(calls).not.toContain("claim");
  expect(new URL(page.url()).hash).toBe("");
  await page
    .getByRole("button", { name: "Activate and open my account" })
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
    .getByRole("button", { name: "Activate and open my account" })
    .click();
  await expect(page.getByRole("alert")).toContainText("expired");
  await page.getByLabel("Need a fresh link?").fill("guest@customer.com");
  await page.getByRole("button", { name: "Email me a secure link" }).click();
  await expect(page.getByRole("status")).toContainText("secure sign-in link");
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
    name: /Activate my BOF Cash/,
  });
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
