import React from 'react';
import type { CartItem } from '@/store/cart';
import BannerPreview from '@/components/cart/StableBannerPreview';
import ThumbnailPreviewWrapper from '@/components/preview/StableThumbnailPreviewWrapper';
import { formatBannerDimensions } from '@/lib/preview/realisticBanner';
import { getSmallPreviewSelection, getExpandedPreviewSelection } from '@/lib/previewSelection';
import { getGrommetModeForPreview, getGrommetLabelForDisplay } from '@/lib/cartGrommet';
import { getItemDisplayName, normalizeOrderItemDisplay } from '@/lib/product-display';
import { usd } from '@/lib/pricing';

/** Keep the saved composition visible on arrival without opening an order dialog. */
export default function CheckoutArtworkSummary({ items, totalCents, editAction, showTotal = true }: {
  items: CartItem[];
  totalCents: number;
  editAction: React.ReactNode;
  showTotal?: boolean;
}) {
  return (
    <section aria-label="Your artwork and order" className="checkout-artwork" data-testid="checkout-artwork-summary">
      <div className="checkout-artwork-heading">
        <div>
          <h2 className="text-lg font-bold text-[#0B1F3A]">Your order</h2>
          <span className="checkout-item-count"> · {items.length} {items.length === 1 ? 'item' : 'items'}</span>
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
            <div key={item.id} className="checkout-artwork-item" data-checkout-artwork-item={item.id}>
              <div className="checkout-artwork-image" style={{ "--checkout-artwork-ratio": item.width_in / item.height_in } as React.CSSProperties}>
                <ThumbnailPreviewWrapper
                  title={title}
                  widthIn={item.width_in}
                  heightIn={item.height_in}
                  className="w-full max-w-[600px]"
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
                  <BannerPreview {...previewProps} imageUrl={small.url} isFinalizedSnapshot={small.isExactComposition} maxSize={600} />
                </ThumbnailPreviewWrapper>
              </div>
              <div className="checkout-artwork-copy">
                <h3>{isBanner ? (item.material === '18oz_double' ? 'Double-sided vinyl banner' : 'Custom vinyl banner') : getItemDisplayName(item)}</h3>
                <p>{isBanner ? bannerSize.feet : details.sizeDisplay} · {details.materialDisplay} · Qty {details.qtyDisplay}</p>
                {isBanner && <p className="checkout-artwork-finishing">{item.material === '18oz_double' ? 'Double-sided' : 'Single-sided'} · Grommets: {getGrommetLabelForDisplay(item, details.grommetsDisplay)}</p>}
              </div>
            </div>
          );
        })}
      </div>
      {showTotal && <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-200 pt-3">
        <div>
          <p className="text-sm font-semibold text-slate-700">Order total</p>
          <p className="text-xs text-slate-500">Including tax</p>
        </div>
        <p className="text-xl font-bold text-[#0B1F3A]">{usd(totalCents / 100)}</p>
      </div>}
    </section>
  );
}
