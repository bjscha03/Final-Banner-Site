from pathlib import Path


def replace_once(path_name, old, new, label):
    path = Path(path_name)
    text = path.read_text()
    if new in text and old not in text:
        print(label + ": already patched")
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(label + ": expected exactly one match, found " + str(count))
    path.write_text(text.replace(old, new, 1))
    print(label + ": patched")


replace_once(
    "src/pages/admin/AbandonedCarts.tsx",
    """      setCarts(Array.isArray(data.carts) ? data.carts : []);
      setServerAnalytics(data.analytics || null);""",
    """      const normalizedCarts = (Array.isArray(data.carts) ? data.carts : []).map((cart) => ({
        ...cart,
        item_summaries: Array.isArray(cart.item_summaries) ? cart.item_summaries : [],
        recovery_events: Array.isArray(cart.recovery_events) ? cart.recovery_events : [],
        recovery_deliveries: Array.isArray(cart.recovery_deliveries) ? cart.recovery_deliveries : [],
        recovery_offers: Array.isArray(cart.recovery_offers) ? cart.recovery_offers : [],
      }));
      setCarts(normalizedCarts);
      setServerAnalytics(data.analytics || null);""",
    "abandoned-cart response normalization",
)

replace_once(
    "tests/browser/admin-commerce-analytics.playwright.spec.ts",
    """  if (isMobile) {
    await page.getByRole('button', { name: /Alice Buyer/ }).click();
  } else {""",
    """  if (isMobile) {
    await page.getByRole('button', { name: 'View customer', exact: true }).first().click();
  } else {""",
    "mobile customer detail locator",
)
