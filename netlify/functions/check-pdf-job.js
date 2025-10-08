/**
 * Netlify Function: check-pdf-job
 * Checks the status of a PDF generation job
 */

const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

exports.handler = async (event) => {
  try {
    const params = event.queryStringParameters || {};
    const jobId = params.jobId;

    if (!jobId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing jobId parameter' })
      };
    }

    console.log('[PDF Job Check] Checking status for job:', jobId);

    // Fetch job status from Cloudinary
    const statusPublicId = `pdf_jobs/${jobId}_status`;
    const statusUrl = cloudinary.url(statusPublicId, {
      resource_type: 'raw',
      secure: true
    });

    console.log('[PDF Job Check] Fetching status from:', statusUrl);
    console.log('[PDF Job Check] Status public ID:', statusPublicId);

    const response = await fetch(statusUrl);
    console.log('[PDF Job Check] Response status:', response.status);
    console.log('[PDF Job Check] Response headers:', Object.fromEntries(response.headers.entries()));
    
    if (!response.ok) {
      if (response.status === 404) {
        return {
          statusCode: 404,
          body: JSON.stringify({ 
            error: 'Job not found',
            jobId 
          })
        };
      }
      throw new Error(`Failed to fetch job status: ${response.status}`);
    }

    const jobStatus = await response.json();
    console.log('[PDF Job Check] Status:', jobStatus.status);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jobStatus)
    };

  } catch (error) {
    console.error('[PDF Job Check] Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to check job status',
        message: error.message
      })
    };
  }
};
