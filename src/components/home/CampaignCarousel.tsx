import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Pause, Play } from 'lucide-react';

export const campaignSlides = [
  { id: 'vinyl-banners', category: 'Custom vinyl banners', lines: ['Big ideas.', 'Bigger impact.'], copy: 'Your design. Printed to stand out.', cta: 'Shop banners', url: '/design?product=banner', color: '#061a31', alt: 'Orange grand opening vinyl banner with metal grommets alongside a blue local business banner' },
  { id: 'yard-signs', category: 'Custom yard signs', lines: ['Small sign.', 'Big attention.'], copy: 'Make every curb count.', cta: 'Shop yard signs', url: '/design?product=yard-signs', color: '#005bc1', alt: 'Open house, lawn care and graduation yard signs on metal stakes in grass' },
  { id: 'car-magnets', category: 'Custom car magnets', lines: ['Your brand.', 'On the move.'], copy: 'Turn every drive into an impression.', cta: 'Shop car magnets', url: '/design?product=car-magnets', color: '#007b98', alt: 'Summit Home Services car magnet on a white work truck with a flexible magnet in the foreground' },
  { id: 'retractable', category: 'Retractable banners', lines: ['Show up.', 'Stand out.'], copy: 'Big presence. Easy setup.', cta: 'Shop banner stands', url: '/products/standard-retractable-banner', color: '#41129b', alt: 'Two custom retractable banner stands with aluminum bases in a vivid purple studio' },
  { id: 'flags', category: 'Custom feather flags', lines: ['Get seen.', 'From the street.'], copy: 'Give your business the spotlight.', cta: 'Shop feather flags', url: '/products/feather-flags', color: '#f26709', alt: 'Three custom feather flags with navy, white and orange printed designs' },
] as const;

export default function CampaignCarousel() {
  const [active, setActive] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [visible, setVisible] = useState(true);
  const touch = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    setPlaying(!motion.matches);
    const update = () => { if (motion.matches) setPlaying(false); };
    const visibility = () => setVisible(!document.hidden);
    motion.addEventListener('change', update);
    document.addEventListener('visibilitychange', visibility);
    return () => { motion.removeEventListener('change', update); document.removeEventListener('visibilitychange', visibility); };
  }, []);
  useEffect(() => {
    if (!playing || hovered || !visible) return;
    const timer = window.setInterval(() => setActive(value => (value + 1) % campaignSlides.length), 6500);
    return () => window.clearInterval(timer);
  }, [playing, hovered, visible, active]);
  const go = (index: number) => { setPlaying(false); setActive((index + campaignSlides.length) % campaignSlides.length); };
  const slide = campaignSlides[active];
  return <section className="campaign" aria-label="Featured products" aria-roledescription="carousel"
    onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
    onFocusCapture={event => { if (!(event.target as HTMLElement).closest('.campaign-play')) setPlaying(false); }}
    onKeyDown={event => { if (event.key === 'ArrowLeft') { event.preventDefault(); go(active - 1); } if (event.key === 'ArrowRight') { event.preventDefault(); go(active + 1); } }}>
    <div className="campaign-stage" style={{ '--campaign-color': slide.color } as CSSProperties}
      onTouchStart={event => { touch.current = { x: event.touches[0].clientX, y: event.touches[0].clientY }; }}
      onTouchEnd={event => { if (!touch.current) return; const dx = event.changedTouches[0].clientX - touch.current.x; const dy = event.changedTouches[0].clientY - touch.current.y; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) go(active + (dx < 0 ? 1 : -1)); touch.current = null; }}>
      {campaignSlides.map((item, index) => <div key={item.id} className="campaign-slide" hidden={index !== active} role="group" aria-roledescription="slide" aria-label={`${index + 1} of ${campaignSlides.length}: ${item.category}`}>
        <img className="campaign-photo" src={`/images/campaign/${item.id}-1536.webp`} srcSet={`/images/campaign/${item.id}-640.webp 640w, /images/campaign/${item.id}-1536.webp 1536w`} sizes="(min-width: 1024px) 75vw, 100vw" width="1536" height="1024" alt={item.alt} loading={index === 0 ? 'eager' : 'lazy'} fetchPriority={index === 0 ? 'high' : 'auto'} />
        <div className="campaign-shade" aria-hidden="true" />
        <div className="campaign-copy">
          <p className="campaign-eyebrow">{item.category}</p>
          <h1 className="campaign-title"><span>{item.lines[0]}</span><span>{item.lines[1]}</span></h1>
          <p className="campaign-description">{item.copy}</p>
          <Link className="bof-pill campaign-cta" to={item.url}>{item.cta}</Link>
        </div>
      </div>)}
      <button type="button" className="campaign-arrow campaign-prev" aria-label="Previous slide" onClick={() => go(active - 1)}><ChevronLeft aria-hidden="true" /></button>
      <button type="button" className="campaign-arrow campaign-next" aria-label="Next slide" onClick={() => go(active + 1)}><ChevronRight aria-hidden="true" /></button>
    </div>
    <div className="campaign-controls">
      <button type="button" className="campaign-play" aria-label={playing ? 'Pause slideshow' : 'Play slideshow'} onClick={() => setPlaying(value => !value)}>{playing ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}</button>
      {campaignSlides.map((item, index) => <button type="button" key={item.id} className="campaign-dot" aria-label={`Show ${item.category}`} aria-current={index === active ? 'true' : undefined} onClick={() => go(index)}><span /></button>)}
      <span className="sr-only" aria-live={playing ? 'off' : 'polite'}>{slide.category}, slide {active + 1} of {campaignSlides.length}</span>
    </div>
  </section>;
}
