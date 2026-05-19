const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

let cachedClient = null;

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getR2Client() {
  if (cachedClient) return cachedClient;

  const accountId = getRequiredEnv('R2_ACCOUNT_ID');
  const accessKeyId = getRequiredEnv('R2_ACCESS_KEY_ID');
  const secretAccessKey = getRequiredEnv('R2_SECRET_ACCESS_KEY');

  cachedClient = new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return cachedClient;
}

async function uploadBufferToR2({ key, body, contentType, cacheControl = 'public, max-age=31536000, immutable' }) {
  const bucket = getRequiredEnv('R2_BUCKET');
  const publicBaseUrl = getRequiredEnv('R2_PUBLIC_BASE_URL');

  const client = getR2Client();
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: cacheControl,
  }));

  return `${publicBaseUrl.replace(/\/$/, '')}/${key}`;
}

module.exports = {
  getR2Client,
  uploadBufferToR2,
};
