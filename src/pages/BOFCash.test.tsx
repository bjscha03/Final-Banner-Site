// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { beforeEach, afterEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ user: null as any, request: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: state.user }) }));
vi.mock("@/lib/serverAuth", () => ({ setServerSessionToken: state.session }));
vi.mock("react-router-dom", () => ({ useParams: () => ({}), Link: ({ children }: any) => <span>{children}</span> }));
vi.mock("react-helmet-async", () => ({ Helmet: () => null }));
vi.mock("@/components/Layout", () => ({ default: ({ children }: any) => <>{children}</> }));
vi.mock("@/components/BOFCashTerms", () => ({ default: () => null }));
vi.mock("@/components/BOFReferralShare", () => ({ default: ({ code }: any) => <div>{code}</div> }));
vi.mock("@/lib/bofCash", () => ({
  bofRequest: state.request, bofMoney: (n: number) => `$${(n / 100).toFixed(2)}`, saveBofReferral: vi.fn(),
}));
import BOFCash from "./BOFCash";

const customer = { id: "11111111-1111-4111-8111-111111111111", email: "customer@example.test" };
const admin = { id: "server-admin", email: "", is_admin: true };
const wallet = { joined: true, code: "BOFREF-ABCDEF123456", availableCents: 500, pendingCents: 0, reservedCents: 0, entries: [] };
let container: HTMLDivElement, root: Root;
const render = async () => { await act(async () => { root.render(<BOFCash />); }); };
const invitation = () => window.history.replaceState(null, "", "/bof-cash#claim=11111111-1111-4111-8111-111111111111." + "a".repeat(64));
beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.user = null;
  state.session.mockReset();
  state.request.mockReset().mockImplementation(async (action: string) => {
    if (action === "status") return { enabled: true };
    if (action === "wallet") return wallet;
    throw new Error("Unexpected action: " + action);
  });
  window.history.replaceState(null, "", "/bof-cash");
  localStorage.clear();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

it.each([admin, customer])("waits for invitation activation before looking up the existing session's wallet: $id", async (person) => {
  state.user = person;
  invitation();
  await render();
  expect(state.request.mock.calls.map(([action]) => action)).toEqual(["status"]);
  expect(container.textContent).toContain("Activate your free BOF Cash account");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(window.location.hash).toBe("");
});

it("offers customer access to a site admin without clearing their admin session", async () => {
  state.user = admin;
  await render();
  expect(state.request.mock.calls.map(([action]) => action)).toEqual(["status"]);
  expect(container.textContent).toContain("Email me a secure link");
  expect(state.session).not.toHaveBeenCalled();
});

it("opens the activated customer's wallet after replacing an admin session", async () => {
  state.user = admin;
  invitation();
  state.request.mockImplementation(async (action: string) => {
    if (action === "status") return { enabled: true };
    if (action === "claim") { state.user = customer; return { user: customer, sessionToken: "test-customer-session" }; }
    if (action === "wallet") {
      if (state.user.id === "server-admin") throw new Error("BOF Cash is temporarily unavailable.");
      return wallet;
    }
    throw new Error("Unexpected action");
  });
  await render();
  const button = [...container.querySelectorAll("button")].find((b) => b.textContent?.includes("Activate BOF Cash & Start Sharing"));
  await act(async () => button!.click());
  expect(state.session).toHaveBeenCalledWith("test-customer-session");
  expect(container.querySelector('[aria-label="BOF Cash balance"]')?.textContent).toContain("$5.00");
  expect(container.textContent).toContain("BOFREF-ABCDEF123456");
  expect(container.querySelector('[role="alert"]')).toBeNull();
  expect(container.textContent).not.toContain("Activate your free BOF Cash account");
});

it("continues to load an ordinary signed-in customer's wallet", async () => {
  state.user = customer;
  await render();
  expect(state.request).toHaveBeenCalledWith("wallet");
  expect(container.querySelector('[aria-label="BOF Cash balance"]')?.textContent).toContain("$5.00");
});
