import { useEffect, useState } from 'react';

export interface ComparisonArtwork {
  src: string;
  label: string;
}

// Add only visually reviewed, people-free business/event artwork here.
// Never pull an unreviewed order feed into this public display.
export const comparisonArtworks: readonly ComparisonArtwork[] = [];

export default function BannerSizeComparison({ artworks = comparisonArtworks }: { artworks?: readonly ComparisonArtwork[] }) {
  const [active, setActive] = useState(0);
  const [ready, setReady] = useState<string[]>([]);
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!query) return;
    const update = () => setReducedMotion(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const images = artworks.map(artwork => {
      const image = new Image();
      image.onload = () => {
        if (!cancelled) setReady(previous => previous.includes(artwork.src) ? previous : [...previous, artwork.src]);
      };
      image.src = artwork.src;
      return image;
    });
    return () => { cancelled = true; images.forEach(image => { image.onload = null; }); };
  }, [artworks]);

  const loaded = artworks.filter(artwork => ready.includes(artwork.src));
  useEffect(() => {
    if (paused || reducedMotion || loaded.length < 2) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setActive(index => (index + 1) % loaded.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion, loaded.length]);

  return <div className="mt-3 rounded-xl bg-orange-50 p-3">
    <p className="text-sm font-bold text-slate-900">Give your message more room</p>
    <p className="mt-1 text-xs leading-relaxed text-slate-600">8′ × 4′ gives you <strong className="font-bold text-slate-900">78% more banner</strong> area than 6′ × 3′.</p>
    <div className="mt-3 flex items-end justify-center gap-5" aria-label="The same design shown at 6 by 3 feet and 8 by 4 feet, at the same scale">
      {[6, 8].map(width => <div key={width} style={{ width: `${width * 5}%` }}>
        <div className="relative overflow-hidden rounded-sm border border-slate-900/10 bg-white shadow-md" style={{ aspectRatio: '2 / 1' }} aria-hidden="true">
          {loaded.length ? loaded.map((artwork, index) => <img key={artwork.src} src={artwork.src} alt="" decoding="async"
            className={`absolute inset-0 h-full w-full object-contain ${reducedMotion ? '' : 'transition-opacity duration-700 ease-in-out'}`}
            style={{ opacity: index === active % loaded.length ? 1 : 0 }} />)
            : <div className="flex h-full items-center justify-center bg-slate-900 text-center text-[9px] font-bold leading-tight text-white">GRAND<br />OPENING</div>}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-black/5" />
          {['left-1 top-1', 'right-1 top-1', 'left-1 bottom-1', 'right-1 bottom-1'].map(corner => <span key={corner} className={`pointer-events-none absolute h-1 w-1 rounded-full border border-slate-400 bg-white shadow-sm ${corner}`} />)}
        </div>
        <p className="mt-1 text-center text-[11px] text-slate-600">{width}′ × {width / 2}′</p>
      </div>)}
    </div>
    {loaded.length > 0 && <div className="mt-2 flex items-center justify-between gap-2 text-[10px] text-slate-600">
      <span>{loaded[active % loaded.length].label}</span>
      {loaded.length > 1 && !reducedMotion && <button type="button" onClick={() => setPaused(value => !value)} className="min-h-6 rounded px-2 underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-orange-600" aria-label={paused ? 'Play banner examples' : 'Pause banner examples'}>{paused ? 'Play' : 'Pause'}</button>}
    </div>}
  </div>;
}
