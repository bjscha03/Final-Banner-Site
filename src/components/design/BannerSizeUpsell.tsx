import React from 'react';
import { ArrowRight, CheckCircle2, Eye } from 'lucide-react';
import {
  BANNER_SIZE_UPSELL_TARGET,
  formatBannerSizeInFeet,
  getBannerAreaIncreasePercent,
  getBannerSizeUpsellState,
} from '@/lib/bannerSizeUpsell';

export interface BannerSizeUpsellProps {
  widthIn: number;
  heightIn: number;
  priceDifferenceCents: number;
  onUpgrade: () => void;
}

function formatPriceDifference(cents: number): string {
  const dollars = Math.max(0, cents) / 100;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: Number.isInteger(dollars) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(dollars);
}

export default function BannerSizeUpsell({
  widthIn,
  heightIn,
  priceDifferenceCents,
  onUpgrade,
}: BannerSizeUpsellProps) {
  const state = getBannerSizeUpsellState(widthIn, heightIn);
  if (state === 'hidden') return null;

  const isSelected = state === 'selected';
  const currentSizeLabel = formatBannerSizeInFeet(widthIn, heightIn);
  const areaIncreasePercent = isSelected
    ? 78
    : getBannerAreaIncreasePercent(widthIn, heightIn);
  const priceDifference = formatPriceDifference(priceDifferenceCents);

  return (
    <section
      aria-label="Larger banner recommendation"
      data-testid="banner-size-upsell"
      data-upsell-state={state}
      className="overflow-hidden rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-orange-50/70 p-3.5 shadow-sm sm:p-4 lg:p-5"
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(150px,0.75fr)_minmax(0,1.6fr)] sm:items-center">
        <div
          aria-hidden="true"
          className="flex min-h-[92px] items-end justify-center gap-1.5 rounded-lg border border-orange-100 bg-white/90 px-2 py-3"
        >
          <div className="flex w-[62px] flex-col items-center gap-1.5">
            <div className="flex h-9 w-14 items-center justify-center rounded border border-dashed border-slate-400 bg-slate-50 px-1 text-center text-[9px] font-bold text-slate-600">
              {isSelected ? "6' × 3'" : currentSizeLabel}
            </div>
            <span className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">
              {isSelected ? 'Popular' : 'Current'}
            </span>
          </div>
          <ArrowRight className="mb-7 h-3.5 w-3.5 shrink-0 text-orange-500" />
          <div className="flex w-[92px] flex-col items-center gap-1.5">
            <div className="flex h-12 w-20 items-center justify-center rounded-md border-2 border-orange-500 bg-orange-50 px-1 text-center text-[11px] font-extrabold text-orange-600 shadow-sm">
              {BANNER_SIZE_UPSELL_TARGET.label}
            </div>
            <span className="text-center text-[8px] font-bold uppercase leading-tight tracking-wide text-orange-600">
              BETTER LONG-DISTANCE VISIBILITY
            </span>
          </div>
        </div>

        <div className="min-w-0">
          <div className="mb-1.5 inline-flex items-center gap-1.5 rounded-full bg-orange-100 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.08em] text-orange-700">
            {isSelected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            BETTER LONG-DISTANCE VISIBILITY
          </div>
          <h3 className="text-base font-extrabold leading-snug text-slate-900 sm:text-lg">
            {isSelected
              ? "Your 8' × 4' banner is set for stronger visibility"
              : 'Make it easier to read from farther away'}
          </h3>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            {isSelected
              ? `You now have ${areaIncreasePercent}% more print area than the popular 6' × 3' size.`
              : `Upgrade to ${BANNER_SIZE_UPSELL_TARGET.label} for ${areaIncreasePercent}% more print area.`}
          </p>

          {!isSelected && (
            <>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-stretch">
                <div
                  data-testid="banner-size-upsell-price"
                  className="flex min-h-11 shrink-0 items-center justify-center rounded-lg border border-orange-200 bg-white px-3 text-lg font-extrabold text-orange-600 sm:min-w-[88px]"
                >
                  +{priceDifference}
                </div>
                <button
                  type="button"
                  data-testid="banner-size-upsell-button"
                  onClick={onUpgrade}
                  className="group inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition-colors hover:bg-orange-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 active:bg-orange-700"
                >
                  Upgrade to {BANNER_SIZE_UPSELL_TARGET.label}
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </button>
              </div>
              <p className="mt-1.5 text-[10px] leading-relaxed text-slate-500">
                Price difference reflects your current quantity, material, finishing options and applied discount.
              </p>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
