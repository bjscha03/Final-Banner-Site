const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/components/design/LivePreviewCard.tsx', 'utf8');

// Fix the button container alignment - change from flex-col to center alignment
const oldButtonContainer = `              <div className="flex flex-col gap-3 justify-center items-center">`;
const newButtonContainer = `              <div className="flex flex-col gap-3 items-center justify-center">`;

content = content.replace(oldButtonContainer, newButtonContainer);

// Write the file back
fs.writeFileSync('src/components/design/LivePreviewCard.tsx', content);
console.log('Button alignment fixed in LivePreviewCard!');
