import React from 'react';
import { formatBannerDimensions } from '@/lib/preview/realisticBanner';

export default function BannerDimensions({ widthIn, heightIn }: { widthIn: number; heightIn: number }) {
  const size = formatBannerDimensions(widthIn, heightIn);
  return <span data-banner-dimensions>
    <span className="block font-semibold">{size.feet}</span>
    <span className="block text-xs font-normal text-slate-500">{size.inches}</span>
  </span>;
}
