import { runWorker } from "../../server/daniel-agent/worker.mjs";
import { environment, allowedHost } from "../../server/daniel-agent/config.mjs";
import { secureEqual } from "../../server/daniel-agent/auth.mjs";
import { uuid } from "../../server/daniel-agent/validation.mjs";
export default async function (request) {
  const env = environment();
  if (
    !allowedHost(request, env) ||
    request.method !== "POST" ||
    !env.DANIEL_CRON_SECRET ||
    !secureEqual(
      request.headers.get("authorization"),
      "Bearer " + env.DANIEL_CRON_SECRET,
    )
  )
    return;
  const body = await request.json();
  await runWorker(env, { runId: uuid(body.runId) });
}
export const config = {
  path: "/api/internal/daniel-agent/job",
  background: true,
};
