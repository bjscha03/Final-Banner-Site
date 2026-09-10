const fs = require('fs');

// Read the original file
const originalContent = fs.readFileSync('netlify/functions/download-file.js', 'utf8');

// Find the section to replace (from line 40 to around line 110)
const lines = originalContent.split('\n');

// Find start and end points
let startIndex = -1;
let endIndex = -1;

for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('const { key, order, fileKey, download }')) {
    startIndex = i;
  }
  if (startIndex !== -1 && lines[i].includes('// For thumbnail requests, we can use Cloudinary')) {
    endIndex = i - 1;
    break;
  }
}

if (startIndex === -1 || endIndex === -1) {
  console.error('Could not find replacement boundaries');
  process.exit(1);
}

console.log(`Replacing lines ${startIndex + 1} to ${endIndex + 1}`);

// Read the enhanced logic
const enhancedLogic = fs.readFileSync('enhanced-download-logic.js', 'utf8');

// Create new content
const newLines = [
  ...lines.slice(0, startIndex),
  enhancedLogic,
  ...lines.slice(endIndex + 1)
];

// Write the updated file
fs.writeFileSync('netlify/functions/download-file.js', newLines.join('\n'));

console.log('Successfully updated download-file.js with AI artwork support');
