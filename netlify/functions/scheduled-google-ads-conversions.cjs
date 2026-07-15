const { schedule } = require('@netlify/functions');
const { neon } = require('@neondatabase/serverless');
const { processDueConversions } = require('./_shared/googleAdsConversions.cjs');

async function runScheduledGoogleAdsConversions() {
  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) throw new Error('DATABASE_NOT_CONFIGURED');
  const sql = neon(dbUrl);
  const startedAt = new Date().toISOString();
  const result = await processDueConversions(sql, { limit: Number(process.env.GOOGLE_ADS_WORKER_BATCH_SIZE || 25) });
  const counts = result.results.reduce((acc, row) => {
    acc[row.status] = (acc[row.status] || 0) + 1;
    return acc;
  }, {});
  console.log('[scheduled-google-ads-conversions]', JSON.stringify({
    startedAt,
    processed: result.processed,
    uploaded: counts.uploaded || 0,
    skipped: (counts.browser_recorded || 0) + (counts.missing_click_identifier || 0) + (counts.unsupported_upload_method || 0),
    retried: counts.retry || 0,
    permanentFailed: counts.permanent_failure || 0,
    missingClickIdentifier: counts.missing_click_identifier || 0,
    unsupportedUploadMethod: counts.unsupported_upload_method || 0,
  }));
  return result;
}

exports.runScheduledGoogleAdsConversions = runScheduledGoogleAdsConversions;
exports.handler = schedule('@hourly', async () => {
  try {
    const result = await runScheduledGoogleAdsConversions();
    return { statusCode: 200, body: JSON.stringify(result) };
  } catch (error) {
    console.error('[scheduled-google-ads-conversions] failed', error);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: error.message }) };
  }
});
