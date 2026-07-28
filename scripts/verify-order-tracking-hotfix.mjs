import fs from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => fs.readFileSync(path, 'utf8');
const orders = read('src/pages/admin/Orders.tsx');
const updateTracking = read('netlify/functions/_shared/legacy/update-tracking.cjs');
const trackingEmail = read('netlify/functions/_shared/legacy/resend-tracking-email.cjs');
const notifyOrder = read('netlify/functions/_shared/legacy/notify-order.cjs');
const orderDetail = read('src/pages/OrderDetail.tsx');
const emailStatus = read('src/components/orders/EmailDeliveryStatus.tsx');
const getOrders = read('netlify/functions/get-orders.mjs');

assert.match(orders, /Send Tracking Email/);
assert.match(orders, /Resend Tracking Email/);
assert.match(orders, /Delete Tracking/);
assert.match(orders, /onDeleteTracking=\{handleDeleteTracking\}/);
assert.match(orders, /shipping_notification_status: 'pending'/);
assert.match(orders, /status: 'shipped' as const/);
assert.doesNotMatch(orders, /\? 'Resend Tracking Email' : 'Resend Tracking Email'/);
assert.doesNotMatch(updateTracking, /nextStatus\s*=\s*'shipped'/);
assert.match(updateTracking, /getNextTrackingStatus/);
assert.match(trackingEmail, /replyTo: emailReplyTo/);
assert.doesNotMatch(trackingEmail, /reply_to\s*:/);
assert.match(trackingEmail, /SET status = 'shipped'/);
assert.match(trackingEmail, /shipping_notification_status = 'sent'/);
assert.match(notifyOrder, /createOrderAccessToken/);
assert.match(notifyOrder, /customerInvoiceUrl/);
assert.match(notifyOrder, /adminInvoiceUrl/);
assert.match(orderDetail, /Verify Your Order/);
assert.match(orderDetail, /order-email-access/);
assert.match(emailStatus, /window\.location\.reload/);
assert.match(getOrders, /getEffectiveWorkflowStatus/);
assert.match(getOrders, /saved-but-unemailed|Saving a tracking number is not the same as shipping/i);

console.log('Order links, email recovery, and tracking workflow release assertions passed.');
