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
      stream.on("data", (d) => { 
        chunks.push(d); 
        size += d.length; 
        if (size > 100 * 1024 * 1024) { // 100MB limit
          stream.destroy(new Error("MAX_SIZE")); 
        }
      });
    });

    await new Promise((res, rej) => { 
      bb.on("finish", res); 
      bb.on("error", rej); 
      bb.end(bodyBuf); 
    });

    if (!fileName) {
      return json(400, { success: false, error: "No file provided. Use field name 'file'." });
    }
    
    if (!/^(application\/pdf|image\/(jpeg|png|jpg))$/i.test(mime)) {
      return json(400, { success: false, error: `Only PDF, JPG, JPEG, or PNG allowed. Got ${mime || "unknown"}` });
    }

    const buffer = Buffer.concat(chunks);

    // Check Cloudinary configuration
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error("Cloudinary environment variables not set.");
      return json(500, { success: false, error: "Cloudinary configuration missing." });
    }

    console.log("Uploading to Cloudinary:", fileName, "Size:", buffer.length, "Type:", mime);

    try {
      // Generate unique public ID
      const publicId = `banner-uploads/${uuidv4()}-${fileName.replace(/\.[^/.]+$/, "")}`;
      
      // Determine resource type based on file type
      const resourceType = mime === 'application/pdf' ? 'raw' : 'image';
      
      // Upload to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          {
            resource_type: resourceType,
            public_id: publicId,
            folder: 'banner-uploads',
            use_filename: true,
            unique_filename: true,
            overwrite: false,
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
      error: msg === "MAX_SIZE" ? "File size must be less than 100MB" : msg 
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
