/**
 * Canva Publish Function
 * 
 * Receives the published design from Canva, verifies the signature,
 * uploads the file to Cloudinary, and redirects the user back to the site.
 * 
 * Environment Variables Required:
 * - CANVA_CLIENT_SECRET: Secret key for verifying Canva webhook signatures
 * - CLOUDINARY_CLOUD_NAME: Cloudinary cloud name (e.g., dtrx1l20u)
 * - CLOUDINARY_UNSIGNED_PRESET: Cloudinary unsigned upload preset (e.g., canva_upload)
 */

const crypto = require('crypto');
const https = require('https');

/**
 * Verify Canva webhook signature
 */
function verifyCanvaSignature(body, signature, timestamp, secret) {
  if (!signature || !timestamp || !secret) {
    console.error('❌ Missing signature verification parameters');
    return false;
  }

  try {
    const payload = `${timestamp}:${body}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');

    const signaturesMatch = crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );

    if (!signaturesMatch) {
      console.error('❌ Signature mismatch');
      return false;
    }

    const currentTime = Math.floor(Date.now() / 1000);
    const requestTime = parseInt(timestamp, 10);
    const timeDiff = Math.abs(currentTime - requestTime);
    
    if (timeDiff > 300) {
      console.error('❌ Timestamp too old:', { timeDiff });
      return false;
    }

    return true;
  } catch (error) {
    console.error('❌ Signature verification error:', error);
    return false;
  }
}

/**
 * Download file from URL using https module
 */
function downloadFile(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
      response.on('error', reject);
    }).on('error', reject);
  });
}

/**
 * Upload to Cloudinary using https module
 */
function uploadToCloudinary(fileBuffer, cloudName, preset) {
  return new Promise((resolve, reject) => {
    const base64Data = fileBuffer.toString('base64');
    const dataUri = `data:image/png;base64,${base64Data}`;
    
    const formData = JSON.stringify({
      file: dataUri,
      upload_preset: preset,
      folder: 'canva-designs'
    });

    const options = {
      hostname: 'api.cloudinary.com',
      path: `/v1_1/${cloudName}/image/upload`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(formData)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        if (res.statusCode === 200) {
          resolve(JSON.parse(data));
        } else {
          reject(new Error(`Cloudinary upload failed: ${res.statusCode} - ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(formData);
    req.end();
  });
}

exports.handler = async (event, context) => {
  console.log('📥 Canva Publish - Received webhook');

  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    // Get environment variables
    const canvaSecret = process.env.CANVA_CLIENT_SECRET;
    const cloudinaryCloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const cloudinaryPreset = process.env.CLOUDINARY_UNSIGNED_PRESET;

    if (!canvaSecret || !cloudinaryCloudName || !cloudinaryPreset) {
      console.error('❌ Missing required environment variables');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Server configuration error' })
      };
    }

    // Verify Canva signature
    const signature = event.headers['x-canva-signature'];
    const timestamp = event.headers['x-canva-timestamp'];
    
    if (!verifyCanvaSignature(event.body, signature, timestamp, canvaSecret)) {
      console.error('❌ Invalid signature');
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid signature' })
      };
    }

    // Parse the webhook payload
    const payload = JSON.parse(event.body);
    console.log('✅ Webhook verified:', payload);

    // Extract the design URL and order ID from the payload
    const { url: designUrl, state: orderId } = payload;

    if (!designUrl || !orderId) {
      console.error('❌ Missing design URL or order ID');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing required fields' })
      };
    }

    console.log('📥 Downloading design from Canva:', designUrl);
    const fileBuffer = await downloadFile(designUrl);

    console.log('☁️ Uploading to Cloudinary...');
    const cloudinaryResult = await uploadToCloudinary(
      fileBuffer,
      cloudinaryCloudName,
      cloudinaryPreset
    );

    console.log('✅ Upload successful:', cloudinaryResult.secure_url);

    // Redirect user back to the completion page
    const redirectUrl = `https://bannersonthefly.com/design/complete?orderId=${encodeURIComponent(orderId)}`;

    return {
      statusCode: 302,
      headers: {
        'Location': redirectUrl
      },
      body: JSON.stringify({
        success: true,
        cloudinaryUrl: cloudinaryResult.secure_url,
        orderId
      })
    };

  } catch (error) {
    console.error('❌ Error in canva-publish:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Internal server error',
        message: error.message 
      })
    };
  }
};
