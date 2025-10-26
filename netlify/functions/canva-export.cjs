/**
 * Canva Export Function
 * 
 * Exports a Canva design as PNG and uploads to Cloudinary
 * 
 * SECURITY: Retrieves access token from database instead of accepting it in request
 */

const https = require('https');
const { URL } = require('url');
const cloudinary = require('cloudinary').v2;
const { neon } = require('@neondatabase/serverless');

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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
  console.log('📋 Request body:', event.body);

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // ✅ SECURE - Get userId from request, retrieve token from database
    const { designId, userId } = JSON.parse(event.body);

    if (!designId || !userId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing designId or userId' })
      };
    }

    console.log('🔑 Retrieving access token from database for user:', userId);
    const db = neon(process.env.DATABASE_URL);
    
    const tokens = await db`
      SELECT access_token, expires_at
      FROM canva_tokens
      WHERE user_id = ${userId}
      AND disconnected_at IS NULL
      LIMIT 1
    `;

    if (tokens.length === 0) {
      console.error('❌ No Canva token found for user:', userId);
      return {
        statusCode: 401,
        body: JSON.stringify({ 
          error: 'No Canva token found. Please reconnect your Canva account.',
          needsReauth: true
        })
      };
    }

    const accessToken = tokens[0].access_token;
    const expiresAt = new Date(tokens[0].expires_at);
    
    // Check if token is expired
    if (expiresAt < new Date()) {
      console.warn('⚠️  Token expired, user needs to re-authorize');
      return {
        statusCode: 401,
        body: JSON.stringify({ 
          error: 'Canva token expired. Please reconnect your Canva account.',
          needsReauth: true
        })
      };
    }

    console.log('✅ Access token retrieved from database');

    // Update last_used_at timestamp
    await db`
      UPDATE canva_tokens
      SET last_used_at = NOW()
      WHERE user_id = ${userId}
    `;

    // Start the export
    const exportJob = await exportCanvaDesign(accessToken, designId);
    console.log('✅ Export job created:', exportJob);

    // Poll for completion (with shorter timeout to avoid Netlify function timeout)
    let attempts = 0;
    const maxAttempts = 8; // 8 seconds max (Netlify has 10s timeout)
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
      throw new Error('Export timeout - Canva export is taking longer than expected. Please try again.');
    }

    // Upload directly to Cloudinary from Canva URL (no download needed)
    console.log('📤 Uploading to Cloudinary from Canva URL...');
    const uploadResult = await cloudinary.uploader.upload(exportUrls[0], {
      folder: 'canva-exports',
      resource_type: 'image',
      format: 'png',
      public_id: `canva-${designId}-${Date.now()}`
    });
    
    console.log(`✅ Uploaded to Cloudinary: ${uploadResult.secure_url}`);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        imageUrl: uploadResult.secure_url,
        publicId: uploadResult.public_id,
        fileName: `canva-design-${designId}.png`,
        width: uploadResult.width,
        height: uploadResult.height
      })
    };

  } catch (error) {
    console.error('❌ Error in canva-export:', error);
    console.error('❌ Error stack:', error.stack);
    console.error('❌ Error details:', JSON.stringify(error, null, 2));
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: error.message,
        details: error.stack
      })
    };
  }
};
