import { useEffect, useState } from 'react';
import { Helmet } from 'react-helmet-async';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, ShoppingCart, Timer, Plane } from 'lucide-react';
import CartModal from '@/components/CartModal';
import GoogleReviewSpotlight from '@/components/design/GoogleReviewSpotlight';
import TrustStrip from '@/components/design/layout/TrustStrip';
import CompactProductHero from '@/components/product/CompactProductHero';
import FirstOrderBadge from '@/components/product/FirstOrderBadge';
import SpecialtyDeliveryStatus from '@/components/delivery/SpecialtyDeliveryStatus';
import SpecialtyDesigner from '@/components/specialty/SpecialtyDesigner';
import { getSpecialtyProduct } from '@/lib/specialtyProducts';
import { useProductFirstOrderOffer } from '@/hooks/useProductFirstOrderOffer';
import { useCartStore } from '@/store/cart';
import '@/styles/product-hero.css';

const product = getSpecialtyProduct('step-and-repeat-backdrop')!;
const questions = [
  ['What sizes can I order?', 'Choose an 8 × 8 ft or 10 × 8 ft backdrop. The artwork preview and safe-area guides update to match your selected size.'],
  ['Does my backdrop include a stand?', 'The default package includes your printed fabric graphic, telescoping frame and carry bag. Already have a frame? Choose the replacement graphic only option in the builder. A replacement graphic does not include a stand.'],
  ['What material is used?', 'Your design is printed on 9 oz. fabric with 3-inch pole pockets at the top and bottom. Keep important text and logos inside the safe-area guides so they stay clear of the pocket areas.'],
  ['Can I upload my own design?', 'Yes. Upload a PNG, JPG or single-page PDF, adjust the placement and review the finished-product preview. If your artwork needs a different layout, use Fit my design with AI after uploading. You approve the fitted version before it replaces your design, and you can restore the original.'],
  ['When will my backdrop arrive?', 'The live shipping dates above use the backdrop production schedule. Order and approve your artwork before the stated weekday cutoff for shipment the next business day. Free FedEx Next-Day Air begins after production. Weekends, holidays and carrier delays can affect delivery.'],
];

export default function GoogleAdsBackdrops() {
  const offer = useProductFirstOrderOffer();
  const [cartOpen, setCartOpen] = useState(false);
  const count = useCartStore(state => state.items.reduce((total, item) => total + item.quantity, 0));
  useEffect(() => { sessionStorage.setItem('isGoogleAdsLanding', 'true'); }, []);
  const photo = <img src={product.image} alt={product.imageAlt} loading="eager" fetchPriority="high" width={1200} height={800} />;

  return <div className="min-h-screen bg-white text-[#0B1F3A]">
    <Helmet>
      <title>Custom Backdrops — 8×8 &amp; 10×8 | Banners On The Fly</title>
      <meta name="description" content="Build your custom step-and-repeat backdrop. Choose 8×8 or 10×8 ft, upload your artwork, preview your design and get free Next-Day Air after production." />
      <meta name="robots" content="noindex, nofollow" />
    </Helmet>
    <a href="#specialty-builder" className="sr-only focus:not-sr-only focus:block focus:p-3">Skip to backdrop builder</a>
    <header data-site-header className="sticky top-0 z-50 w-full border-b border-[#e5dfd6] bg-white px-4 py-2 lg:py-3">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <div className="hidden w-10 lg:block" />
        <img src="/images/header-logo.png" alt="Banners On The Fly" width={248} height={70} className="h-8 w-auto object-contain lg:h-10" />
        <button type="button" onClick={() => setCartOpen(true)} aria-label="Shopping cart" className="relative flex h-11 w-11 items-center justify-center text-orange-600 hover:text-orange-700">
          <ShoppingCart aria-hidden="true" className="h-6 w-6" />
          {count > 0 && <span className="absolute right-0 top-0 rounded-full bg-orange-600 px-1.5 text-xs font-bold text-white">{count}</span>}
        </button>
      </div>
    </header>
    <main>
      <div className="hidden lg:block"><GoogleReviewSpotlight /></div>
      <CompactProductHero title="Custom backdrops." accent="Make every photo count." specialty discount={offer.showBadge}
        photo={photo} delivery={<SpecialtyDeliveryStatus featured />}
        action={<a href="#specialty-builder">Build &amp; price my backdrop<ArrowRight aria-hidden="true" /></a>} />
      <section className="product-hero-light hidden lg:block" aria-label="Custom backdrops">
        <div className="product-hero-stage">
          <div className="product-hero-copy">
            <p className="product-hero-eyebrow">For big events. And all the moments in between.</p>
            <h1>Custom backdrops.<span className="product-hero-accent">Make every photo count.</span></h1>
            <p className="product-hero-description">Put your brand behind the moment. Custom fabric backdrops for photo ops, sponsor walls, trade shows and celebrations.</p>
            <ul className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold" aria-label="Backdrop options">
              {['8 × 8 ft or 10 × 8 ft', 'Printed fabric + frame', 'Preview before checkout'].map(text => <li key={text} className="flex items-center gap-2"><Check className="h-4 w-4 text-orange-600" aria-hidden="true" />{text}</li>)}
            </ul>
            <div className="product-hero-actions"><a href="#specialty-builder" className="product-hero-cta">Build &amp; price my backdrop<ArrowRight aria-hidden="true" /></a></div>
            <ul className="production-shipping-benefits" aria-label="Ordering benefits">
              <li><Timer aria-hidden="true" /><div><strong>NEXT BUSINESS DAY</strong><span>SHIPMENT*</span></div></li>
              <li><Plane aria-hidden="true" /><div><strong>FREE FEDEX</strong><span>NEXT-DAY AIR</span><small>Shipping included</small></div></li>
            </ul>
            <div className="product-hero-delivery"><SpecialtyDeliveryStatus featured /></div>
          </div>
          <div className="product-hero-media">{photo}{offer.showBadge && <FirstOrderBadge />}</div>
        </div>
      </section>
      <section id="specialty-builder" className="scroll-mt-20 bg-slate-50 px-4 py-8 pb-12 lg:px-6 lg:py-12" aria-labelledby="backdrop-builder-title">
        <div className="mx-auto max-w-6xl">
          <div className="mb-7 text-center">
            <p className="text-xs font-black uppercase tracking-[.18em] text-orange-700">Your backdrop. Your design.</p>
            <h2 id="backdrop-builder-title" className="mt-2 text-2xl font-black uppercase tracking-tight sm:text-3xl">Build your backdrop</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-6 text-slate-600">Choose your size and package, upload your artwork, then approve your preview. Your price updates as you go.</p>
          </div>
          <SpecialtyDesigner product={product} offer={offer} landingPage enableArtworkFit />
        </div>
      </section>
      <section className="mx-auto max-w-3xl px-4 py-12 lg:py-16" aria-labelledby="backdrop-faq-title">
        <h2 id="backdrop-faq-title" className="mb-6 text-center text-2xl font-bold">A few details before the big day</h2>
        <div className="divide-y divide-slate-200 border-y border-slate-200">{questions.map(([question, answer]) => <details key={question} className="py-5"><summary className="cursor-pointer pr-3 font-bold">{question}</summary><p className="mt-3 text-sm leading-7 text-slate-600">{answer}</p></details>)}</div>
        <p className="mt-7 text-center text-sm text-slate-600">Need a hand? <a href="mailto:support@bannersonthefly.com" className="font-semibold text-blue-800 underline">support@bannersonthefly.com</a></p>
      </section>
      <TrustStrip productionSubtitle="See live shipping dates above" />
    </main>
    <footer className="border-t border-slate-200 px-4 py-8 pb-48 text-center text-xs text-slate-500 lg:pb-8">
      <nav aria-label="Policies" className="mb-3 flex justify-center gap-5"><Link to="/terms">Terms</Link><Link to="/privacy">Privacy</Link><Link to="/shipping">Shipping</Link></nav>
      <p>© {new Date().getFullYear()} Banners On The Fly. All rights reserved.</p>
    </footer>
    <CartModal isOpen={cartOpen} onClose={() => setCartOpen(false)} />
  </div>;
}
