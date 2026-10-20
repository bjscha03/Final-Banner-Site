'use strict';
const { CARRIER_DELIVERY_NOTE, getOrderDeliveryEstimate } = require('./delivery/orderEstimate.cjs');
const { escapeHtml } = require('./legacy/email-template.cjs');

function renderOrderDeliveryEstimate(order) {
  const estimate = getOrderDeliveryEstimate(order);
  const dates = estimate.shipments
    ? estimate.shipments.map(shipment => `<p style="margin:12px 0 4px;font-size:13px;font-weight:700;color:#475569;">${escapeHtml(shipment.label)}</p><p style="margin:0;font-size:20px;font-weight:700;color:#0f172a;">${escapeHtml(shipment.deliveryLabel)}</p><p style="margin:6px 0 0;font-size:13px;color:#475569;">Expected shipment: ${escapeHtml(shipment.shipLabel)}</p>`).join('')
    : `<p style="margin:0;font-size:20px;line-height:1.4;font-weight:700;color:#0f172a;">${escapeHtml(estimate.deliveryLabel || 'We will confirm your delivery estimate')}</p>${estimate.shipLabel ? `<p style="margin:6px 0 0;font-size:13px;color:#475569;">Expected shipment: ${escapeHtml(estimate.shipLabel)}</p>` : ''}`;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="margin:16px 0;background:#fff7ed;border:1px solid #fed7aa;border-radius:10px;">
    <tr><td style="padding:16px;">
      <p style="margin:0 0 6px;font-size:12px;font-weight:700;color:#9a3412;text-transform:uppercase;letter-spacing:0.4px;">Expected delivery</p>
      ${dates}
      ${(estimate.shipments || order.items?.some(item => item.design_service_enabled)) ? `<p style="margin:6px 0 0;font-size:12px;color:#64748b;">${escapeHtml(estimate.note)}</p>` : ''}
      <p style="margin:10px 0 0;font-size:12px;line-height:1.6;color:#64748b;">${escapeHtml(CARRIER_DELIVERY_NOTE)}</p>
    </td></tr></table>`;
}
module.exports = { renderOrderDeliveryEstimate };
