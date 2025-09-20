// netlify/functions/upload-file.js
import Busboy from "busboy";
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
    const bodyBuf = Buffer.from(event.body || "", event.isBase64Encoded ? "base64" : "utf8");
    const bb = Busboy({ headers: event.headers || {} });

    let fileName = "";
    let mime = "";
    let size = 0;
    const chunks = [];

    bb.on("file", (field, stream, info) => {
      if (!["file", "pdf"].includes(field)) { 
        stream.resume(); 
        return; 
      }
      fileName = info.filename || "upload.pdf";
      mime = info.mimeType || info.mime || "";
      
      // Enhanced MIME type detection for PDFs
      if (!mime && fileName.toLowerCase().endsWith('.pdf')) {
        mime = 'application/pdf';
      }
      
      // Additional fallback MIME type detection based on file extension
      if (!mime || mime === 'application/octet-stream') {
        const ext = fileName.toLowerCase().split('.').pop();
        switch (ext) {
          case 'pdf':
            mime = 'application/pdf';
            break;
          case 'jpg':
          case 'jpeg':
            mime = 'image/jpeg';
            break;
          case 'png':
            mime = 'image/png';
            break;
        }
      }
      
      console.log(`Processing file: ${fileName}, detected MIME: ${mime}, field: ${field}, size will be tracked`);
      
      stream.on("data", (d) => { 
        chunks.push(d); 
        size += d.length; 
        if (size > 100 * 1024 * 1024) { // 100MB limit
          console.error(`File too large: ${size} bytes exceeds 100MB limit`);
          stream.destroy(new Error("MAX_SIZE")); 
        }
      });
      
      stream.on("error", (err) => {
        console.error("Stream error:", err);
      });
    });

    await new Promise((res, rej) => { 
      bb.on("finish", res); 
      bb.on("error", rej); 
      bb.end(bodyBuf); 
    });

    if (!fileName) {
      console.error("No file provided in request");
      return json(400, { success: false, error: "No file provided. Use field name 'file'." });
    }
    
    console.log(`File validation - Name: ${fileName}, MIME: ${mime}, Size: ${size} bytes`);
    
    // More flexible MIME type validation
    const isValidPdf = mime === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf');
    const isValidImage = /^image\/(jpeg|png|jpg)$/i.test(mime) || /\.(jpg|jpeg|png)$/i.test(fileName);
    
    if (!isValidPdf && !isValidImage) {
      console.error(`Invalid file type - MIME: ${mime}, Filename: ${fileName}`);
      return json(400, { success: false, error: `Only PDF, JPG, JPEG, or PNG files are allowed. Detected type: ${mime || "unknown"}. Please ensure your file has the correct extension.` });
    }

    const buffer = Buffer.concat(chunks);
    console.log(`Buffer created successfully - Final size: ${buffer.length} bytes`);

    // Check Cloudinary configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error("Cloudinary environment variables not set.");
      return json(500, { success: false, error: "Cloudinary configuration missing." });
    }

    console.log("Uploading to Cloudinary:", fileName, "Size:", buffer.length, "Type:", mime);

    try {
      // Generate unique public ID
      const publicId = `banner-uploads/${uuidv4()}-${fileName.replace(/\.[^/.]+$/, "")}`;
      
      // Determine resource type based on file type - be more flexible
      const resourceType = (isValidPdf) ? 'raw' : 'image';
      
      console.log(`Cloudinary upload config - Resource type: ${resourceType}, Public ID: ${publicId}`);
      
      // Upload to Cloudinary with increased timeout and better error handling
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: resourceType,
            public_id: publicId,
            folder: 'banner-uploads',
            use_filename: true,
            unique_filename: true,
            overwrite: false,
            timeout: 120000, // 2 minute timeout for large files
          },
          (error, result) => {
            if (error) {
              console.error("Cloudinary upload error:", error);
              reject(error);
            } else {
              console.log("Cloudinary upload success:", result.secure_url);
              resolve(result);
            }
          }
        );
        
        uploadStream.end(buffer);
      });

      return json(200, { 
        success: true, 
        filename: fileName, 
        size: buffer.length, 
        fileUrl: uploadResult.secure_url,
        fileKey: uploadResult.public_id,
        cloudinaryId: uploadResult.public_id
      });

    } catch (cloudinaryError) {
      console.error("Error uploading to Cloudinary:", cloudinaryError);
      return json(500, { 
        success: false, 
        error: `Failed to upload file to Cloudinary: ${cloudinaryError.message}` 
      });
    }

  } catch (e) {
    const msg = e?.message || String(e);
    console.error("General error in upload-file function:", e);
    return json(msg === "MAX_SIZE" ? 400 : 500, { 
      success: false, 
      error: msg === "MAX_SIZE" ? "File size must be less than 100MB" : `Upload failed: ${msg}` 
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
