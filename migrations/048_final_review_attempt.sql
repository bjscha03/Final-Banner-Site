-- Final reminder uses the existing email_kind history (value: final).
-- A thank-you coupon after the final reminder does not require a Google review.
ALTER TABLE review_coupon_rewards ALTER COLUMN review_verified_at DROP NOT NULL;
