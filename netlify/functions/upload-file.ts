import type { Handler } from '@netlify/functions';
import * as multipart from 'parse-multipart';
import { v2 as cloudinary } from 'cloudinary';

const MAX_BYTES = 100 * 1024 * 1024;
const ALLOWED = ['application/pdf','image/jpeg','image/jpg','image/png'];

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key:    process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

export const handler: Handler = async (event) => {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      return { statusCode: 500, body: 'Cloudinary credentials missing (set CLOUDINARY_* env vars).' };
    }

    const ct = event.headers['content-type'] || event.headers['Content-Type'] || '';
    if (!ct.includes('multipart/form-data')) {
      return { statusCode: 400, body: `Bad Content-Type. Got: ${ct}` };
    }

    const boundary = multipart.getBoundary(ct);
    if (!boundary) return { statusCode: 400, body: 'Missing multipart boundary' };
    if (!event.body) return { statusCode: 400, body: 'Empty body' };

    const buf = event.isBase64Encoded ? Buffer.from(event.body, 'base64') : Buffer.from(event.body, 'utf8');

    let parts;
    try {
      parts = multipart.Parse(buf, boundary);
    } catch (e: any) {
      return { statusCode: 400, body: `Multipart parse error: ${e?.message}` };
    }

    const filePart = parts.find(p => p.filename && p.data);
    if (!filePart) return { statusCode: 400, body: 'No file field named "file" found' };

    const { filename, type, data } = filePart;

    if (data.byteLength > MAX_BYTES) return { statusCode: 413, body: `File too large. Max ${MAX_BYTES} bytes` };
    if (type && !ALLOWED.includes(type)) return { statusCode: 415, body: `Unsupported media type: ${type}` };

    const folder = process.env.CLOUDINARY_FOLDER || 'uploads';
    const resourceType = 'auto';

    const result = await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        { folder, resource_type: resourceType, filename_override: sanitize(filename), use_filename: true, unique_filename: true },
        (err, res) => (err || !res) ? reject(err || new Error('No result from Cloudinary')) : resolve({ secure_url: res.secure_url!, public_id: res.public_id! })
      );
      stream.end(data);
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secureUrl: result.secure_url, publicId: result.public_id, fileKey: result.public_id }),
    };
  } catch (e: any) {
    console.error('Cloudinary upload error:', e);
    return { statusCode: 500, body: `Server error: ${e?.message || 'unknown'}` };
  }
};

function sanitize(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 150);
}
