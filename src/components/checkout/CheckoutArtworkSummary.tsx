import React, { useState } from 'react';
import type { CartItem } from '@/store/cart';
import BannerPreview from '@/components/cart/StableBannerPreview';
import ThumbnailPreviewWrapper from '@/components/preview/StableThumbnailPreviewWrapper';
import { formatBannerDimensions, isRealisticBannerItem } from '@/lib/preview/realisticBanner';
import { RealisticBannerScene } from '@/components/preview/RealisticBannerPreview';
import { getSmallPreviewSelection, getExpandedPreviewSelection } from '@/lib/previewSelection';
import { getGrommetModeForPreview, getGrommetLabelForDisplay } from '@/lib/cartGrommet';
import { getItemDisplayName, normalizeOrderItemDisplay } from '@/lib/product-display';
import { usd } from '@/lib/pricing';
import SavedSpecialtyPreview from '@/components/specialty/SavedSpecialtyPreview';
import SpecialtyPendingPrice from '@/components/specialty/SpecialtyPendingPrice';
import CartLinePrice from '@/components/cart/CartLinePrice';
import {specialtyItemHasVerifiedPrice} from '@/lib/specialtyProducts';

/** Keep the saved composition visible on arrival without opening an order dialog. */
export default function CheckoutArtworkSummary({ items, totalCents, editAction, showTotal = true, linePrices }: {
  items: CartItem[];
  totalCents: number;
  editAction: React.ReactNode;
  showTotal?: boolean;
  linePrices?: Map<string,{originalCents:number;totalCents:number}>;
}) {
  const [printLayoutItems, setPrintLayoutItems] = useState<Record<string, boolean>>({});
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
          const hasRealisticPreview = isRealisticBannerItem(item) && Boolean(small.url) && !item.design_service_enabled;
          const showRealisticPreview = hasRealisticPreview && !printLayoutItems[item.id];
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
              {hasRealisticPreview && <div className="checkout-preview-mode" role="group" aria-label={`Preview style for item ${index + 1}`}>
                <button type="button" aria-pressed={showRealisticPreview} onClick={() => setPrintLayoutItems(current => ({ ...current, [item.id]: false }))}>Realistic preview</button>
                <button type="button" aria-pressed={!showRealisticPreview} onClick={() => setPrintLayoutItems(current => ({ ...current, [item.id]: true }))}>Print layout</button>
              </div>}
              <div className={`checkout-artwork-image${item.product_type === 'specialty' ? ' checkout-artwork-image-specialty' : ''}`} style={{ "--checkout-artwork-ratio": item.width_in / item.height_in } as React.CSSProperties}>
                {item.product_type === 'specialty' && item.specialty_config ? <SavedSpecialtyPreview configuration={item.specialty_config} /> : <ThumbnailPreviewWrapper
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
                  renderLargePreview={() => showRealisticPreview
                    ? <RealisticBannerScene item={item} expanded />
                    : <BannerPreview {...previewProps} imageUrl={expanded.url} isFinalizedSnapshot={expanded.isExactComposition} maxSize={820} />}
                >
                  {showRealisticPreview
                    ? <RealisticBannerScene item={item} previewSize={600} />
                    : <BannerPreview {...previewProps} imageUrl={small.url} isFinalizedSnapshot={small.isExactComposition} maxSize={600} />}
                </ThumbnailPreviewWrapper>}
              </div>
              <div className="checkout-artwork-copy">
                <h3>{isBanner ? (item.material === '18oz_double' ? 'Double-sided vinyl banner' : 'Custom vinyl banner') : getItemDisplayName(item)}</h3>
                <p>{isBanner ? bannerSize.feet : details.sizeDisplay} · {details.materialDisplay} · Qty {details.qtyDisplay}</p>
                {item.product_type === 'specialty' && (specialtyItemHasVerifiedPrice(item)
                  ? <CartLinePrice {...(linePrices?.get(item.id) || {originalCents: item.line_total_cents, totalCents: item.line_total_cents})} quantity={item.quantity} />
                  : <SpecialtyPendingPrice item={item} />)}
                {item.specialty_config?.optionSummary?.map(option => <p key={option.key}>{option.label}: {option.value}</p>)}
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
        <p className="text-xl font-bold text-[#0B1F3A]">{items.some(item=>!specialtyItemHasVerifiedPrice(item))?'Price pending':usd(totalCents / 100)}</p>
      </div>}
    </section>
  );
}
