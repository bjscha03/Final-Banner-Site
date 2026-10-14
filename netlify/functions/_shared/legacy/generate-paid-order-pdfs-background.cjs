'use strict';

const { neon } = require('@neondatabase/serverless');

exports.handler = async (event) => {
  const expected = process.env.INTERNAL_JOB_SECRET || process.env.AUTH_SESSION_SECRET;
  const supplied = event.headers?.['x-internal-job-secret'] || event.headers?.['X-Internal-Job-Secret'];
  if (!event.__internal && (!expected || supplied !== expected)) {
    return { statusCode: 401, body: 'Unauthorized' };
  }

  const { orderId, skipNotifications = false } = JSON.parse(event.body || '{}');
  if (!orderId) return { statusCode: 400, body: JSON.stringify({ ok: false, error: 'ORDER_ID_REQUIRED' }) };

  const dbUrl = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!dbUrl) return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'DATABASE_NOT_CONFIGURED' }) };

  const sql = neon(dbUrl);
  const items = await sql`
    SELECT id, width_in, height_in, canvas_state_json, production_pdf_status
      FROM order_items
     WHERE order_id = ${orderId}
       AND COALESCE(production_pdf_status, 'pending') <> 'generated'
  `;

  const renderer = require('./render-order-pdf.cjs');
  let failedCount = 0;

  for (const item of items) {
    try {
      let saved;try{saved=typeof item.canvas_state_json==='string'?JSON.parse(item.canvas_state_json):item.canvas_state_json;}catch{}
      if(saved?.kind==='specialty'){
        const {assertReadyPlacementPreview}=require('../preview-artifact.cjs');
        const panels=saved.configuration?.panels;
        if(!Array.isArray(panels)||!panels.length)throw new Error('Saved product print panels are missing.');
        for(const panel of panels){
          assertReadyPlacementPreview(panel.preview,'specialty panel');
          const {isStoredOriginalUrl}=require('../original-artwork-url.cjs');
          if(!panel.productionFileKey||!(/^https:\/\/res\.cloudinary\.com\//.test(panel.productionUrl||'')||isStoredOriginalUrl(panel.productionUrl)))throw new Error('A product print panel is not saved permanently.');
        }
        // Specialty panels are already exported at the supplier PDF scale.
        // Never send a flag, table throw or multi-panel tent to the banner renderer.
        await sql`UPDATE order_items SET production_pdf_status='generated',production_pdf_error=NULL WHERE id=${item.id}`;
        continue;
      }
      await sql`
        UPDATE order_items
           SET production_pdf_status = 'generating', production_pdf_error = NULL
         WHERE id = ${item.id}
      `;
      const response = await renderer.handler({
        httpMethod: 'POST',
        body: JSON.stringify({
          orderId,
          itemId: item.id,
          bannerWidthIn: item.width_in,
          bannerHeightIn: item.height_in,
          canvasStateJson: item.canvas_state_json,
          format: 'pdf',
        }),
      });
      if (!response || response.statusCode >= 400) {
        throw new Error(`Renderer returned ${response?.statusCode || 'no response'}`);
      }
      await sql`
        UPDATE order_items
           SET production_pdf_status = 'generated', production_pdf_error = NULL
         WHERE id = ${item.id}
      `;
    } catch (error) {
      failedCount += 1;
      await sql`
        UPDATE order_items
           SET production_pdf_status = 'failed',
               production_pdf_error = ${String(error?.message || error).slice(0, 1000)}
         WHERE id = ${item.id}
      `;
      console.error('[production_pdf_job] item_failed', {
        orderId,
        itemId: item.id,
        error: error?.message,
      });
    }
  }

  if (!skipNotifications) {
    try {
      const notification = await require('./notify-order.cjs').handler({
        httpMethod: 'POST',
        headers: event.headers || {},
        body: JSON.stringify({ orderId }),
      });
      if (!notification || notification.statusCode >= 400) {
        throw new Error(`notify-order returned ${notification?.statusCode || 'no response'}`);
      }
    } catch (error) {
      console.error('[production_pdf_job] order_notification_failed', {
        orderId,
        error: error?.message,
      });
    }
  }

  return {
    statusCode: failedCount ? 500 : 200,
    body: JSON.stringify({
      ok: failedCount === 0,
      orderId,
      itemCount: items.length,
      failedCount,
    }),
  };
};
