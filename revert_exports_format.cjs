const fs = require('fs');

// Read the current file
let content = fs.readFileSync('netlify/functions/paypal-capture-minimal.js', 'utf8');

// Replace module.exports.handler back to exports.handler
content = content.replace('module.exports.handler = async (event) => {', 'exports.handler = async (event) => {');

// Write it back
fs.writeFileSync('netlify/functions/paypal-capture-minimal.js', content);
console.log('Reverted to exports.handler format');
