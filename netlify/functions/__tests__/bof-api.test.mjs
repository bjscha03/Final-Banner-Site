import { beforeEach, afterEach, it, expect, vi } from "vitest";
const query = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@neondatabase/serverless", () => ({ neon: () => query }));
import { handler } from "../bof-cash.mjs";
import auth from "../_shared/server-auth.cjs";
const event = (action, body = {}, extra = {}) => ({
  httpMethod: "POST",
  queryStringParameters: { action },
  headers: {
    host: "bannersonthefly.com",
    origin: "https://bannersonthefly.com",
  },
  body: JSON.stringify(body),
  ...extra,
});
const parse = (r) => JSON.parse(r.body);
beforeEach(() => {
  query.mockClear();
  process.env.DATABASE_URL = "test-only";
  process.env.AUTH_SESSION_SECRET = "test-secret-not-a-production-value";
  process.env.BOF_REFERRAL_ENABLED = "true";
  delete process.env.BOF_REFERRAL_LAUNCHED_AT;
  delete process.env.CONTEXT;
  delete process.env.DEPLOY_PRIME_URL;
});
afterEach(() => {
  delete process.env.DATABASE_URL;
  delete process.env.AUTH_SESSION_SECRET;
  delete process.env.BOF_REFERRAL_ENABLED;
});
it("does not consume an invitation on GET or an email-scanner visit", async () => {
  const response = await handler(event("claim", {}, { httpMethod: "GET" }));
  expect(response.statusCode).toBe(405);
  expect(query).not.toHaveBeenCalled();
});
it("rejects an unsigned wallet request, including forged user/admin body fields", async () => {
  const response = await handler(
    event("wallet", {
      userId: "11111111-1111-4111-8111-111111111111",
      is_admin: true,
    }),
  );
  expect(response.statusCode).toBe(401);
  expect(query).not.toHaveBeenCalled();
});
it("does not cast the site-admin session into a customer UUID", async () => {
  const token = auth.createSessionToken({ id: "server-admin", email: "", is_admin: true });
  const e = event("wallet");
  e.headers.authorization = "Bearer " + token;
  const response = await handler(e);
  expect(response.statusCode).toBe(409);
  expect(parse(response).error).toContain("customer account");
  expect(query).not.toHaveBeenCalled();
});
it("does not send an invitation before launch even for a real admin session", async () => {
  delete process.env.BOF_REFERRAL_ENABLED;
  const token = auth.createSessionToken({
    id: "11111111-1111-4111-8111-111111111111",
    email: "owner@customer.com",
    is_admin: true,
  });
  const e = event("send-invitations", {
    emails: ["buyer@customer.com"],
    confirm: true,
  });
  e.headers.authorization = "Bearer " + token;
  const response = await handler(e);
  expect(response.statusCode).toBe(409);
  expect(query).not.toHaveBeenCalled();
});
it("rejects cross-origin account and credit mutations", async () => {
  const e = event("claim", { token: "a" });
  e.headers.origin = "https://untrusted.test";
  expect((await handler(e)).statusCode).toBe(403);
  expect(query).not.toHaveBeenCalled();
});
it("prevents preview admin cookies from issuing real credits or account sessions", async () => {
  const e = event("claim", { token: "a" });
  e.headers = {
    host: "deploy-preview-999--bof.netlify.app",
    cookie: "botf_preview_admin=1",
  };
  expect((await handler(e)).statusCode).toBe(409);
  expect(query).not.toHaveBeenCalled();
});
it("shows an inactive status without needing a database connection", async () => {
  delete process.env.DATABASE_URL;
  delete process.env.BOF_REFERRAL_ENABLED;
  const result = await handler(event("status"));
  expect(parse(result)).toMatchObject({
    enabled: false,
    acceptingOffers: false,
  });
  expect(query).not.toHaveBeenCalled();
});
