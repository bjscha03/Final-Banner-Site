const Busboy = require('busboy');
const { v2: cloudinary } = require('cloudinary');

const MAX_BYTES = 200 * 1024 * 1024;
const ALLOWED = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

function buildPdfPreviewUrl(url) {
  if (!url || !/\.pdf(?:$|[?#])/i.test(url) || !url.includes('/image/upload/')) return null;
  const transformed = url.replace('/upload/', '/upload/pg_1,f_jpg,q_auto:good,w_1600,c_limit/');
  return transformed.replace(/\.pdf(?=($|[?#]))/i, '.jpg');
}

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

    const bodyBuffer = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body, 'binary');

    console.log('Body buffer size:', bodyBuffer.length, 'bytes');

    const parseResult = await parseMultipart(ct, bodyBuffer);

    if (!parseResult.file) {
      console.log('No file found in request');
      return { statusCode: 400, body: 'No file field found in request' };
    }

    const { filename, mimeType, data } = parseResult.file;
    const isPdf = mimeType === 'application/pdf' || filename.toLowerCase().endsWith('.pdf');

    console.log('File details:', {
      filename,
      mimeType,
      isPdf,
      size: data.length,
      maxAllowed: MAX_BYTES
    });

    if (data.length > MAX_BYTES) {
      console.log('File too large:', data.length, '>', MAX_BYTES);
      return { statusCode: 413, body: 'File too large. Max ' + MAX_BYTES + ' bytes' };
    }

    if (mimeType && !ALLOWED.includes(mimeType.toLowerCase())) {
      const ext = filename.split('.').pop()?.toLowerCase();
      const allowedExts = ['jpg', 'jpeg', 'png', 'pdf'];
      if (!allowedExts.includes(ext || '')) {
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
          folder,
          // PDFs are intentionally stored as Cloudinary image-type assets.
          // This preserves the original PDF bytes for production rendering while
          // allowing a permanent first-page JPG thumbnail to be delivered by CDN.
          resource_type: 'image',
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
              resource_type: res.resource_type,
              uploadTime: Date.now() - uploadStartTime + 'ms'
            });
            resolve({
              secure_url: res.secure_url,
              public_id: res.public_id,
              bytes: res.bytes || data.length,
              width: res.width || null,
              height: res.height || null,
              format: res.format || filename.split('.').pop()?.toLowerCase(),
              resource_type: res.resource_type,
            });
          }
        }
      );
      stream.end(data);
    });

    const previewUrl = isPdf ? buildPdfPreviewUrl(result.secure_url) : result.secure_url;

    console.log('Upload function completed successfully', {
      previewUrlPresent: Boolean(previewUrl),
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        secureUrl: result.secure_url,
        productionUrl: result.secure_url,
        previewUrl,
        thumbnailUrl: previewUrl,
        publicId: result.public_id,
        productionPublicId: result.public_id,
        fileKey: result.public_id,
        bytes: result.bytes,
        width: result.width,
        height: result.height,
        format: result.format,
        resource_type: result.resource_type,
        mimeType,
        originalPreserved: true,
      }),
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

exports._test = { buildPdfPreviewUrl };
