const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/admin/Orders.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Count current thumbnail_url occurrences
const beforeCount = (content.match(/item\.thumbnail_url/g) || []).length;
console.log('Before fix: Found', beforeCount, 'occurrences of item.thumbnail_url');

// Pattern to find getThumbnailUrl functions that DON'T have thumbnail_url check at the start
const oldPattern = `const getThumbnailUrl = (item: any, maxWidth: number = 80) => {
    let imageUrl: string | null = null;
    
    if (item.web_preview_url) {`;

const newPattern = `const getThumbnailUrl = (item: any, maxWidth: number = 80) => {
    // CRITICAL: Use thumbnail_url first - it contains the accurate rendered design
    if (item.thumbnail_url) {
      const thumbUrl = item.thumbnail_url;
      if (thumbUrl.includes('res.cloudinary.com') && thumbUrl.includes('/upload/')) {
        return thumbUrl.replace('/upload/', \`/upload/w_\${maxWidth},c_limit,f_auto,q_auto/\`);
      }
      if (thumbUrl.startsWith('http') && !thumbUrl.includes('res.cloudinary.com')) {
        return \`https://res.cloudinary.com/dtrxl120u/image/fetch/w_\${maxWidth},c_limit,f_auto,q_auto/\${thumbUrl}\`;
      }
      return thumbUrl;
    }

    // F    // F    // F    // F    // F    // F    // F    // F    // F    // F    // F  l:     // F    // F    // F    // F    // F    // F    // F    // F    // F    // F    // F  l:n)) {
  content = content.split(oldPattern).join(newPattern);
  fs.writeFileSync(fileP  fs.writeFileSync(fileP  fs.writeFiletT  fbn  fs.writeFileSync(fileP  fs.wrinail_url priority');
} else {
  console.log('getThumbnailUrl already has thumbnail_url check or pattern not found');
}

// Verify the fix
const verifyContent = fs.readFileconst verifyContent = fs.reat afterCount = (verifyContent.match(/item\.thumbnail_url/g) || []).length;
console.log('After fix: Found', afterCount, 'occurrences of item.thumbnail_url');
