import React from 'react';
import RealisticBannerPreview from '@/components/preview/RealisticBannerPreview';
import { normalizeRealisticBannerOrderItem } from '@/lib/preview/realisticBanner';
import type { OrderItem } from '@/lib/orders/types';

export default function OrderRealisticPreview({ item }: { item: OrderItem }) {
  return <RealisticBannerPreview item={normalizeRealisticBannerOrderItem(item)} previewSize={600} />;
}
