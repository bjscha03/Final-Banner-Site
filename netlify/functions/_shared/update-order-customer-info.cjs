'use strict';

const EDITABLE_FIELDS = ['email', 'customer_name', 'customer_first_name', 'customer_phone', 'shipping_name', 'shipping_street', 'shipping_street2', 'shipping_city', 'shipping_state', 'shipping_zip', 'shipping_country'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function clean(value, max = 200) {
  if (value == null) return null;
  const normalized = String(value).replace(/[<>\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, max) : null;
}

function normalizeCustomerInfo(body) {
  const values = {};
  for (const field of EDITABLE_FIELDS) values[field] = clean(body[field], field === 'email' ? 254 : 200);
  if (!values.email || !EMAIL.test(values.email)) throw new Error('Enter a valid customer email address');
  values.email = values.email.toLowerCase();
  values.shipping_country = (values.shipping_country || 'US').toUpperCase().slice(0, 2);
  if (!values.customer_name) throw new Error('Customer full name is required');
  if (!values.customer_first_name) values.customer_first_name = values.customer_name.split(' ')[0];
  if (values.customer_phone) values.customer_phone = values.customer_phone.replace(/[^0-9+(). ext-]/gi, '').slice(0, 40);
  return values;
}

async function updateCustomerInfo(sql, orderId, values, changedBy, reason) {
  // One transaction statement locks the order, updates only the allowlist, and appends the audit row.
  const rows = await sql`
    WITH existing AS (
      SELECT * FROM orders WHERE id = ${orderId} FOR UPDATE
    ), updated AS (
      UPDATE orders o SET
        email=${values.email}, customer_name=${values.customer_name}, customer_first_name=${values.customer_first_name},
        customer_phone=${values.customer_phone}, shipping_name=${values.shipping_name}, shipping_street=${values.shipping_street},
        shipping_street2=${values.shipping_street2}, shipping_city=${values.shipping_city}, shipping_state=${values.shipping_state},
        shipping_zip=${values.shipping_zip}, shipping_country=${values.shipping_country}, customer_info_admin_updated_at=NOW()
      FROM existing e WHERE o.id=e.id RETURNING o.*, to_jsonb(e) AS previous_row
    ), audit AS (
      INSERT INTO order_customer_info_audit(order_id, changed_by, previous_values, updated_values, change_reason)
      SELECT id, ${changedBy},
        jsonb_build_object('email',previous_row->'email','customer_name',previous_row->'customer_name','customer_first_name',previous_row->'customer_first_name','customer_phone',previous_row->'customer_phone','shipping_name',previous_row->'shipping_name','shipping_street',previous_row->'shipping_street','shipping_street2',previous_row->'shipping_street2','shipping_city',previous_row->'shipping_city','shipping_state',previous_row->'shipping_state','shipping_zip',previous_row->'shipping_zip','shipping_country',previous_row->'shipping_country'),
        ${JSON.stringify(values)}::jsonb, ${reason} FROM updated RETURNING id
    ) SELECT updated.* FROM updated, audit`;
  return rows[0] || null;
}

module.exports = { EDITABLE_FIELDS, UUID, normalizeCustomerInfo, updateCustomerInfo };
