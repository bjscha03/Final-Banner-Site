const multipart = require('parse-multipart');
const { v2: cloudinary } = require('cloudinary');

const MAX_BYTES = 200 * 1024 * 1024;
const ALLOWED = ['application/pdf','image/jpeg','image/jpg','image/png'];

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

    const boundary = multipart.getBoundary(ct);
    if (!boundary) {
      console.log('Missing multipart boundary');
      return { statusCode: 400, body: 'Missing multipart boundary' };
    }
    
    if (!event.body) {
      console.log('Empty body');
      return { statusCode: 400, body: 'Empty body' };
    }

    console.log('Parsing multipart data...');
    const buf = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body, 'utf8');
    console.log('Buffer size:', buf.length, 'bytes');

    let parts;
    try {
      parts = multipart.Parse(buf, boundary);
      console.log('Multipart parsed successfully, parts:', parts.length);
    } catch (e) {
      console.error('Multipart parse error:', e);
      return { statusCode: 400, body: 'Multipart parse error: ' + (e && e.message ? e.message : 'unknown') };
    }

    const filePart = parts.find(p => p.filename && p.data);
    if (!filePart) {
      console.log('No file part found');
      return { statusCode: 400, body: 'No file field named "file" found' };
    }

    const filename = filePart.filename;
    const type = filePart.type;
    const data = filePart.data;
    
    console.log('File details:', {
      filename: filename,
      type: type,
      size: data.byteLength,
      maxAllowed: MAX_BYTES
    });

    if (data.byteLength > MAX_BYTES) {
      console.log('File too large:', data.byteLength, '>', MAX_BYTES);
      return { statusCode: 413, body: 'File too large. Max ' + MAX_BYTES + ' bytes' };
    }
    
    if (type && !ALLOWED.includes(type)) {
      console.log('Unsupported media type:', type);
      return { statusCode: 415, body: 'Unsupported media type: ' + type };
    }

    const folder = process.env.CLOUDINARY_FOLDER || 'uploads';
    const resourceType = 'auto';

    console.log('Starting Cloudinary upload...');
    const uploadStartTime = Date.now();

    const result = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { 
          folder: folder, 
          resource_type: resourceType, 
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

function sanitize(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150);
}
