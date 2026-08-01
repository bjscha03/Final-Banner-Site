'use strict';

// Single authoritative PayPal order-creation implementation. Keeping this
// compatibility module preserves every existing import while preventing the
// browser and any recovery path from drifting into different order behavior.
module.exports = require('./paypal-create-order-final.cjs');
