# Daniel — BOF Dedicated Sales Agent

The running implementation is documented in [server/daniel-agent/README.md](../../server/daniel-agent/README.md). See [the verification record](../../server/daniel-agent/VALIDATION.md) for completed checks and account-access blockers.

The authenticated CRM is preview-deployed at https://deploy-preview-655--bannersonthefly.netlify.app/daniel. It uses an isolated Neon database and restricted application role. Live sending remains disabled; the existing hourly automation is unchanged.

Daniel serves end-customer franchisees, chains, contractors, property groups and event organizations. Supplier sourcing is excluded. Custom pricing and terms require owner approval. Routine automation is disabled by default, and preview deliveries remain simulated even when it is enabled for testing.

The draft PR must not be merged or activated until Gmail authorization, final deployed checks and owner cutover approval are complete.
