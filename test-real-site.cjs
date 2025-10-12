const https = require('https');

const url = 'https://final-banner-site.netlify.app';

console.log('Testing:', url);

https.get(url, (res) => {
  console.log('Status Code:', res.statusCode);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('\n--- HTML Preview (first 1000 chars) ---');
    console.log(data.substring(0, 1000));
    
    // Check for issues
    if (data.includes('<div id="root"></div>')) {
      console.log('\n✅ Root div found');
    } else {
      console.log('\n❌ Root div NOT found');
    }
    
    if (data.includes('index-') && data.includes('.js')) {
      const match = data.match(/index-(\d+)\.js/);
      console.log('✅ JavaScript bundle:', match ? match[0] : 'found');
    } else {
      console.log('❌ JavaScript bundle NOT referenced');
    }
    
    if (data.includes('index-') && data.includes('.css')) {
      const match = data.match(/index-(\d+)\.css/);
      console.log('✅ CSS bundle:', match ? match[0] : 'found');
    } else {
      console.log('❌ CSS bundle NOT referenced');
    }
    
    // Check for the specific bundle version
    if (data.includes('1760260946184')) {
      console.log('✅ Latest build (1760260946184) is deployed');
    } else {
      console.log('⚠️  Different build version deployed');
      const jsMatch = data.match(/index-(\d+)\.js/);
      if (jsMatch) {
        console.log('   Deployed version:', jsMatch[1]);
      }
    }
  });
}).on('error', (err) => {
  console.error('Error:', err.message);
});
