import React from 'react';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import CheckoutOrderTotals, { type CheckoutOrderTotalsProps } from './CheckoutOrderTotals';
import BannerPreview from '@/components/cart/BannerPreview';
import CartLinePrice from '@/components/cart/CartLinePrice';
import type { CartItem } from '@/store/cart';
import { getItemDisplayName, normalizeOrderItemDisplay, type NormalizableOrderItem } from '@/lib/product-display';
import { getGrommetLabelForDisplay, getGrommetModeForPreview } from '@/lib/cartGrommet';
import { getSmallPreviewSelection } from '@/lib/previewSelection';

type Props = {
  items: CartItem[];
  prices: Map<string, { originalCents: number; totalCents: number }>;
  totals: CheckoutOrderTotalsProps;
};

export default function CheckoutReviewDialog({ items, prices, totals }: Props) {
  return <Dialog>
    <DialogTrigger asChild><button type="button" className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-bold text-[#18448D] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#18448D]">Review order</button></DialogTrigger>
    <DialogContent className="flex max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl flex-col gap-0 overflow-hidden rounded-2xl bg-white p-0">
      <header className="shrink-0 border-b border-slate-200 p-5 pr-12">
        <DialogTitle>Review your order</DialogTitle>
        <DialogDescription className="mt-1">Check your artwork, options, quantities, and total.</DialogDescription>
      </header>
      <div className="min-h-0 overflow-y-auto overscroll-contain p-4 sm:p-5">
        <div className="space-y-4">
          {items.map(item => {
            const normalized = normalizeOrderItemDisplay(item as NormalizableOrderItem);
            const preview = getSmallPreviewSelection(item);
            const price = prices.get(item.id) || { originalCents: item.line_total_cents, totalCents: item.line_total_cents };
            const details = [
              ['Size', normalized.sizeDisplay], ['Material', normalized.materialDisplay], ['Print', normalized.printDisplay], ['Quantity', normalized.qtyDisplay],
              ...(normalized.uploadedDesignsCount ? [['Uploaded designs', String(normalized.uploadedDesignsCount)]] : []),
              ...(normalized.stepStakesQty ? [['Step stakes', String(normalized.stepStakesQty)]] : []),
              ...(normalized.productType === 'banner' ? [
                ['Grommets', getGrommetLabelForDisplay(item, normalized.grommetsDisplay)], ['Pole pockets', normalized.polePocketsDisplay], ['Rope', normalized.ropeDisplay], ['Hemming', normalized.hemmingDisplay || 'Always included'],
              ] : []),
              ...(normalized.roundedCornersDisplay ? [['Rounded corners', normalized.roundedCornersDisplay]] : []),
            ];
            return <article key={item.id} className="rounded-xl border border-slate-200 p-4">
              <div className="mb-4 flex justify-center"><BannerPreview widthIn={item.width_in} heightIn={item.height_in} grommets={getGrommetModeForPreview(item)} imageUrl={preview.url} material={item.material} textElements={item.text_elements} overlayImage={item.overlay_image} imageScale={item.image_scale} imageScaleY={item.image_scale_y} imagePosition={item.image_position} fitMode={item.fit_mode || 'fill'} designServiceEnabled={item.design_service_enabled} source={item.source} isFinalizedSnapshot={preview.isExactComposition} compositionSignature={item.placement_preview?.compositionSignature || item.composition_signature} maxSize={360} /></div>
              <div className="flex items-start justify-between gap-3"><h3 className="font-bold text-[#0B1F3A]">{getItemDisplayName(item)}</h3><CartLinePrice {...price} quantity={item.quantity} /></div>
              <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">{details.map(([label, value]) => <React.Fragment key={label}><dt className="text-slate-500">{label}</dt><dd className="min-w-0 break-words text-right font-medium text-slate-800">{value}</dd></React.Fragment>)}</dl>
            </article>;
          })}
          <CheckoutOrderTotals {...totals} />
        </div>
      </div>
      <footer className="shrink-0 border-t border-slate-200 bg-white p-4"><DialogClose asChild><button type="button" className="min-h-12 w-full rounded-xl bg-[#0B1F3A] px-4 py-3 font-bold text-white">Back to checkout</button></DialogClose></footer>
    </DialogContent>
  </Dialog>;
}
