export function environment() {
  const keys = [
    "DANIEL_DATABASE_URL",
    "DANIEL_LOCAL_DEV",
    "DANIEL_SESSION_SECRET",
    "DANIEL_ADMIN_PASSWORD",
    "ADMIN_PASSWORD",
    "DANIEL_ALLOWED_HOST",
    "DANIEL_AGENT_MODE",
    "DANIEL_CUTOVER_APPROVED",
    "DANIEL_CRON_SECRET",
    "DANIEL_GOOGLE_CLIENT_ID",
    "DANIEL_GOOGLE_CLIENT_SECRET",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "DANIEL_SENDER_EMAIL",
    "OPENAI_API_KEY",
    "DANIEL_AI_MODEL",
    "CONTEXT",
    "OUTBOUND_PHYSICAL_ADDRESS",
  ];
  return Object.fromEntries(
    keys.map((k) => [k, globalThis.Netlify?.env?.get(k) ?? process.env[k]]),
  );
}
export function mode(env) {
  return env.DANIEL_AGENT_MODE === "live" &&
    env.DANIEL_CUTOVER_APPROVED === "true" &&
    env.CONTEXT === "production"
    ? "live"
    : "preview";
}
export function allowedHost(req, env) {
  return (
    !!env.DANIEL_ALLOWED_HOST &&
    new URL(req.url).host === env.DANIEL_ALLOWED_HOST
  );
}
export function publicConfig(env) {
  return {
    mode: mode(env),
    liveEmailEnabled: mode(env) === "live",
    gmailConfigured: !!(
      (env.DANIEL_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID) &&
      (env.DANIEL_GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET)
    ),
    aiConfigured: !!env.OPENAI_API_KEY,
    oauthRedirect: `https://${env.DANIEL_ALLOWED_HOST}/api/daniel/oauth/callback`,
    existingAutomation: "Unchanged; dedicated agent has not replaced it",
  };
}
