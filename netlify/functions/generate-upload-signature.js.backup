// netlify/functions/generate-upload-signature.js
import { v2 as cloudinary } from 'cloudinary';
import { v4 as uuidv4 } from 'uuid';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export const handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return json(405, { success: false, error: "Method Not Allowed" });
  }

  try {
    // Check Cloudinary configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error("Cloudinary environment variables not set.");
      return json(500, { success: false, error: "Cloudinary configuration missing." });
    }

    const body = JSON.parse(event.body || '{}');
    const { filename, fileType } = body;

    if (!filename) {
      return json(400, { success: false, error: "Filename is required" });
    }

    // Validate file type
    const isValidPdf = fileType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');
    const isValidImage = /^image\/(jpeg|png|jpg)$/i.test(fileType) || /\.(jpg|jpeg|png)$/i.test(filename);
    
    if (!isValidPdf && !isValidImage) {
      return json(400, { 
        success: false, 
        error: `Only PDF, JPG, JPEG, or PNG files are allowed. Detected type: ${fileType || "unknown"}` 
      });
    }

    // Generate unique public ID
    const publicId = `banner-uploads/${uuidv4()}-${filename.replace(/\.[^/.]+$/, "")}`;
    
    // Determine resource type
    const resourceType = isValidPdf ? 'raw' : 'image';
    
    // Generate timestamp for signature
    const timestamp = Math.round(new Date().getTime() / 1000);
    
    // Upload parameters
    const uploadParams = {
      public_id: publicId,
      folder: 'banner-uploads',
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true,
      overwrite: false,
      timestamp: timestamp
    };

    // Generate signature
    const signature = cloudinary.utils.api_sign_request(uploadParams, process.env.CLOUDINARY_API_SECRET);

    console.log(`Generated upload signature for: ${filename}, resource_type: ${resourceType}`);

    return json(200, {
      success: true,
      uploadParams: {
        ...uploadParams,
        signature,
        api_key: process.env.CLOUDINARY_API_KEY,
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME
      },
      uploadUrl: `https://api.cloudinary.com/v1_1/${process.env.CLOUDINARY_CLOUD_NAME}/${resourceType}/upload`
    });

  } catch (e) {
    console.error("Error generating upload signature:", e);
    return json(500, { 
      success: false, 
      error: `Failed to generate upload signature: ${e.message}` 
    });
  }
};

function json(status, body) {
  return {
    statusCode: status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Origin, Content-Type, Accept",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
    body: JSON.stringify(body),
  };
}
