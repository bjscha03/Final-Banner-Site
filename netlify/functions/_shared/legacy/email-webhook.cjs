// Backwards-compatible endpoint alias. The old implementation accepted
// unsigned payloads and could be forged to alter recovery state. Delegating to
// the canonical Resend handler makes both configured webhook URLs require the
// same Svix signature and replay-safe event path.
module.exports = require('./resend-webhook.cjs');
