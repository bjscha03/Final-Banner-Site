import React from 'react';
import RealisticBannerPreview from '@/components/preview/RealisticBannerPreview';
import { isRealisticBannerItem, normalizeRealisticBannerOrderItem } from '@/lib/preview/realisticBanner';
import { getSmallPreviewSelection } from '@/lib/previewSelection';
import type { OrderItem } from '@/lib/orders/types';

export default function OrderRealisticPreview({ item, className, fallback = null }: { item: OrderItem; className?: string; fallback?: React.ReactNode }) {
  const normalized = normalizeRealisticBannerOrderItem(item);
  if (!isRealisticBannerItem(normalized) || !getSmallPreviewSelection(normalized).url || normalized.design_service_enabled) return <>{fallback}</>;
  return <RealisticBannerPreview item={normalized} className={className} previewSize={600} />;
}
