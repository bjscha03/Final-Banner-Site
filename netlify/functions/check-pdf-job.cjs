/**
 * Netlify Function: check-pdf-job
 * Checks the status of a PDF generation job
 */

const cloudinary = require('cloudinary').v2;
const https = require('https');

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
    const statusPublicId = `job_status/${jobId}_status`;
    
    // Construct URL manually
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME || 'dtrxl120u';
    const statusUrl = `https://res.cloudinary.com/${cloudName}/raw/upload/${statusPublicId}`;

    console.log('[PDF Job Check] Fetching status from:', statusUrl);

    // Use https module instead of fetch
    const content = await new Promise((resolve, reject) => {
      https.get(statusUrl, (res) => {
        console.log('[PDF Job Check] Response status:', res.statusCode);
        
        if (res.statusCode === 404) {
          reject(new Error('Job not found'));
          return;
        }
        
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve(data));
      }).on('error', reject);
    });

    const jobStatus = JSON.parse(content);
    console.log('[PDF Job Check] Status:', jobStatus.status);

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(jobStatus)
    };

  } catch (error) {
    console.error('[PDF Job Check] Error:', error.message);
    
    if (error.message === 'Job not found') {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: 'Job not found',
          jobId
        })
      };
    }
    
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: 'Failed to check job status',
        message: error.message
      })
    };
  }
};
