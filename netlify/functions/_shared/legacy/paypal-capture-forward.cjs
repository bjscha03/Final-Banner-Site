'use strict';

// Single authoritative PayPal capture implementation. Keeping this compatibility
// module preserves every existing import while preventing the browser, webhook,
// and status poller from drifting into separate payment behavior.
module.exports = require('./paypal-capture-final.cjs');
