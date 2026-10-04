import React from 'react';
import type { CartItem } from '@/store/cart';
import BannerPreview from '@/components/cart/StableBannerPreview';
import ThumbnailPreviewWrapper from '@/components/preview/StableThumbnailPreviewWrapper';
import RealisticBannerPreview from '@/components/preview/RealisticBannerPreview';
import BannerDimensions from '@/components/preview/BannerDimensions';
import { formatBannerDimensions } from '@/lib/preview/realisticBanner';
import { getSmallPreviewSelection, getExpandedPreviewSelection } from '@/lib/previewSelection';
import { getGrommetModeForPreview } from '@/lib/cartGrommet';
import { getItemDisplayName, normalizeOrderItemDisplay } from '@/lib/product-display';
import { usd } from '@/lib/pricing';

/** Keep the saved composition visible on arrival without opening an order dialog. */
export default function CheckoutArtworkSummary({ items, totalCents, editAction, compact = false }: {
  items: CartItem[];
  totalCents: number;
  editAction: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section aria-label="Your artwork and order" className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm" data-testid="checkout-artwork-summary">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[#0B1F3A]">Your order</h2>
          <p className="text-sm text-slate-600">Tap your artwork to enlarge.</p>
        </div>
        {editAction}
      </div>
      <div className="divide-y divide-slate-100">
        {items.map((item, index) => {
          const small = getSmallPreviewSelection(item);
          const expanded = getExpandedPreviewSelection(item);
          const details = normalizeOrderItemDisplay(item);
          const isBanner = details.productType === 'banner';
          const bannerSize = formatBannerDimensions(item.width_in, item.height_in);
          const title = isBanner ? `${item.material === '18oz_double' ? 'Double-Sided Banner' : 'Custom Banner'} ${bannerSize.feet}` : getItemDisplayName(item);
          const previewProps = {
            widthIn: item.width_in,
            heightIn: item.height_in,
            grommets: getGrommetModeForPreview(item),
            material: item.material,
            textElements: item.text_elements,
            overlayImage: item.overlay_image,
            imageScale: item.image_scale,
            imageScaleY: item.image_scale_y,
            imagePosition: item.image_position,
            fitMode: item.fit_mode || 'fill' as const,
            designServiceEnabled: item.design_service_enabled,
            source: item.source,
            compositionSignature: item.placement_preview?.compositionSignature || item.composition_signature,
          };
          return (
            <div key={item.id} className={`py-3 first:pt-0 last:pb-0 ${compact ? "grid grid-cols-[80px_minmax(0,1fr)] gap-x-3" : ""}`} data-checkout-artwork-item={item.id}>
              <div className={`flex items-center justify-center rounded-lg bg-slate-50 px-2 py-3 ${compact ? "row-span-2" : ""}`}>
                <ThumbnailPreviewWrapper
                  title={title}
                  widthIn={item.width_in}
                  heightIn={item.height_in}
                  className="max-w-full"
                  ariaLabel={`Enlarge artwork for item ${index + 1}: ${title}`}
                  details={[
                    { label: 'Size', value: isBanner ? `${bannerSize.feet} ${bannerSize.inches}` : details.sizeDisplay },
                    { label: 'Material', value: details.materialDisplay },
                    { label: 'Qty', value: details.qtyDisplay },
                  ]}
                  renderLargePreview={() => (
                    <BannerPreview {...previewProps} imageUrl={expanded.url} isFinalizedSnapshot={expanded.isExactComposition} maxSize={820} />
                  )}
                >
                  <BannerPreview {...previewProps} imageUrl={small.url} isFinalizedSnapshot={small.isExactComposition} maxSize={compact ? 64 : 240} />
                </ThumbnailPreviewWrapper>
              </div>
              {!compact && <div className="mt-3 flex justify-center"><RealisticBannerPreview item={item} /></div>}
              <h3 className="mt-3 text-sm font-semibold text-[#0B1F3A]">{title}</h3>
              <div className="mt-1 text-sm text-slate-600">
                {isBanner ? <BannerDimensions widthIn={item.width_in} heightIn={item.height_in}/> : details.sizeDisplay}
                <p className="mt-1">Qty {details.qtyDisplay} · {details.materialDisplay}</p>
              </div>
            </div>
          );
        })}
      </div>
      {!compact && <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">Order total</p>
          <p className="text-xs text-slate-500">Including tax</p>
        </div>
        <p className="text-xl font-bold text-[#0B1F3A]">{usd(totalCents / 100)}</p>
      </div>}
    </section>
  );
}
