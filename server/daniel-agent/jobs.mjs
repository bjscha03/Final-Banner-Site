import { runWorker } from "./worker.mjs";
export async function enqueueRun(sql, env) {
  if (env.DANIEL_LOCAL_DEV === "true") return runWorker(env, { sql });
  const [job] =
    await sql`INSERT INTO daniel_sales.runs(status) VALUES('queued') RETURNING id`;
  try {
    const res = await fetch(
      "https://" + env.DANIEL_ALLOWED_HOST + "/api/internal/daniel-agent/job",
      {
        method: "POST",
        headers: {
          authorization: "Bearer " + env.DANIEL_CRON_SECRET,
          "content-type": "application/json",
        },
        body: JSON.stringify({ runId: job.id }),
        signal: AbortSignal.timeout(12000),
      },
    );
    if (!res.ok) throw Error("Unable to queue background job");
    return { status: "queued", runId: job.id };
  } catch (e) {
    await sql`UPDATE daniel_sales.runs SET status='failed',completed_at=now(),summary='{"error":"Background execution unavailable"}'::jsonb WHERE id=${job.id}`;
    throw e;
  }
}
