const fs = require('fs');

// Read the current file
let content = fs.readFileSync('netlify/functions/paypal-capture-minimal.js', 'utf8');

// Replace exports.handler with module.exports.handler
content = content.replace('exports.handler = async (event) => {', 'module.exports.handler = async (event) => {');

// Write it back
fs.writeFileSync('netlify/functions/paypal-capture-minimal.js', content);
console.log('Changed to module.exports.handler format');
