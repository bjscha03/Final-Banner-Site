import { database } from "./db.mjs";
import { environment, allowedHost, publicConfig, mode, gmailTestRecipients } from "./config.mjs";
import { session, login, cookie, hash, secureEqual } from "./auth.mjs";
import * as store from "./store.mjs";
import * as v from "./validation.mjs";
import { generateDraft } from "./ai.mjs";
import { enqueueRun } from "./jobs.mjs";
import { scheduleMeeting, ics } from "./scheduling.mjs";
import { report } from "./reporting.mjs";
import { oauthStart, oauthComplete } from "./oauth.mjs";
import { accessToken, gmailRequest, getGmail, header } from "./gmail.mjs";
import { syncMailbox, ingest } from "./mail-sync.mjs";
import { html, scriptHash } from "./web/page.mjs";
const headers = {
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-frame-options": "DENY",
  "content-security-policy": `default-src 'self'; script-src 'sha256-${scriptHash}'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'`,
  "x-robots-tag": "noindex, nofollow",
};
const json = (data, status = 200, extra = {}) =>
  Response.json(data, { status, headers: { ...headers, ...extra } });
export async function handler(req, context = {}, deps = {}) {
  const env = deps.env || environment(context);
  if (!allowedHost(req, env)) return json({ error: "Not found" }, 404);
  const sql = deps.sql || database(env),
    url = new URL(req.url),
    path = url.pathname.replace(/\/$/, "");
  try {
    if (!["GET", "POST"].includes(req.method))
      return json({ error: "Method not allowed" }, 405);
    if (req.method === "POST" && req.headers.get("origin") !== url.origin)
      return json({ error: "Same-origin request required" }, 403);
    if (Number(req.headers.get("content-length") || 0) > 100000)
      return json({ error: "Request too large" }, 413);
    if (path === "/api/daniel/login" && req.method === "POST") {
      const r = await login(req, sql, env, context.ip || "unknown");
      return r.token
        ? json({ ok: true }, 200, { "set-cookie": cookie(r.token) })
        : json({ error: r.error }, r.status);
    }
    const s = await session(req, sql);
    if (path === "/daniel")
      return new Response(html(!!s), {
        headers: { ...headers, "content-type": "text/html; charset=utf-8" },
      });
    if (!s) return json({ error: "Sign in required" }, 401);
    if (path === "/api/daniel/oauth/callback" && req.method === "GET") {
      await oauthComplete(req, sql, env, s);
      return new Response(null, {
        status: 303,
        headers: { ...headers, location: "/daniel" },
      });
    }
    if (req.method === "GET") {
      if (path === "/api/daniel/test/gmail/evidence") {
        const permitted = gmailTestRecipients(env);
        if (!permitted.length) v.fail("Controlled Gmail testing is disabled or expired", 403);
        const token = await accessToken(env, sql);
        const aliases = await gmailRequest(token, "/settings/sendAs");
        const sender = aliases.sendAs?.find(x => x.sendAsEmail === env.DANIEL_SENDER_EMAIL);
        if (!url.searchParams.has("id")) return json({ sender: sender?.sendAsEmail, verificationStatus: sender?.verificationStatus, tokenRefresh: true });
        const [m] = await sql`SELECT m.provider_message_id,c.email FROM daniel_sales.messages m JOIN daniel_sales.contacts c ON c.id=m.contact_id WHERE m.id=${v.uuid(url.searchParams.get("id"))}`;
        if (!m?.provider_message_id || !permitted.includes(m.email.toLowerCase())) v.fail("Only controlled test-message evidence is available", 403);
        const message = await getGmail(token, m.provider_message_id);
        return json({ id: message.id, threadId: message.threadId, labelIds: message.labelIds,
          headers: Object.fromEntries(["From","To","Subject","Message-ID","In-Reply-To","References"].map(k => [k, header(message,k)])) });
      }
      if (path === "/api/daniel/data")
        return json({
          ...(await store.data(sql)),
          config: publicConfig(env),
          actor: s.actor,
        });
      if (path === "/api/daniel/report") return json(await report(sql));
      if (path === "/api/daniel/meeting") {
        const [m] =
          await sql`SELECT * FROM daniel_sales.meetings WHERE id=${v.uuid(url.searchParams.get("id"))}`;
        if (!m) v.fail("Meeting not found", 404);
        return new Response(ics(m), {
          headers: {
            ...headers,
            "content-type": "text/calendar",
            "content-disposition": 'attachment; filename="daniel-meeting.ics"',
          },
        });
      }
      if (path === "/api/daniel/export") {
        const d = await store.data(sql);
        return new Response(JSON.stringify(d, null, 2), {
          headers: {
            ...headers,
            "content-type": "application/json",
            "content-disposition":
              'attachment; filename="daniel-crm-export.json"',
          },
        });
      }
      return json({ error: "Not found" }, 404);
    }
    const input = await req.json();
    let result;
    switch (path) {
      case "/api/daniel/logout":
        await sql`DELETE FROM daniel_sales.sessions WHERE token_hash=${s.token_hash}`;
        return json({ ok: true }, 200, { "set-cookie": cookie("", 0) });
      case "/api/daniel/prospect":
        result = await store.createProspect(sql, input, s.actor);
        break;
      case "/api/daniel/import": {
        if (!Array.isArray(input.prospects) || input.prospects.length > 100)
          v.fail("Import requires 1–100 prospects");
        result = { created: 0, errors: [] };
        for (const [i, p] of input.prospects.entries()) {
          try {
            await store.createProspect(sql, p, s.actor);
            result.created++;
          } catch (e) {
            result.errors.push({
              row: i + 1,
              error: e.code === "23505" ? "Contact already exists" : e.message,
            });
          }
        }
        break;
      }
      case "/api/daniel/opportunity": {
        const id = v.uuid(input.id),
          o = v.opportunity(input);
        const [updated] =
          await sql`UPDATE daniel_sales.opportunities SET stage=${o.stage},next_action=${o.next_action},next_action_at=${o.next_action_at},product_interest=${String(input.product_interest || "").slice(0, 1000)},owner_name=${String(input.owner_name || "Daniel").slice(0, 100)} WHERE id=${id} RETURNING id`;
        if (!updated) v.fail("Opportunity not found", 404);
        await store.audit(
          sql,
          s.actor,
          "opportunity_updated",
          "opportunity",
          id,
          o,
        );
        result = { ok: true };
        break;
      }
      case "/api/daniel/notes": {
        const id = v.uuid(input.id);
        await sql`UPDATE daniel_sales.accounts SET notes=${String(input.notes || "").slice(0, 10000)} WHERE id=${id}`;
        await store.audit(sql, s.actor, "notes_updated", "account", id);
        result = { ok: true };
        break;
      }
      case "/api/daniel/draft":
        result = await store.saveDraft(sql, input, s.actor);
        break;
      case "/api/daniel/draft/edit": {
        const id = v.uuid(input.id);
        const [m] =
          await sql`UPDATE daniel_sales.messages SET subject=${v.text(input.subject, "Subject", 250)},body=${v.text(input.body, "Message", 12000)},due_at=${v.date(input.due_at || new Date().toISOString())},status='draft',approved_at=NULL,approved_by=NULL,updated_at=now() WHERE id=${id} AND status IN ('draft','queued','pending_approval') RETURNING id`;
        if (!m) v.fail("Message can no longer be edited", 409);
        await sql`UPDATE daniel_sales.approvals SET decision='superseded',decided_at=now(),decided_by=${s.actor} WHERE message_id=${id} AND decision='pending'`;
        await store.audit(sql, s.actor, "draft_edited", "message", id);
        result = m;
        break;
      }
      case "/api/daniel/draft/ai": {
        const kind = input.kind || "intro";
        if (!["intro", "reply", "followup"].includes(kind))
          v.fail("Invalid message kind");
        const d = await generateDraft(sql, v.uuid(input.contact_id), kind, env);
        result = await store.saveDraft(sql, d, s.actor);
        break;
      }
      case "/api/daniel/approval/request":
        result = await store.requestApproval(sql, input.id, s.actor);
        break;
      case "/api/daniel/approval/decide":
        result = await store.decide(
          sql,
          input.id,
          input.decision,
          input.note,
          s.actor,
        );
        break;
      case "/api/daniel/suppress":
        result = await store.suppress(sql, input.email, input.reason, s.actor);
        break;
      case "/api/daniel/suppression/remove": {
        const email = v.email(input.email),
          reason = v.text(input.reason, "Documented renewed consent", 2000);
        await sql.transaction([
          sql`DELETE FROM daniel_sales.suppressions WHERE email=${email}`,
          sql`UPDATE daniel_sales.contacts SET suppressed_at=NULL,suppression_reason=NULL WHERE lower(email)=${email}`,
        ]);
        await store.audit(
          sql,
          s.actor,
          "suppression_removed",
          "contact",
          email,
          { renewed_consent: reason },
        );
        result = { ok: true };
        break;
      }
      case "/api/daniel/task": {
        const [t] =
          await sql`INSERT INTO daniel_sales.tasks(opportunity_id,contact_id,kind,due_at,note) VALUES(${v.uuid(input.opportunity_id)},${input.contact_id ? v.uuid(input.contact_id) : null},'manual',${v.date(input.due_at)},${v.text(input.note, "Task", 2000)}) RETURNING *`;
        await store.audit(sql, s.actor, "task_created", "task", t.id);
        result = t;
        break;
      }
      case "/api/daniel/task/complete":
        await sql`UPDATE daniel_sales.tasks SET status='completed' WHERE id=${v.uuid(input.id)} AND kind='manual'`;
        await store.audit(sql, s.actor, "task_completed", "task", input.id);
        result = { ok: true };
        break;
      case "/api/daniel/meeting":
        result = await scheduleMeeting(sql, input, s.actor);
        break;
      case "/api/daniel/meeting/cancel":
        await sql`UPDATE daniel_sales.meetings SET status='cancelled' WHERE id=${v.uuid(input.id)}`;
        await store.audit(
          sql,
          s.actor,
          "meeting_cancelled",
          "meeting",
          input.id,
        );
        result = { ok: true };
        break;
      case "/api/daniel/settings":
        await sql`UPDATE daniel_sales.settings SET paused=coalesce(${typeof input.paused === "boolean" ? input.paused : null}::boolean,paused),auto_reply=coalesce(${typeof input.auto_reply === "boolean" ? input.auto_reply : null}::boolean,auto_reply),updated_at=now() WHERE id=1`;
        await store.audit(
          sql,
          s.actor,
          "execution_settings_changed",
          "settings",
          1,
          {
            paused: input.paused,
            auto_reply: input.auto_reply,
          },
        );
        result = { ok: true };
        break;
      case "/api/daniel/run":
        result = await enqueueRun(sql, env);
        break;
      case "/api/daniel/report":
        result = await report(sql);
        break;
      case "/api/daniel/test/gmail/run":
        if (!gmailTestRecipients(env).length) v.fail("Controlled Gmail testing is disabled or expired", 403);
        await store.audit(sql, s.actor, "gmail_test_requested", "settings", 1);
        result = await enqueueRun(sql, env, { gmailTest: true });
        break;
      case "/api/daniel/oauth/start":
        result = await oauthStart(sql, env, s);
        break;
      case "/api/daniel/oauth/disconnect":
        await sql`UPDATE daniel_sales.mailbox SET encrypted_refresh_token=NULL,email=NULL,history_id=NULL,page_token=NULL WHERE id=1`;
        await store.audit(sql, s.actor, "gmail_disconnected", "mailbox", 1);
        result = { ok: true };
        break;
      case "/api/daniel/sync":
        result = await syncMailbox(sql, await accessToken(env, sql));
        break;
      case "/api/daniel/test/inbound": {
        if (mode(env) === "live") v.fail("Preview only", 403);
        const email = v.email(input.email),
          body = v.text(input.body, "Test message", 12000);
        result = await ingest(
          sql,
          {
            id: "preview:" + v.text(input.event_id, "Event ID", 100),
            threadId: input.thread_key || "test-thread",
            labelIds: ["INBOX"],
            payload: {
              mimeType: "text/plain",
              headers: [
                { name: "From", value: email },
                {
                  name: "Subject",
                  value: input.subject || "Test customer reply",
                },
                {
                  name: "Message-ID",
                  value: "<preview." + input.event_id + "@example.test>",
                },
              ],
              body: { data: Buffer.from(body).toString("base64url") },
            },
          },
          s.actor,
        );
        break;
      }
      default:
        return json({ error: "Not found" }, 404);
    }
    return json(result);
  } catch (e) {
    const status =
      e.status && e.status >= 400 && e.status < 600
        ? e.status
        : ["23505", "23P01"].includes(e.code)
          ? 409
          : 500;
    console.error("Daniel request failed", {
      path,
      code: e.code || e.status || "runtime",
    });
    return json(
      {
        error:
          status === 500
            ? "Unable to complete request. Check connection status and retry."
            : e.code === "23505"
              ? "This contact or record already exists."
              : e.code === "23P01"
                ? "This time conflicts with an existing meeting."
                : e.message,
      },
      status,
    );
  }
}
