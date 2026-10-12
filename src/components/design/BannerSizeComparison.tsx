import { useEffect, useState } from 'react';

export interface ComparisonArtwork {
  src: string;
  label: string;
}

// Add only visually reviewed, people-free business/event artwork here.
// Never pull an unreviewed order feed into this public display.
export const comparisonArtworks: readonly ComparisonArtwork[] = [
  {
    "src": "https://res.cloudinary.com/dtrxl120u/image/upload/w_800,c_limit,q_auto,f_auto/v1789129072/uploads/ai-banner-96x48-eca4c311-ed29-4543-a72d-242328c63c84_cticua.jpg",
    "label": "Construction banner"
  },
  {
    "src": "https://res.cloudinary.com/dtrxl120u/image/upload/w_800,c_limit,q_auto,f_auto/v1790138164/uploads/ndidi_oy9mgq.png",
    "label": "Birthday celebration"
  },
  {
    "src": "https://res.cloudinary.com/dtrxl120u/image/upload/w_800,c_limit,q_auto,f_auto/v1790041510/uploads/LIS_PHAM_PHEEB_color_corrected_sRGB_exvclz.png",
    "label": "Business brand banner"
  },
  {
    "src": "https://res.cloudinary.com/dtrxl120u/image/upload/w_1000,q_auto,f_auto/v1790878174/uploads/ai-banner-72x36-3c1752ad-9d64-4193-ac90-75001de416fa_tdxpef.jpg",
    "label": "Seasonal event banner"
  },
  {
    "src": "https://res.cloudinary.com/dtrxl120u/image/upload/w_800,c_limit,q_auto,f_auto/v1789258903/uploads/5BBCB119-4B9C-4BBB-9C67-92AF7665EF30_kkcudk.png",
    "label": "Soccer team banner"
  },
  {
    "src": "https://res.cloudinary.com/dtrxl120u/image/upload/w_800,c_limit,q_auto,f_auto/v1789130424/uploads/ai-banner-96x48-94dd9796-e1fa-49a7-b050-12f54659acf3_ukvysw.jpg",
    "label": "Bakery opening"
  },
  {
    "src": "https://res.cloudinary.com/dtrxl120u/image/upload/w_800,c_limit,q_auto,f_auto/v1789935170/uploads/ai-banner-72x36-8af99d88-ac0d-484f-8e08-f241e730bb5f_tokkjp.jpg",
    "label": "Campus event"
  },
  {
    "src": "https://res.cloudinary.com/dtrxl120u/image/upload/w_800,c_limit,q_auto,f_auto/v1789058108/uploads/Screenshot_2026-07-10_at_2.56.27_PM_idzbyu.png",
    "label": "Craft business banner"
  },
  {
    "src": "https://res.cloudinary.com/dtrxl120u/image/upload/w_800,c_limit,q_auto,f_auto/v1789657845/uploads/ai-banner-72x36-1a59c405-a77a-4d89-8662-96b79778fedd_kgpiwb.jpg",
    "label": "Fall festival"
  },
  {
    "src": "https://res.cloudinary.com/dtrxl120u/image/upload/w_800,c_limit,q_auto,f_auto/v1789079057/uploads/ai-banner-96x48-dbd5ff05-23f0-4ce9-a25e-ab4bed7ba3b0_at8irl.jpg",
    "label": "Bakery grand opening"
  },
  {
    "src": "https://res.cloudinary.com/dtrxl120u/image/upload/w_1000,q_auto,f_auto/v1790719468/uploads/placement-v3-1dv0rzq0q9e72r_kfg6a1.jpg",
    "label": "Small business banner"
  },
  {
    "src": "https://res.cloudinary.com/dtrxl120u/image/upload/w_800,c_limit,q_auto,f_auto/v1789153324/uploads/ai-banner-96x48-2c853bf6-56d2-46d2-a46c-46aec74dc464_tc3ivm.jpg",
    "label": "Volleyball team banner"
  },
  {
    "src": "https://res.cloudinary.com/dtrxl120u/image/upload/w_800,c_limit,q_auto,f_auto/v1790179729/uploads/2F74F756-9196-4782-9BA4-BF7E6C6F5381_nvjvq1.png",
    "label": "Fundraising celebration"
  },
  {
    "src": "https://res.cloudinary.com/dtrxl120u/image/upload/w_800,c_limit,q_auto,f_auto/v1788775126/uploads/E086E061-37C4-4B8D-8AA1-2CE76033DE52_nmlgov.png",
    "label": "Live music fundraiser"
  }
];

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
  const visibleArtworks = loaded.length ? loaded : artworks.slice(0, 1);
  useEffect(() => {
    if (paused || reducedMotion || loaded.length < 2) return;
    const timer = window.setInterval(() => {
      if (!document.hidden) setActive(index => (index + 1) % loaded.length);
    }, 4000);
    return () => window.clearInterval(timer);
  }, [paused, reducedMotion, loaded.length]);

  return <div className="mt-3 rounded-xl bg-orange-50 p-3">
    <p className="text-sm font-bold text-slate-900">Give your message more room</p>
    <p className="mt-1 text-xs leading-relaxed text-slate-600">8′ × 4′ gives you <strong className="font-bold text-slate-900">78% MORE BANNER</strong> area than 6′ × 3′.</p>
    <div className="mt-3 flex items-end justify-center gap-5" aria-label="The same design shown at 6 by 3 feet and 8 by 4 feet, at the same scale">
      {[6, 8].map(width => <div key={width} style={{ width: `${width * 6}%` }}>
        <div className="relative overflow-hidden rounded-sm border border-slate-900/10 bg-white shadow-md" style={{ aspectRatio: '2 / 1' }} aria-hidden="true">
          {visibleArtworks.map((artwork, index) => <img key={artwork.src} src={artwork.src} alt="" decoding="async"
            className={`absolute inset-0 h-full w-full object-contain ${reducedMotion ? '' : 'transition-opacity duration-700 ease-in-out'}`}
            style={{ objectFit: 'contain', opacity: index === active % visibleArtworks.length ? 1 : 0 }} />)}
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
