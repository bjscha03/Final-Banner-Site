const https = require('https');

// Test if the site is accessible
const url = 'https://bjscha03-final-banner-site.netlify.app';

https.get(url, (res) => {
  console.log('Status Code:', res.statusCode);
  console.log('Headers:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('\n--- Response Preview (first 500 chars) ---');
    console.log(data.substring(0, 500));
    
    // Check for common issues
    if (data.includes('<div id="root"></div>')) {
      console.log('\n✅ Root div found');
    } else {
      console.log('\n❌ Root div NOT found');
    }
    
    if (data.includes('index-') && data.includes('.js')) {
      console.log('✅ JavaScript bundle referenced');
    } else {
      console.log('❌ JavaScript bundle NOT referenced');
    }
    
    if (data.includes('index-') && data.includes('.css')) {
      console.log('✅ CSS bundle referenced');
    } else {
      console.log('❌ CSS bundle NOT referenced');
    }
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
