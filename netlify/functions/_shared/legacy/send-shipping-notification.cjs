// Keep the legacy endpoint operational, but route it through the same audited
// implementation used by the Admin Send/Resend Tracking Email action. This
// prevents the two shipping-email paths from drifting apart again.
module.exports = require('./resend-tracking-email.cjs');
