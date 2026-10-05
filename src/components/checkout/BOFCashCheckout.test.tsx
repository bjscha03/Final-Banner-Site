// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  user: null as { id: string; email: string } | null,
  request: vi.fn(),
  cart: {
    items: [
      {
        id: "banner",
        product_type: "banner",
        width_in: 72,
        height_in: 36,
        quantity: 1,
        material: "13oz",
      },
    ],
    discountCode: null,
    applyDiscountCode: vi.fn(),
    removeDiscountCode: vi.fn(),
    getResolvedDiscount: () => ({ appliedDiscountAmountCents: 0 }),
    sameDayHitService: false,
    saturdayDelivery: false,
  },
}));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/store/cart", () => ({ useCartStore: () => state.cart }));
vi.mock("@/lib/bofCash", () => ({
  bofRequest: state.request,
  bofPricingItems: (items: unknown) => items,
  bofMoney: (n: number) => `$${(n / 100).toFixed(2)}`,
  readBofReferral: () => null,
  saveBofReferral: vi.fn(),
}));
vi.mock("@/lib/serverAuth", () => ({
  authorizedHeaders: (headers: unknown) => headers,
}));
vi.mock("@/components/ui/button", () => ({
  Button: ({ children, ...props }: any) => (
    <button {...props}>{children}</button>
  ),
}));
import BOFCashCheckout from "./BOFCashCheckout";
let container: HTMLDivElement, root: Root;
beforeEach(() => {
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  state.user = null;
  state.request.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
const render = async () => {
  await act(async () => {
    root.render(<BOFCashCheckout />);
  });
};
const box = () =>
  container.querySelector('[aria-label="BOF Cash at checkout"]');
describe("checkout credit visibility", () => {
  it("hides rewards from guests and does not request their wallet", async () => {
    state.request.mockResolvedValue({ enabled: true });
    await render();
    expect(box()).toBeNull();
    expect(state.request.mock.calls.map((c) => c[0])).toEqual(["status"]);
  });
  for (const [name, joined, availableCents, pendingCents] of [
    ["first-time account", false, 0, 0],
    ["empty member", true, 0, 0],
    ["pending-only member", true, 0, 1000],
  ] as const)
    it(`hides rewards for a ${name}`, async () => {
      state.user = { id: "one", email: "one@example.com" };
      state.request.mockImplementation(async (action: string) =>
        action === "status"
          ? { enabled: true }
          : { joined, availableCents, pendingCents },
      );
      await render();
      expect(box()).toBeNull();
      expect(state.request).toHaveBeenCalledWith("wallet");
    });
  it("offers redemption to a member with available credit", async () => {
    state.user = { id: "one", email: "one@example.com" };
    state.request.mockImplementation(async (action: string) =>
      action === "status"
        ? { enabled: true }
        : { joined: true, availableCents: 1000 },
    );
    await render();
    expect(box()?.textContent).toContain("Check my BOF Cash");
  });
  it("hides a prior wallet immediately on account switch and ignores a late response", async () => {
    state.user = { id: "one", email: "one@example.com" };
    let resolveWallet: (value: unknown) => void = () => {};
    state.request.mockImplementation((action: string) =>
      action === "status"
        ? Promise.resolve({ enabled: true })
        : new Promise((resolve) => {
            resolveWallet = resolve;
          }),
    );
    await render();
    state.user = null;
    await render();
    await act(async () =>
      resolveWallet({ joined: true, availableCents: 1000 }),
    );
    expect(box()).toBeNull();
  });
});
