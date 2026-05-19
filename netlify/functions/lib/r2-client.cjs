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
    endpoint: process.env.R2_ENDPOINT || `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return cachedClient;
}

async function uploadBufferToR2({ key, body, contentType, cacheControl = 'public, max-age=31536000, immutable' }) {
  const bucket = getRequiredEnv('R2_BUCKET_NAME');
  const endpoint = getRequiredEnv('R2_ENDPOINT');

  const client = getR2Client();
  await client.send(new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: body,
    ContentType: contentType,
    CacheControl: cacheControl,
  }));

  let url = null;
  try {
    const u = new URL(endpoint);
    const isCloudflareR2Host = u.hostname.endsWith('r2.cloudflarestorage.com');
    if (!isCloudflareR2Host) {
      url = `${endpoint.replace(/\/$/, '')}/${key}`;
    }
  } catch (_) {}

  return { key, bucket, url };
}

module.exports = {
  getR2Client,
  uploadBufferToR2,
};
