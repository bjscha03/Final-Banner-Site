// netlify/functions/paypal-capture-simple.js
const mod = require('./paypal-capture-order.cjs');
module.exports.handler = (event, ctx) => mod.handler(event, ctx);
