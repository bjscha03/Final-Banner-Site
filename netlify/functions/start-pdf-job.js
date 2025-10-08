/**
 * Netlify Function: start-pdf-job
 * Starts a background PDF generation job and returns immediately
 */

const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

exports.handler = async (event) => {
  console.log('[PDF Job] Starting PDF generation job');
  
  try {
    if (event.httpMethod !== 'POST') {
      return {
        statusCode: 405,
        body: JSON.stringify({ error: 'Method not allowed' })
      };
    }

    const req = JSON.parse(event.body || '{}');
    
    // Validate required fields
    if (!req.orderId || !req.bannerWidthIn || !req.bannerHeightIn || (!req.fileKey && !req.imageUrl)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ 
          error: 'Missing required fields',
          required: ['orderId', 'bannerWidthIn', 'bannerHeightIn', 'fileKey or imageUrl']
        })
      };
    }

    // Generate unique job ID
    const jobId = `pdf_${req.orderId}_${Date.now()}`;
    console.log('[PDF Job] Created job ID:', jobId);

    // Create initial job status
    const jobStatus = {
      jobId,
      status: 'pending',
      orderId: req.orderId,
      createdAt: new Date().toISOString(),
      progress: 0,
      message: 'Job queued'
    };

    // Upload job status to Cloudinary as JSON
    const statusPublicId = `pdf_jobs/${jobId}_status`;
    await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          resource_type: 'raw',
          folder: 'pdf_jobs',
          public_id: statusPublicId,
          format: 'json',
          overwrite: true,
        },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      stream.end(Buffer.from(JSON.stringify(jobStatus)));
    });

    console.log('[PDF Job] Job status uploaded');

    // Trigger background function via fetch (fire and forget)
    const backgroundUrl = `${event.headers.origin || 'https://final-banner-site.netlify.app'}/.netlify/functions/render-order-pdf-background`;
    
    const backgroundPayload = {
      ...req,
      jobId,
      statusPublicId
    };

    console.log('[PDF Job] Triggering background function');
    
    // Fire and forget - don't wait for response
    fetch(backgroundUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(backgroundPayload)
    }).catch(err => {
      console.error('[PDF Job] Error triggering background function:', err);
    });

    // Return immediately with job ID
    return {
      statusCode: 202, // Accepted
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jobId,
        status: 'pending',
        message: 'PDF generation started. Poll /check-pdf-job for status.',
        checkUrl: `/.netlify/functions/check-pdf-job?jobId=${jobId}`
      })
    };

  } catch (error) {
    console.error('[PDF Job] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to start PDF job',
        message: error.message
      })
    };
  }
};
