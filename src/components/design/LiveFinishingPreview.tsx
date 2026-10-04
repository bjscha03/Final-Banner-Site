import { RealisticBannerScene } from '@/components/preview/RealisticBannerPreview';
import type { CartItem } from '@/store/cart';
import type { NormalizedArtworkTransform } from '@/lib/previewLifecycle';
import { normalizeOrderItemDisplay } from '@/lib/product-display';

/** Display-only scene: the editor remains the authority for saving artwork. */
export default function LiveFinishingPreview({ item, src, transform, choiceConfirmed }: {
  item: CartItem;
  src: string;
  transform: NormalizedArtworkTransform;
  choiceConfirmed: boolean;
}) {
  const details = normalizeOrderItemDisplay(item);
  const selected = item.rope_feet > 0
    ? `Rope: ${details.ropeDisplay}`
    : item.pole_pockets !== 'none'
      ? `Pole pockets: ${details.polePocketsDisplay}`
      : item.grommets !== 'none'
        ? `Grommets: ${details.grommetsDisplay}`
        : 'Hem only · No hanging hardware';
  const ratio = Math.max(0.9, Math.min(1.8, item.width_in / item.height_in));
  return (
    <section className="sticky top-0 z-10 rounded-xl border border-slate-200 bg-white p-3 shadow-sm [@media(max-height:600px)]:static" aria-label="Realistic preview" data-testid="finishing-realistic-preview">
      <h2 className="mb-2 text-sm font-bold">Realistic preview</h2>
      <div className="mx-auto overflow-hidden rounded-lg" style={{ maxWidth: `min(100%, calc(28dvh * ${ratio}))` }}>
        <RealisticBannerScene item={item} artwork={
          <div className="relative overflow-hidden bg-white">
            <img src={src} alt="Your artwork with the selected finishing" className="absolute inset-0 h-full w-full object-contain" style={{
              transform: `translate(${transform.xPct}%, ${transform.yPct}%) scale(${transform.scaleX}, ${transform.scaleY})`,
              transformOrigin: 'center center',
            }} />
          </div>
        } />
      </div>
      <p className="mt-2 text-xs text-slate-600" aria-live="polite">{choiceConfirmed ? selected : 'Choose an option below to see it on your banner.'}</p>
    </section>
  );
}
