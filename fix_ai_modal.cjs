const fs = require('fs');

// Read the file
let content = fs.readFileSync('src/components/design/AIGenerationModal.tsx', 'utf8');

// Replace the error handling section
const oldErrorHandling = `      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Generation failed');
      }

      const result = await response.json();`;

const newErrorHandling = `      if (!response.ok) {
        let errorMessage = 'Generation failed';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
        } catch (parseError) {
          // If we can't parse the error response, use the status text
          errorMessage = response.statusText || \`HTTP \${response.status}\`;
        }
        throw new Error(errorMessage);
      }

      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        console.error('Failed to parse response JSON:', parseError);
        throw new Error('Invalid response from server. Please try again.');
      }`;

content = content.replace(oldErrorHandling, newErrorHandling);

// Write the file back
fs.writeFileSync('src/components/design/AIGenerationModal.tsx', content);
console.log('Fixed AI modal error handling!');
