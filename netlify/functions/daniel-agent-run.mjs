import { enqueueRun } from "../../server/daniel-agent/jobs.mjs";
import { database } from "../../server/daniel-agent/db.mjs";
import { environment, allowedHost } from "../../server/daniel-agent/config.mjs";
import { secureEqual } from "../../server/daniel-agent/auth.mjs";
export default async function handler(request, context) {
  const env = environment(context);
  if (!allowedHost(request, env))
    return new Response("Not found", { status: 404 });
  if (request.method !== "POST")
    return new Response("Method not allowed", { status: 405 });
  if (
    !env.DANIEL_CRON_SECRET ||
    !secureEqual(
      request.headers.get("authorization"),
      "Bearer " + env.DANIEL_CRON_SECRET,
    )
  )
    return new Response("Unauthorized", { status: 401 });
  try {
    return Response.json(await enqueueRun(database(env), env));
  } catch {
    return Response.json({ error: "Worker failed safely" }, { status: 500 });
  }
}
export const config = { path: "/api/internal/daniel-agent/run" };
