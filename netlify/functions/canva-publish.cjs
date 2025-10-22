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
const fetch = require('node-fetch');

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
    console.error('❌ Error verifying signature:', error);
    return false;
  }
}

/**
 * Upload file to Cloudinary using unsigned upload
 */
async function uploadToCloudinary(fileUrl, cloudName, uploadPreset) {
  console.log('☁️ Uploading to Cloudinary:', { fileUrl, cloudName, uploadPreset });

  try {
    const fileResponse = await fetch(fileUrl);
    if (!fileResponse.ok) {
      throw new Error(`Failed to download file from Canva: ${fileResponse.statusText}`);
    }

    const fileBuffer = await fileResponse.buffer();
    const base64File = fileBuffer.toString('base64');
    const dataUri = `data:${fileResponse.headers.get('content-type') || 'application/octet-stream'};base64,${base64File}`;

    const cloudinaryUrl = `https://api.cloudinary.com/v1_1/${cloudName}/upload`;
    
    const formData = new URLSearchParams();
    formData.append('file', dataUri);
    formData.append('upload_preset', uploadPreset);
    formData.append('folder', 'canva-designs');
    formData.append('resource_type', 'auto');

    const uploadResponse = await fetch(cloudinaryUrl, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Cloudinary upload failed: ${uploadResponse.statusText} - ${errorText}`);
    }

    const uploadResult = await uploadResponse.json();
    console.log('✅ Cloudinary upload successful:', uploadResult.secure_url);

    return uploadResult.secure_url;

  } catch (error) {
    console.error('❌ Error uploading to Cloudinary:', error);
    throw error;
  }
}

exports.handler = async (event, context) => {
  console.log('🎨 Canva Publish - Receiving published design');
  console.log('📥 Request method:', event.httpMethod);

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const canvaSecret = process.env.CANVA_CLIENT_SECRET;
    const cloudinaryCloud = process.env.CLOUDINARY_CLOUD_NAME;
    const cloudinaryPreset = process.env.CLOUDINARY_UNSIGNED_PRESET;

    if (!canvaSecret) {
      console.error('❌ CANVA_CLIENT_SECRET not configured');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Canva integration not configured' })
      };
    }

    if (!cloudinaryCloud || !cloudinaryPreset) {
      console.error('❌ Cloudinary not configured');
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Cloudinary not configured' })
      };
    }

    const signature = event.headers['x-canva-signatures'] || event.headers['X-Canva-Signatures'];
    const timestamp = event.headers['x-canva-timestamp'] || event.headers['X-Canva-Timestamp'];

    const isValid = verifyCanvaSignature(event.body, signature, timestamp, canvaSecret);
    if (!isValid) {
      console.error('❌ Invalid Canva signature');
      return {
        statusCode: 401,
        body: JSON.stringify({ error: 'Invalid signature' })
      };
    }

    console.log('✅ Canva signature verified');

    const payload = JSON.parse(event.body);
    console.log('📦 Canva payload:', JSON.stringify(payload, null, 2));

    const { state, url, export_url, design } = payload;
    const orderId = state;
    const fileUrl = export_url || url || design?.export_url;

    if (!orderId) {
      console.error('❌ Missing orderId in state parameter');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing orderId in state parameter' })
      };
    }

    if (!fileUrl) {
      console.error('❌ Missing file URL in Canva payload');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing file URL in payload' })
      };
    }

    console.log('📄 Processing Canva design:', { orderId, fileUrl });

    const cloudinaryUrl = await uploadToCloudinary(fileUrl, cloudinaryCloud, cloudinaryPreset);

    console.log('✅ Design uploaded successfully:', {
      orderId,
      cloudinaryUrl,
      canvaFileUrl: fileUrl
    });

    const redirectUrl = `${process.env.URL || 'https://bannersonthefly.com'}/design/complete?orderId=${encodeURIComponent(orderId)}`;
    
    console.log('🔄 Redirecting to:', redirectUrl);

    return {
      statusCode: 302,
      headers: {
        'Location': redirectUrl,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: ''
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
