'use strict';

const { createSql, getDatabaseUrl, isMissingOutboundSchema } = require('./database.cjs');
const repository = require('./manual-artwork-repository.cjs');
const artworkModule = require('./manual-artwork.cjs');
const { appendAudit } = require('./audit.cjs');
const { json, authorize, parseJsonBody, redactSecretText, safeFailure } = require('./security.cjs');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_JSON_BODY_BYTES = 5_850_000;

function decodeBase64Image(value) {
  const source = String(value || '').trim();
  const payload = source.replace(/^data:image\/(?:jpeg|jpg|png|webp);base64,/i, '');
  if (!payload || payload.length > 5_600_000 || !/^[a-z0-9+/]+={0,2}$/i.test(payload)) {
    throw Object.assign(new Error('The uploaded image data is invalid or too large.'), { code: 'INVALID_MANUAL_ARTWORK' });
  }
  const buffer = Buffer.from(payload, 'base64');
  if (!buffer.length || buffer.toString('base64').replace(/=+$/, '') !== payload.replace(/=+$/, '')) {
    throw Object.assign(new Error('The uploaded image data is invalid.'), { code: 'INVALID_MANUAL_ARTWORK' });
  }
  return buffer;
}

function createManualArtworkHandler(options = {}) {
  const dependencies = {
    createSql,
    appendAudit,
    ...repository,
    ...artworkModule,
    ...options.dependencies,
  };
  const env = options.env || process.env;
  return async function manualArtworkHandler(event) {
    if (event.httpMethod === 'OPTIONS') return json(204, {});
    const mutating = event.httpMethod === 'POST';
    const auth = authorize(event, { requireOrigin: mutating });
    if (auth.response) return auth.response;
    if (!['GET', 'POST'].includes(event.httpMethod)) {
      return json(405, { ok: false, error: 'METHOD_NOT_ALLOWED', message: 'Method not allowed.' }, { Allow: 'GET, POST, OPTIONS' });
    }
    if (!getDatabaseUrl(env)) {
      return safeFailure(Object.assign(new Error('Database is not configured.'), { code: 'DATABASE_NOT_CONFIGURED' }));
    }
    try {
      const input = event.httpMethod === 'POST'
        ? parseJsonBody(event, MAX_JSON_BODY_BYTES)
        : (event.queryStringParameters || {});
      const prospectId = String(input.prospectId || '').trim();
      if (!UUID_PATTERN.test(prospectId)) {
        throw Object.assign(new Error('Prospect ID is invalid.'), { code: 'INVALID_MANUAL_ARTWORK' });
      }
      const sql = dependencies.createSql(env);
      const store = options.getStore ? options.getStore() : options.store;
      if (event.httpMethod === 'GET') {
        const artwork = await dependencies.loadVerifiedManualArtwork({
          sql, prospectId, store, sharp: options.sharp,
          dependencies,
        });
        return {
          statusCode: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Disposition': 'inline; filename="company-banner-concept.jpg"',
            'Cache-Control': 'private, max-age=300',
            'X-Content-Type-Options': 'nosniff',
            'Content-Security-Policy': "default-src 'none'; sandbox",
            Vary: 'Authorization, X-Banners-Admin-Session, Cookie',
          },
          body: artwork.buffer.toString('base64'),
          isBase64Encoded: true,
        };
      }
      const uploadedBy = String(auth.session.email || auth.session.sub || '').trim();
      const artwork = await dependencies.uploadManualArtwork({
        sql,
        prospectId,
        sourceBuffer: decodeBase64Image(input.dataBase64),
        originalFilename: input.fileName,
        eventLabel: input.eventLabel,
        uploadedBy,
        store,
        sharp: options.sharp,
        env,
        cloudinary: options.cloudinary,
        dependencies,
      });
      await dependencies.appendAudit(sql, {
        actorType: 'admin', actorId: uploadedBy,
        action: 'manual_lead.artwork_uploaded', entityType: 'prospect', entityId: prospectId,
        newValues: {
          renderVersion: repository.MANUAL_ARTWORK_RENDER_VERSION,
          contentHash: artwork.contentHash,
          width: artwork.width,
          height: artwork.height,
          emailImageReady: artwork.emailImageReady,
        },
        metadata: {
          source: 'manual_upload',
          originalFilename: String(input.fileName || '').slice(0, 180),
          deliveryProvider: artwork.deliveryAsset?.provider || null,
          deliveryPublicId: artwork.deliveryAsset?.publicId || null,
        },
        requestId: event.headers?.['x-nf-request-id'] || null,
      }).catch(() => null);
      return json(200, {
        ok: true,
        prospectId,
        contentHash: artwork.contentHash,
        previewUrl: artwork.publicUrl,
        sendReady: true,
        width: artwork.width,
        height: artwork.height,
      });
    } catch (error) {
      if (isMissingOutboundSchema(error)) {
        return safeFailure(Object.assign(new Error('Manual artwork migration is not ready.'), { code: 'OUTBOUND_SCHEMA_NOT_READY' }));
      }
      console.error('[outbound-sales] manual artwork request failed safely', {
        code: redactSecretText(error?.code || 'OUTBOUND_REQUEST_FAILED').slice(0, 80),
      });
      return safeFailure(error);
    }
  };
}

module.exports = {
  UUID_PATTERN,
  MAX_JSON_BODY_BYTES,
  decodeBase64Image,
  createManualArtworkHandler,
};
