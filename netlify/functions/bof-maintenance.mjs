import auth from "./_shared/server-auth.cjs";
export default async function handler(_request, context) {
  if (
    auth.isDeployPreviewEnvironment({}) ||
    !process.env.BOF_REFERRAL_LAUNCHED_AT
  )
    return new Response("Inactive");
  const deploy = String(context?.deploy?.id || ""),
    site = String(context?.site?.name || "");
  if (
    !/^[a-z0-9-]+$/.test(deploy) ||
    !/^[a-z0-9-]+$/.test(site) ||
    !process.env.INTERNAL_JOB_SECRET
  )
    return new Response("Configuration missing", { status: 503 });
  const response = await fetch(
    `https://${deploy}--${site}.netlify.app/.netlify/functions/bof-maintenance-background`,
    {
      method: "POST",
      redirect: "error",
      headers: { "X-Internal-Job-Secret": process.env.INTERNAL_JOB_SECRET },
      signal: AbortSignal.timeout(10000),
    },
  );
  return new Response(response.status === 202 ? "Queued" : "Retry", {
    status: response.status === 202 ? 200 : 503,
  });
}
export const config = { schedule: "15 * * * *" };
