'use strict';

// Read the entire customer's reward history, not just the current page/order.
// A payment reservation alone is not a completed redemption.
async function loadCustomerReviewState(sql, orderIds) {
  if (!orderIds.length) return [];
  return sql`
    SELECT target.id::text AS order_id,
      EXISTS (
        SELECT 1 FROM review_coupon_rewards reward
        JOIN discount_codes discount ON discount.code = reward.code
        JOIN orders original ON original.id = reward.order_id
        LEFT JOIN orders redeemed ON redeemed.id = discount.order_id
        WHERE discount.used = TRUE
          AND (
            LOWER(BTRIM(reward.customer_email)) = LOWER(BTRIM(target.email))
            OR LOWER(BTRIM(reward.customer_email)) = LOWER(BTRIM(profile.email))
            OR (target.user_id IS NOT NULL AND original.user_id = target.user_id)
            OR (target.user_id IS NOT NULL AND discount.used_by_user_id = target.user_id)
          )
          AND (
            COALESCE(cardinality(discount.used_by_email), 0) > 0
            OR discount.used_by_user_id IS NOT NULL
            OR LOWER(redeemed.status) IN ('paid', 'in_production', 'shipped', 'delivered', 'fulfilled', 'refunded')
            OR (LOWER(redeemed.status) = 'pending' AND LOWER(redeemed.payment_reconciliation_status) IN ('complete', 'completed'))
          )
      ) AS review_customer_completed
    FROM orders target LEFT JOIN profiles profile ON profile.id = target.user_id
    WHERE target.id = ANY(${orderIds}::uuid[])
  `;
}

module.exports = { loadCustomerReviewState };
