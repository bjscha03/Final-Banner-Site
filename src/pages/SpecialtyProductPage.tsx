import { Link, Navigate, useParams, useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import Layout from '@/components/Layout';
import SEO from '@/components/SEO';
import SpecialtyDesigner from '@/components/specialty/SpecialtyDesigner';
import CompactProductHero from '@/components/product/CompactProductHero';
import SpecialtyDeliveryStatus from '@/components/delivery/SpecialtyDeliveryStatus';
import { getSpecialtyProduct, specialtyCategories, availableSpecialtyProducts as specialtyProducts, isSpecialtyProductAvailable } from '@/lib/specialtyProducts';
import GoogleReviewSpotlight from '@/components/design/GoogleReviewSpotlight';
import '@/styles/product-hero.css';
import FirstOrderBadge from '@/components/product/FirstOrderBadge';
import { useProductFirstOrderOffer } from '@/hooks/useProductFirstOrderOffer';
import {useCartStore} from '@/store/cart';
export default function SpecialtyProductPage() {
  const offer = useProductFirstOrderOffer();
  const location=useLocation();const {slug}=useParams();const product=getSpecialtyProduct(slug);
  const editId=new URLSearchParams(location.search).get('editItem');
  const savedItemId=useCartStore(s=>s.items.find(item=>item.id===editId&&item.specialty_config?.productSlug===slug)?.id);
  if(!product||!isSpecialtyProductAvailable(product.slug))return <Navigate to="/products" replace/>;
  const related=specialtyProducts.filter(p=>p.category===product.category&&p.slug!==slug).slice(0,3);
  const url=`https://bannersonthefly.com/products/${product.slug}`;
  const description=`${product.summary} Upload, design, preview and add to cart.`.slice(0,160);
  const schema=[{'@context':'https://schema.org','@type':'WebPage',name:product.name,url,description},{'@context':'https://schema.org','@type':'Product',name:product.name,description:product.description,image:`https://bannersonthefly.com${product.image}`,url,brand:{'@type':'Brand',name:'Banners On The Fly'}}];
  return <Layout showFooterBanner={false}><SEO title={`${product.name} | Banners On The Fly`} description={description} canonical={url} ogType="product" schema={schema}/>
    <main className="bg-[#f7f8fa] pb-16">
      <CompactProductHero title={product.name} accent="Ready to stand out." specialty discount={offer.showBadge}
        photo={<img src={product.image} alt={product.imageAlt} loading="eager" fetchPriority="high" />}
        delivery={<SpecialtyDeliveryStatus featured />}
        action={<a href="#specialty-builder">Customize &amp; price<ArrowRight aria-hidden="true" /></a>}
      />
      <section className="product-hero-light hidden lg:block">
        <div className="product-hero-stage">
          <div className="product-hero-copy">
            <Link to={`/products#${product.category}`} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-slate-600"><ArrowLeft className="h-4 w-4"/>{specialtyCategories[product.category].label}</Link>
            <p className="product-hero-eyebrow">{product.eyebrow}</p>
            <h1>{product.name}<span className="product-hero-accent">Ready to stand out.</span></h1>
            <p className="product-hero-description">{product.summary}</p>
            <div className="product-hero-actions"><a href="#specialty-builder" className="product-hero-cta">Customize &amp; price<ArrowRight aria-hidden="true" /></a></div>
            <div className="product-hero-delivery"><SpecialtyDeliveryStatus featured /></div>
          </div>
          <div className="product-hero-media"><img src={product.image} alt={product.imageAlt} loading="eager" fetchPriority="high" />{offer.showBadge && <FirstOrderBadge />}</div>
        </div>
        <GoogleReviewSpotlight />
      </section>
      <div className="brand-shell py-6 lg:py-8"><div id="specialty-builder" className="scroll-mt-24 lg:mt-8">{editId&&!savedItemId?<div className="rounded-xl border bg-white p-6"><p role="status">Waiting for your saved cart item…</p><p className="mt-3 text-sm text-slate-600">If it does not appear, <Link to="/checkout" className="text-blue-800 underline">open your cart</Link> to restore it, or <Link to={`/products/${product.slug}`} className="text-blue-800 underline">start a new design</Link>.</p></div>:<SpecialtyDesigner key={`${product.slug}:${location.search}:${savedItemId||'new'}`} product={product} offer={offer}/>}</div></div>
    <section className="brand-shell mt-8"><h2 className="text-2xl font-bold">Complete your setup</h2><div className="mt-6 grid gap-5 sm:grid-cols-3">{related.map(p=><Link to={`/products/${p.slug}`} key={p.slug} className="overflow-hidden rounded-xl border bg-white transition hover:border-orange-500"><div className="relative"><img src={p.image} alt={p.imageAlt} loading="lazy" className="aspect-[3/2] w-full object-contain"/>{offer.showBadge && <FirstOrderBadge />}</div><span className="flex items-center justify-between p-5 font-bold">{p.name}<ArrowRight className="h-4 w-4 text-orange-700"/></span></Link>)}</div></section></main>
  </Layout>;
}
