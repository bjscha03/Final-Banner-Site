export type CanonicalOrderResponse = {
  ok?: unknown;
  order?: {
    id?: unknown;
    status?: unknown;
  } | null;
};

/**
 * A payment-success URL is only a locator. Success requires an authorized
 * canonical response for that exact order and a paid database status.
 */
export const verifiedPaidOrderId = (
  requestedOrderId: string | null,
  payload: CanonicalOrderResponse,
): string | null => {
  const requested = String(requestedOrderId || '').trim();
  const canonical = String(payload?.order?.id || '').trim();
  const status = String(payload?.order?.status || '').trim().toLowerCase();
  return payload?.ok === true && requested && canonical === requested && status === 'paid'
    ? canonical
    : null;
};
