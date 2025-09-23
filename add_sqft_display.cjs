const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/components/design/LivePreviewCard.tsx', 'utf8');

// Add the square footage display in the header section
const sqftDisplay = `            <div className="text-sm text-gray-600 text-center sm:text-right">
              <div className="font-medium">{formatDimensions(widthIn, heightIn)}</div>
              <div className="text-xs">
                {((widthIn * heightIn) / 144).toFixed(1)} sq ft
              </div>
              <div className="text-xs">
                {grommetInfo.count > 0 ? \`\${grommetInfo.count} grommets (\${grommetInfo.name})\` : 'No grommets'}
              </div>
            </div>`;

const oldDisplay = `            <div className="text-sm text-gray-600 text-center sm:text-right">
              <div className="font-medium">{formatDimensions(widthIn, heightIn)}</div>
              <div className="text-xs">
                {grommetInfo.count > 0 ? \`\${grommetInfo.count} grommets (\${grommetInfo.name})\` : 'No grommets'}
              </div>
            </div>`;

content = content.replace(oldDisplay, sqftDisplay);

// Write the file back
fs.writeFileSync('src/components/design/LivePreviewCard.tsx', content);
console.log('Square footage display added to LivePreviewCard!');
