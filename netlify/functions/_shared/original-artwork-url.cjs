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

module.exports = { isStoredOriginalUrl };
