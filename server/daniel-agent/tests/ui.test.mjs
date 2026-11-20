import test from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { html } from "../web/page.mjs";
const data = {
  accounts: [],
  contacts: [],
  opportunities: [],
  messages: [],
  tasks: [],
  approvals: [],
  suppressions: [],
  events: [],
  meetings: [],
  reports: [],
  runs: [],
  settings: { paused: false },
  mailbox: null,
  deliveries: [],
  limits: [],
  config: {
    aiConfigured: true,
    oauthRedirect: "https://preview.test/api/daniel/oauth/callback",
    liveEmailEnabled: false,
  },
};
function mount(signed = true, respond) {
  const calls = [],
    errors = [];
  const dom = new JSDOM(html(signed), {
    url: "https://preview.test/daniel",
    runScripts: "dangerously",
    beforeParse(w) {
      w.HTMLDialogElement.prototype.showModal = function () {
        this.open = true;
      };
      w.HTMLDialogElement.prototype.close = function () {
        this.open = false;
      };
      w.fetch = async (url, options) => {
        calls.push({ url, body: options?.body && JSON.parse(options.body) });
        if (respond) return respond(url, options);
        return {
          ok: true,
          json: async () =>
            url.endsWith("/data") ? data : { ok: true, id: "test" },
        };
      };
      w.addEventListener("error", (e) => errors.push(e.message));
    },
  });
  return { dom, calls, errors, doc: dom.window.document };
}
const tick = () => new Promise((r) => setTimeout(r, 5));
test("all nine CRM views render without script errors", async () => {
  const { dom, doc, errors } = mount();
  await tick();
  for (const b of doc.querySelectorAll("[data-tab]")) {
    b.click();
    await tick();
    assert.equal(doc.querySelector("#heading").textContent, b.textContent);
    assert.ok(doc.querySelector("#content").innerHTML.length > 0);
  }
  assert.deepEqual(errors, []);
  dom.window.close();
});
test("prospect form submits correctly to authenticated API", async () => {
  const { dom, doc, calls } = mount();
  await tick();
  doc.querySelector('[data-action="add-prospect"]').click();
  assert.equal(doc.querySelector("dialog").open, true);
  for (const [name, value] of Object.entries({
    name: "QA Franchise",
    website: "https://example.com",
    contact_name: "Buyer",
    email: "buyer@example.test",
    source_url: "https://example.com/contact",
  }))
    doc.querySelector('[name="' + name + '"]').value = value;
  const form = doc.querySelector("#modal-form"),
    submit = form.querySelector("button.primary");
  form.dispatchEvent(
    new dom.window.SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
      submitter: submit,
    }),
  );
  await tick();
  const call = calls.find((c) => c.url.endsWith("/prospect"));
  assert.ok(call);
  assert.equal(call.body.name, "QA Franchise");
  dom.window.close();
});
test("anonymous page has no CRM controls or data", () => {
  const { dom, doc } = mount(false);
  assert.ok(doc.querySelector("#login"));
  assert.equal(doc.querySelector("#content"), null);
  assert.equal(doc.querySelector("nav"), null);
  assert.equal(doc.querySelector('[data-action="create-team-code"]'), null);
  dom.window.close();
});
test("create team code form posts the company and shows the code and offer", async () => {
  const offer =
    "I'd love to give your team a reason to try us. Use MALOOFENTERTAINMENT25-ABCDEF123456 for 25% off sitewide. Share it with your team and other locations, and use it as often as you like—there's no expiration.";
  const { dom, doc, calls } = mount(true, async (url) => ({
    ok: true,
    json: async () =>
      url.endsWith("/data")
        ? data
        : {
            company: "Maloof Entertainment",
            code: "MALOOFENTERTAINMENT25-ABCDEF123456",
            offer,
            accounts_recorded: 1,
            accounts_preserved: 0,
          },
  }));
  await tick();
  doc.querySelector('[data-tab="1"]').click();
  await tick();
  doc.querySelector('[data-action="create-team-code"]').click();
  assert.equal(doc.querySelector("dialog").open, true);
  doc.querySelector('[name="company"]').value = "Maloof Entertainment";
  const form = doc.querySelector("#modal-form"),
    submit = form.querySelector("button.primary");
  form.dispatchEvent(
    new dom.window.SubmitEvent("submit", {
      bubbles: true,
      cancelable: true,
      submitter: submit,
    }),
  );
  await tick();
  await tick();
  const call = calls.find((c) => c.url.endsWith("/team-code"));
  assert.ok(call);
  assert.equal(call.body.company, "Maloof Entertainment");
  assert.equal(
    doc.querySelector("#minted-team-code").textContent,
    "MALOOFENTERTAINMENT25-ABCDEF123456",
  );
  assert.equal(doc.querySelector("#minted-team-offer").textContent, offer);
  assert.equal(doc.querySelector("dialog").open, true);
  dom.window.close();
});
