// netlify/functions/paypal-capture-simple.js
const mod = require('./paypal-capture-order.js');
exports.handler = (event, ctx) => mod.handler(event, ctx);
