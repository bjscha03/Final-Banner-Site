export const ADMIN_ORDER_DETAIL_CONCURRENCY = 3;

type HydrateAdminOrderPageOptions = {
  orderIds: string[];
  hydrate: (orderId: string) => Promise<void>;
  shouldContinue: () => boolean;
  concurrency?: number;
};

export const hydrateAdminOrderPage = async ({
  orderIds,
  hydrate,
  shouldContinue,
  concurrency = ADMIN_ORDER_DETAIL_CONCURRENCY,
}: HydrateAdminOrderPageOptions): Promise<void> => {
  const pendingOrderIds = Array.from(new Set(orderIds.filter(Boolean)));
  if (pendingOrderIds.length === 0 || !shouldContinue()) return;

  const workerCount = Math.min(
    pendingOrderIds.length,
    Math.max(1, Math.trunc(Number(concurrency)) || 1),
  );
  let nextIndex = 0;

  const worker = async () => {
    while (shouldContinue()) {
      const orderId = pendingOrderIds[nextIndex];
      nextIndex += 1;
      if (!orderId) return;
      await hydrate(orderId);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
};
