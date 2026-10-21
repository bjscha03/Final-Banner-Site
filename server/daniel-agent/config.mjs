export function environment(context = globalThis.Netlify?.context) {
  const keys = [
    "DANIEL_DATABASE_URL",
    "DANIEL_LOCAL_DEV",
    "DANIEL_SESSION_SECRET",
    "DANIEL_ADMIN_PASSWORD",
    "ADMIN_PASSWORD",
    "DANIEL_ALLOWED_HOST",
    "DANIEL_AGENT_MODE",
    "DANIEL_CUTOVER_APPROVED",
    "DANIEL_GMAIL_TEST_RECIPIENTS",
    "DANIEL_GMAIL_TEST_UNTIL",
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
  const env = Object.fromEntries(
    keys.map((k) => [k, globalThis.Netlify?.env?.get(k) ?? process.env[k]]),
  );
  // CONTEXT is a build variable; Functions expose deployment context on the
  // request runtime. Do not mistake a missing build variable for production.
  env.CONTEXT = context?.deploy?.context || env.CONTEXT;
  return env;
}
// Real-provider acceptance tests are separate from production cutover. Only an
// explicit authenticated test job may use this short-lived exact-address list.
export function gmailTestRecipients(env, now = new Date()) {
  const remaining = Date.parse(env.DANIEL_GMAIL_TEST_UNTIL || "") - +now;
  if (env.CONTEXT !== "deploy-preview" || mode(env) === "live" ||
      !(remaining > 0 && remaining <= 86400000)) return [];
  const recipients = String(env.DANIEL_GMAIL_TEST_RECIPIENTS || "")
    .split(",").map(x => x.trim().toLowerCase()).filter(Boolean);
  if (!recipients.length || recipients.length > 3 ||
      recipients.some(x => !/^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(x))) return [];
  return [...new Set(recipients)];
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
    deploymentContext: env.CONTEXT || "unknown",
    gmailTestEnabled: gmailTestRecipients(env).length > 0,
    gmailTestUntil: gmailTestRecipients(env).length ? env.DANIEL_GMAIL_TEST_UNTIL : null,
    gmailConfigured: !!(
      (env.DANIEL_GOOGLE_CLIENT_ID || env.GOOGLE_CLIENT_ID) &&
      (env.DANIEL_GOOGLE_CLIENT_SECRET || env.GOOGLE_CLIENT_SECRET)
    ),
    aiConfigured: !!env.OPENAI_API_KEY,
    oauthRedirect: `https://${env.DANIEL_ALLOWED_HOST}/api/daniel/oauth/callback`,
    existingAutomation: "Unchanged; dedicated agent has not replaced it",
  };
}
