'use strict';

function isStoredOriginalUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && (url.hostname === 'bannersonthefly.com' || url.hostname === 'www.bannersonthefly.com'
        || url.hostname === 'bannersonthefly.netlify.app' || /^[a-z0-9-]+--bannersonthefly\.netlify\.app$/.test(url.hostname))
      && /^\/artwork-original\/[a-f0-9-]{36}\/original\.(png|jpe?g|pdf)$/.test(url.pathname)
      && !url.username && !url.password && !url.port;
  } catch { return false; }
}

function isCloudinaryOriginalUrl(value) {
  try {
    const url = new URL(value);
    const parts = url.pathname.split('/').filter(Boolean);
    return url.protocol === 'https:' && url.hostname === 'res.cloudinary.com'
      && !url.username && !url.password && !url.port && !url.search && !url.hash
      && parts[0] === (process.env.CLOUDINARY_CLOUD_NAME || 'dtrxl120u')
      && ['image', 'raw'].includes(parts[1]) && parts[2] === 'upload'
      && /^v\d+$/.test(parts[3] || '') && parts[4] === 'uploads'
      && parts.slice(5).length > 0 && parts.slice(5).every(part => /^[a-zA-Z0-9_.-]+$/.test(part))
      && /\.(png|jpe?g|pdf)$/i.test(parts.at(-1));
  } catch { return false; }
}

module.exports = { isStoredOriginalUrl, isCloudinaryOriginalUrl };
