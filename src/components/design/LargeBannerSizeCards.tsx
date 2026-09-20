import React from 'react';
import { calculateBannerUnitBasePriceCents } from '@/lib/bannerPricingEngine';
import { usd } from '@/lib/pricing';
import type { MaterialKey } from '@/store/quote';
import { LARGE_BANNER_PROMOTION_ENABLED, isQualifyingLargeBannerDimensions } from '@/lib/largeBannerPromotion';

export const LARGE_BANNER_SIZES = [
  { w: 120, h: 48 }, { w: 144, h: 48 }, { w: 192, h: 48 },
  { w: 240, h: 60 }, { w: 240, h: 120 }, { w: 360, h: 120 },
];

interface Props {
  widthIn: number;
  heightIn: number;
  unit: 'in' | 'ft';
  material: MaterialKey;
  onSelect: (widthIn: number, heightIn: number) => void;
}

export default function LargeBannerSizeCards({ widthIn, heightIn, unit, material, onSelect }: Props) {
  return <div role="group" aria-label="Large banner sizes">
    <p className="mb-4 text-sm text-slate-600">Choose a size below or enter your own dimensions. Sizes shown as width × height. Illustrations show shape, not relative scale.</p>
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {LARGE_BANNER_SIZES.map(({ w, h }) => {
        const selected = widthIn === w && heightIn === h;
        const label = unit === 'ft' ? `${w / 12} × ${h / 12} ft` : `${w} × ${h} in`;
        // Each illustration preserves its physical aspect ratio within the same frame.
        const scale = Math.min(156 / w, 64 / h);
        const sw = w * scale, sh = h * scale;
        const x = (180 - sw) / 2, y = (88 - sh) / 2;
        const offer = LARGE_BANNER_PROMOTION_ENABLED && isQualifyingLargeBannerDimensions(w, h, 'banner');
        return <button key={`${w}-${h}`} type="button" aria-pressed={selected}
          aria-label={`Select ${w / 12} by ${h / 12} foot banner`}
          onClick={() => onSelect(w, h)}
          className={`relative flex min-w-0 flex-col items-center rounded-xl border-2 px-3 py-4 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 ${selected ? 'border-orange-500 bg-orange-50 text-[#061A31]' : 'border-slate-200 bg-white text-[#061A31] hover:border-orange-300 hover:bg-orange-50/40'}`}>
          <span className={`mb-1 h-4 text-[10px] font-bold uppercase tracking-wide ${selected ? 'text-orange-700' : 'text-transparent'}`} aria-hidden="true">Selected</span>
          <svg viewBox="0 0 180 88" className="h-20 w-full" aria-hidden="true">
            <rect x={x + 3} y={y + 3} width={sw} height={sh} rx="1" fill="#e2e8f0" />
            <rect x={x} y={y} width={sw} height={sh} rx="1" fill="#fff" stroke="#10243e" strokeWidth="1.5" />
            {[ [x + 4, y + 4], [x + sw - 4, y + 4], [x + 4, y + sh - 4], [x + sw - 4, y + sh - 4] ].map(([cx, cy], i) => <circle key={i} cx={cx} cy={cy} r="1.5" fill="white" stroke="#94a3b8" />)}
          </svg>
          <span className="mt-2 text-base font-bold sm:text-lg">{label}</span>
          <span className="mt-1 text-sm font-semibold">{usd(calculateBannerUnitBasePriceCents(w * h / 144, material) / 100)} base / banner</span>
          {offer && <span className="mt-1 text-xs font-semibold text-orange-700">25% off automatically</span>}
        </button>;
      })}
    </div>
    <p className="mt-3 text-xs text-slate-500">Base prices use your selected material, before discounts, tax and optional finishing. Your order total updates below.</p>
  </div>;
}
