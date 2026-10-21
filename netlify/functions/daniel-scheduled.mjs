import { environment, mode } from "../../server/daniel-agent/config.mjs";
import { database } from "../../server/daniel-agent/db.mjs";
import { enqueueRun } from "../../server/daniel-agent/jobs.mjs";
export default async function () {
  const env = environment();
  if (mode(env) !== "live") return;
  await enqueueRun(database(env), env);
}
export const config = { schedule: "*/15 * * * *" };
