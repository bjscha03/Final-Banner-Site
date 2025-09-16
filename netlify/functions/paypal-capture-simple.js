// netlify/functions/paypal-capture-simple.js
// Backward compatibility proxy to paypal-capture-order.js
const mod = require('./paypal-capture-order.js');
exports.handler = (event, ctx) => mod.handler(event, ctx);
