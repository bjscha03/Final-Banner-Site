const Busboy = require('busboy');
const { v2: cloudinary } = require('cloudinary');

const MAX_BYTES = 200 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

exports.handler = async (event) => {
  console.log('Upload function started:', {
    method: event.httpMethod,
    contentType: event.headers['content-type'] || event.headers['Content-Type'],
    bodySize: event.body ? event.body.length : 0,
    isBase64: event.isBase64Encoded
  });

  try {
    if (event.httpMethod !== 'POST') {
      console.log('Method not allowed:', event.httpMethod);
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      console.error('Missing Cloudinary credentials');
      return { statusCode: 500, body: 'Cloudinary credentials missing' };
    }

    const ct = event.headers['content-type'] || event.headers['Content-Type'] || '';
    if (!ct.includes('multipart/form-data')) {
      console.log('Bad content type:', ct);
      return { statusCode: 400, body: 'Bad Content-Type. Got: ' + ct };
    }

    if (!event.body) {
      console.log('Empty body');
      return { statusCode: 400, body: 'Empty body' };
    }

    // Decode body if base64 encoded (common for binary data in Lambda/Netlify)
    const bodyBuffer = event.isBase64Encoded 
      ? Buffer.from(event.body, 'base64') 
      : Buffer.from(event.body, 'binary');
    
    console.log('Body buffer size:', bodyBuffer.length, 'bytes');

    // Parse multipart form data using Busboy
    const parseResult = await parseMultipart(ct, bodyBuffer);
    
    if (!parseResult.file) {
      console.log('No file found in request');
      return { statusCode: 400, body: 'No file field found in request' };
    }

    const { filename, mimeType, data } = parseResult.file;
    
    console.log('File details:', {
      filename: filename,
      mimeType: mimeType,
      size: data.length,
      maxAllowed: MAX_BYTES
    });

    if (data.length > MAX_BYTES) {
      console.log('File too large:', data.length, '>', MAX_BYTES);
      return { statusCode: 413, body: 'File too large. Max ' + MAX_BYTES + ' bytes' };
    }
    
    // More permissive type checking - allow if type is missing or matches allowed list
    if (mimeType && !ALLOWED.includes(mimeType.toLowerCase())) {
      // Check if it's an image by extension as fallback
      const ext = filename.split('.').pop()?.toLowerCase();
      const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'pdf'];
      if (!imageExts.includes(ext || '')) {
        console.log('Unsupported media type:', mimeType);
        return { statusCode: 415, body: 'Unsupported media type: ' + mimeType };
      }
      console.log('Type not in allowed list but extension is valid:', ext);
    }

    const folder = process.env.CLOUDINARY_FOLDER || 'uploads';

    console.log('Starting Cloudinary upload...');
    const uploadStartTime = Date.now();

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { 
          folder: folder, 
          resource_type: 'auto', 
          filename_override: sanitize(filename), 
          use_filename: true, 
          unique_filename: true,
          timeout: 60000
        },
        (err, res) => {
          if (err) {
            console.error('Cloudinary upload error:', err);
            reject(err);
          } else if (!res) {
            console.error('No result from Cloudinary');
            reject(new Error('No result from Cloudinary'));
          } else {
            console.log('Cloudinary upload successful:', {
              public_id: res.public_id,
              secure_url: res.secure_url,
              uploadTime: Date.now() - uploadStartTime + 'ms'
            });
            resolve({ secure_url: res.secure_url, public_id: res.public_id });
          }
        }
      );
      stream.end(data);
    });

    console.log('Upload function completed successfully');
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secureUrl: result.secure_url, publicId: result.public_id, fileKey: result.public_id }),
    };
  } catch (e) {
    console.error('Upload function error:', {
      message: e && e.message ? e.message : 'unknown',
      stack: e && e.stack ? e.stack : 'no stack',
      name: e && e.name ? e.name : 'unknown'
    });
    return { statusCode: 500, body: 'Server error: ' + (e && e.message ? e.message : 'unknown') };
  }
};

// Parse multipart form data using Busboy (more robust than parse-multipart)
function parseMultipart(contentType, bodyBuffer) {
  return new Promise((resolve, reject) => {
    const result = { file: null };
    
    try {
      const busboy = Busboy({ 
        headers: { 'content-type': contentType },
        limits: { fileSize: MAX_BYTES }
      });
      
      const chunks = [];
      let fileInfo = null;
      
      busboy.on('file', (fieldname, stream, info) => {
        const { filename, encoding, mimeType } = info;
        console.log('Busboy file event:', { fieldname, filename, encoding, mimeType });
        fileInfo = { filename, mimeType };
        
        stream.on('data', (chunk) => {
          chunks.push(chunk);
        });
        
        stream.on('end', () => {
          console.log('Busboy file stream ended, total chunks:', chunks.length);
        });
      });
      
      busboy.on('finish', () => {
        console.log('Busboy parsing finished');
        if (fileInfo && chunks.length > 0) {
          result.file = {
            filename: fileInfo.filename,
            mimeType: fileInfo.mimeType,
            data: Buffer.concat(chunks)
          };
        }
        resolve(result);
      });
      
      busboy.on('error', (err) => {
        console.error('Busboy error:', err);
        reject(err);
      });
      
      // Write the buffer to busboy
      busboy.end(bodyBuffer);
      
    } catch (err) {
      console.error('Busboy setup error:', err);
      reject(err);
    }
  });
}

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150);
}
