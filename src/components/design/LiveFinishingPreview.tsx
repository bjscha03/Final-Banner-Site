import { RealisticBannerScene } from '@/components/preview/RealisticBannerPreview';
import type { CartItem } from '@/store/cart';
import type { NormalizedArtworkTransform } from '@/lib/previewLifecycle';
import { normalizeOrderItemDisplay } from '@/lib/product-display';
import { ZoomIn } from 'lucide-react';
import { Dialog, DialogTrigger, DialogContent, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import BannerDimensions from '@/components/preview/BannerDimensions';
import { useState } from 'react';
import { artworkImageBox } from '@/lib/artworkInteractions';

/** Display-only scene: the editor remains the authority for saving artwork. */
export default function LiveFinishingPreview({ item, src, transform, choiceConfirmed, prominent = false }: {
  item: CartItem;
  src: string;
  transform: NormalizedArtworkTransform;
  choiceConfirmed: boolean;
  prominent?: boolean;
}) {
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const imageBox = natural.w ? artworkImageBox({ x: transform.xPct * item.width_in / 100, y: transform.yPct * item.height_in / 100, scaleX: transform.scaleX, scaleY: transform.scaleY }, { w: item.width_in, h: item.height_in }, natural) : null;
  const crop = transform.crop;
  const details = normalizeOrderItemDisplay(item);
  const selected = item.rope_feet > 0
    ? `Rope: ${details.ropeDisplay}`
    : item.pole_pockets !== 'none'
      ? `Pole pockets: ${details.polePocketsDisplay}`
      : item.grommets !== 'none'
        ? `Grommets: ${details.grommetsDisplay}`
        : 'Hem only · No hanging hardware';
  const ratio = Math.max(0.9, Math.min(1.8, item.width_in / item.height_in));
  const artwork = (
    <div className="relative overflow-hidden bg-white">
      <img src={src} onLoad={e => setNatural({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })} alt="Your artwork with the selected finishing" className="absolute object-contain" style={imageBox ? {
        left: `${imageBox.left / item.width_in * 100}%`, top: `${imageBox.top / item.height_in * 100}%`, width: `${imageBox.width / item.width_in * 100}%`, height: `${imageBox.height / item.height_in * 100}%`, maxWidth: 'none',
        clipPath: crop ? `inset(${crop.y*100}% ${(1-crop.x-crop.width)*100}% ${(1-crop.y-crop.height)*100}% ${crop.x*100}%)` : undefined,
      } : { inset: 0, width: '100%', height: '100%' }} />
    </div>
  );
  return (
    <Dialog>
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm" aria-label="Realistic preview" data-testid="finishing-realistic-preview">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold">Realistic preview</h2>
        <span className="text-xs text-[#18448D]">Tap to enlarge</span>
      </div>
      <DialogTrigger asChild>
        <button type="button" aria-label="Enlarge realistic preview" className="realistic-banner-trigger mx-auto" style={{ maxWidth: prominent ? `min(100%, 480px, calc(36dvh * ${ratio}))` : `min(100%, calc(20dvh * ${ratio}))` }}>
          <RealisticBannerScene item={item} artwork={artwork} />
          <span className="realistic-banner-zoom" aria-hidden="true"><ZoomIn size={16} /></span>
        </button>
      </DialogTrigger>
      <p className="mt-2 text-xs text-slate-600" aria-live="polite">{choiceConfirmed ? selected : 'Choose an option below to see it on your banner.'}</p>
    </section>
    <DialogContent className="realistic-banner-dialog z-[11020] gap-0 overflow-hidden rounded-2xl p-0" data-testid="finishing-realistic-lightbox">
      <header className="border-b border-slate-100 px-4 py-4 pr-14 sm:px-6">
        <DialogTitle className="text-xl font-bold text-[#0B1F3A]">Realistic preview</DialogTitle>
        <DialogDescription asChild><div className="mt-2 text-sm text-slate-600">
          <BannerDimensions widthIn={item.width_in} heightIn={item.height_in} />
          <span className="mt-1 block">{choiceConfirmed ? selected : 'Choose your finishing after closing this preview.'}</span>
        </div></DialogDescription>
      </header>
      <div className="realistic-banner-dialog-body">
        <RealisticBannerScene item={item} artwork={artwork} expanded />
      </div>
      <footer className="flex shrink-0 justify-end border-t border-slate-100 px-4 py-3 sm:px-6">
        <DialogClose asChild><button type="button" className="min-h-11 rounded-lg bg-[#0B1F3A] px-5 text-sm font-semibold text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">Close preview</button></DialogClose>
      </footer>
    </DialogContent>
    </Dialog>
  );
}
