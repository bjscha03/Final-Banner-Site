const https = require('https');
const { URL } = require('url');

/**
 * Helper function to make HTTPS requests
 */
function httpsRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: options.headers || {}
    };

    const req = https.request(reqOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch (e) {
            resolve(data);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
        }
      });
    });

    req.on('error', reject);
    
    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    
    req.end();
  });
}

/**
 * Download binary data from URL
 */
function downloadBinary(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const reqOptions = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'GET'
    };

    const req = https.request(reqOptions, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Export a Canva design as PNG
 */
async function exportCanvaDesign(accessToken, designId) {
  const exportUrl = `https://api.canva.com/rest/v1/exports`;
  
  const exportData = {
    design_id: designId,
    format: {
      type: 'png'
    }
  };

  const options = {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    }
  };

  console.log(`📤 Requesting export for design ${designId}`);
  const result = await httpsRequest(exportUrl, options, JSON.stringify(exportData));
  
  // The export is async, we get a job ID
  return result;
}

/**
 * Check export job status
 */
async function checkExportStatus(accessToken, jobId) {
  const statusUrl = `https://api.canva.com/rest/v1/exports/${jobId}`;
  
  const options = {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${accessToken}`
    }
  };

  return httpsRequest(statusUrl, options);
}

exports.handler = async (event, context) => {
  console.log('📥 Canva Export - Starting export process');

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const { designId, accessToken } = JSON.parse(event.body);

    if (!designId || !accessToken) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing designId or accessToken' })
      };
    }

    // Start the export
    const exportJob = await exportCanvaDesign(accessToken, designId);
    console.log('✅ Export job created:', exportJob);

    // Poll for completion (with timeout)
    let attempts = 0;
    const maxAttempts = 30; // 30 seconds max
    let exportUrls = null;
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second
      
      const status = await checkExportStatus(accessToken, exportJob.job.id);
      console.log(`🔄 Export status (attempt ${attempts + 1}):`, status.job.status);
      
      if (status.job.status === 'success') {
        console.log('✅ Export completed successfully');
        exportUrls = status.job.urls;
        break;
      } else if (status.job.status === 'failed') {
        throw new Error(`Export job failed: ${status.job.error?.message || 'Unknown error'}`);
      }
      
      attempts++;
    }

    if (!exportUrls || exportUrls.length === 0) {
      throw new Error('Export timeout - job took too long');
    }

    // Download the image from Canva
    console.log('📥 Downloading image from Canva...');
    const imageBuffer = await downloadBinary(exportUrls[0]);
    console.log(`✅ Downloaded ${imageBuffer.length} bytes`);

    // Convert to base64
    const base64Image = imageBuffer.toString('base64');

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        imageData: `data:image/png;base64,${base64Image}`,
        fileName: `canva-design-${designId}.png`
      })
    };

  } catch (error) {
    console.error('❌ Error in canva-export:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: error.message
      })
    };
  }
};
