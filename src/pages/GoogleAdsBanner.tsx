import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Upload, Shield, Clock, Star, ChevronDown, ChevronUp, CheckCircle, Truck, Users, FileCheck, X, Loader2, ArrowRight, Brush, Minus, Plus, Lock } from 'lucide-react';
import { useQuoteStore, type MaterialKey } from '@/store/quote';
import { useCartStore } from '@/store/cart';
import { useUIStore } from '@/store/ui';
import { calcTotals, usd } from '@/lib/pricing';

const PRESET_SIZES = [
  { label: "2' x 4'", w: 48, h: 24 },
  { label: "3' x 6'", w: 72, h: 36 },
  { label: "4' x 8'", w: 96, h: 48 },
  { label: "2' x 6'", w: 72, h: 24 },
  { label: "3' x 8'", w: 96, h: 36 },
  { label: "4' x 10'", w: 120, h: 48 },
];

const MATERIALS: { key: string; label: string; mapped: MaterialKey }[] = [
  { key: '13oz', label: '13oz Vinyl', mapped: '13oz' },
  { key: '15oz', label: '15oz Vinyl', mapped: '15oz' },
  { key: '18oz', label: '18oz Vinyl', mapped: '18oz' },
  { key: 'mesh', label: 'Mesh Fence', mapped: 'mesh' },
];

const GROMMET_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: '4-corners', label: '4 Corners' },
  { value: 'every-2-3ft', label: 'Every 2 Feet' },
];

const FAQS = [
  { q: 'How fast will I receive my banner?', a: 'We print within 24 hours and ship FREE via Next-Day Air. Most orders arrive in 2-3 business days.' },
  { q: 'What if my artwork has issues?', a: 'Every file is reviewed by a real designer before printing. We will contact you if anything needs attention.' },
  { q: 'What file types do you accept?', a: 'We accept PDF, PNG, JPG, AI, and EPS files up to 10 MB.' },
  { q: 'Can I get help designing?', a: 'Yes, click Let Us Design It above and our team will create a design for you.' },
];

const GoogleAdsBanner: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const orderRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [widthFt, setWidthFt] = useState(8);
  const [widthInR, setWidthInR] = useState(0);
  const [heightFt, setHeightFt] = useState(4);
  const [heightInR, setHeightInR] = useState(0);
  const [material, setMaterial] = useState<MaterialKey>('13oz');
  const [grommets, setGrommets] = useState('none');
  const [polePockets, setPolePockets] = useState('none');
  const [addRope, setAddRope] = useState(false);
  const [hemming, setHemming] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<{name: string; url: string; fileKey: string; size: number; isPdf: boolean} | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [activePreset, setActivePreset] = useState<number | null>(2);
  const [dragActive, setDragActive] = useState(false);
  const [quantity, setQuantity] = useState(1);

  const quoteStore = useQuoteStore();
  const cartStore = useCartStore();
  const { setIsCartOpen } = useUIStore();

  const widthIn = widthFt * 12 + widthInR;
  const heightIn = heightFt * 12 + heightInR;
  const sqft = (widthIn * heightIn) / 144;
  const totals = calcTotals({ widthIn, heightIn, qty: quantity, material, addRope, polePockets });

  useEffect(() => {
    // Flag this session as coming from Google Ads landing page
    sessionStorage.setItem('isGoogleAdsLanding', 'true');
    const gclid = searchParams.get('gclid');
    if (gclid) sessionStorage.setItem('gclid', gclid);
    ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'].forEach(k => {
      const v = searchParams.get(k);
      if (v) sessionStorage.setItem(k, v);
    });
  }, [searchParams]);

  const scrollToOrder = () => orderRef.current?.scrollIntoView({ behavior: 'smooth' });

  const applyPreset = (idx: number) => {
    const p = PRESET_SIZES[idx];
    setWidthFt(Math.floor(p.w / 12));
    setWidthInR(p.w % 12);
    setHeightFt(Math.floor(p.h / 12));
    setHeightInR(p.h % 12);
    setActivePreset(idx);
  };

  const handleFileUpload = useCallback(async (file: File) => {
    setUploadError('');
    const accepted = ['application/pdf','image/jpeg','image/png','image/jpg'];
    if (!accepted.includes(file.type) && !file.name.match(/\.(ai|eps)$/i)) {
      setUploadError('Please upload a PDF, PNG, JPG, AI, or EPS file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File must be under 10 MB.');
      return;
    }
    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/.netlify/functions/upload-file', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setUploadedFile({ name: file.name, url: data.secureUrl, fileKey: data.fileKey || data.publicId, size: file.size, isPdf: file.type === 'application/pdf' });
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileUpload(f);
  }, [handleFileUpload]);

  const handleCheckout = useCallback(() => {
    if (!uploadedFile) return;
    quoteStore.set({
      widthIn, heightIn, quantity, material,
      grommets: grommets as any, polePockets, addRope,
      file: { name: uploadedFile.name, url: uploadedFile.url, fileKey: uploadedFile.fileKey, size: uploadedFile.size, isPdf: uploadedFile.isPdf, type: uploadedFile.isPdf ? 'application/pdf' : 'image/*' } as any,
    });
    const pricing = {
      unit_price_cents: Math.round(totals.unit * 100),
      rope_cost_cents: Math.round(totals.rope * 100),
      pole_pocket_cost_cents: Math.round(totals.polePocket * 100),
      line_total_cents: Math.round(totals.materialTotal * 100),
    };
    cartStore.addFromQuote(useQuoteStore.getState(), undefined, pricing);
    setIsCartOpen(true);
    navigate('/checkout');
  }, [uploadedFile, widthIn, heightIn, material, grommets, polePockets, addRope, totals, quoteStore, cartStore, setIsCartOpen, navigate]);

  return (
    <>
      <Helmet>
        <title>Custom Banner Printing - 24 Hour Production | Banners On The Fly</title>
        <meta name="description" content="Upload your file, choose your size, get FREE Next-Day Air shipping. 24-hour production on custom vinyl banners." />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <div className="min-h-screen bg-white text-gray-900">
        <header className="w-full border-b border-gray-100 bg-white py-3 px-4 sticky top-0 z-50">
          <div className="max-w-5xl mx-auto flex items-center justify-center">
            <img src="/images/header-logo.png" alt="Banners On The Fly" className="h-10 object-contain" loading="eager" />
          </div>
        </header>

        {/* HERO */}
        <section className="relative overflow-hidden pt-14 pb-16 md:pt-20 md:pb-20 px-4" style={{ background: 'linear-gradient(180deg, #F9FAFB 0%, #EEF2F7 100%)' }}>
          {/* Subtle radial glow behind headline */}
          <div className="absolute inset-0 flex items-start justify-center pointer-events-none" aria-hidden="true">
            <div className="w-[600px] h-[400px] mt-8 rounded-full opacity-40" style={{ background: 'radial-gradient(circle, rgba(251,146,60,0.12) 0%, transparent 70%)' }} />
          </div>

          <div className="relative max-w-3xl mx-auto text-center">
            <h1 className="text-3xl sm:text-4xl md:text-[3.25rem] font-black leading-[1.15] tracking-tight mb-5">
              Custom Banner Printing&nbsp;&ndash;
              <br />
              <span className="text-orange-500">24&nbsp;Hour Production</span>
            </h1>

            <p className="text-lg md:text-xl text-gray-500 mb-10 max-w-xl mx-auto leading-relaxed">
              Upload your file, choose your size, and get{' '}
              <strong className="text-gray-700 whitespace-nowrap">FREE Next-Day Air&nbsp;Shipping</strong>.
            </p>

            {/* Trust icon row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-4 gap-y-3 max-w-2xl mx-auto mb-10">
              {[
                { icon: <Clock className="h-4 w-4 text-orange-500 shrink-0" />, text: 'Printed within 24 hours' },
                { icon: <Truck className="h-4 w-4 text-orange-500 shrink-0" />, text: 'Free Next-Day Air' },
                { icon: <Star className="h-4 w-4 text-orange-500 shrink-0" />, label: <>20% Off <span className="font-semibold">NEW20</span></> },
                { icon: <Shield className="h-4 w-4 text-orange-500 shrink-0" />, text: 'Secure Checkout' },
                { icon: <Brush className="h-4 w-4 text-orange-500 shrink-0" />, text: 'Real Designer Review' },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-center gap-1.5 text-[13px] md:text-sm text-gray-600">
                  {item.icon}
                  <span>{item.label || item.text}</span>
                </div>
              ))}
            </div>

            {/* CTA cluster */}
            <div className="flex flex-col items-center gap-3">
              <button
                onClick={scrollToOrder}
                className="group inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white font-bold text-lg px-10 py-4 rounded-xl shadow-[0_4px_14px_rgba(251,146,60,0.4)] hover:shadow-[0_6px_20px_rgba(251,146,60,0.5)] transition-all duration-150 w-full sm:w-auto"
              >
                Start Your Order
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
              </button>
              <span className="text-xs text-gray-400 tracking-wide">Takes less than 60 seconds</span>
            </div>

            {/* Secondary link */}
            <a
              href="/contact"
              className="inline-block mt-4 text-sm text-gray-400 hover:text-gray-600 hover:underline transition-colors"
            >
              Need help designing? Let us design it for you
            </a>


          </div>
        </section>

        <section ref={orderRef} id="order-builder" className="py-12 px-4 bg-white">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl md:text-3xl font-bold text-center mb-10">Build Your Banner</h2>
            <div className="grid md:grid-cols-2 gap-10">
              <div className="space-y-8">
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Popular Sizes</label>
                  <div className="grid grid-cols-3 gap-2">
                    {PRESET_SIZES.map((p, i) => (
                      <button key={i} onClick={() => applyPreset(i)} className={`border rounded-xl py-2.5 px-3 text-sm font-medium transition-all ${activePreset === i ? 'border-orange-500 bg-orange-50 text-orange-700 shadow-sm' : 'border-gray-200 hover:border-gray-400 text-gray-700'}`}>
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Custom Size</label>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <span className="text-xs text-gray-500">Width</span>
                      <div className="flex gap-1 mt-1">
                        <input type="number" min={1} max={50} value={widthFt} onChange={e => { setWidthFt(+e.target.value); setActivePreset(null); }} className="w-16 border rounded-lg px-2 py-1.5 text-sm" />
                        <span className="self-center text-xs text-gray-500">ft</span>
                        <input type="number" min={0} max={11} value={widthInR} onChange={e => { setWidthInR(+e.target.value); setActivePreset(null); }} className="w-16 border rounded-lg px-2 py-1.5 text-sm" />
                        <span className="self-center text-xs text-gray-500">in</span>
                      </div>
                    </div>
                    <div>
                      <span className="text-xs text-gray-500">Height</span>
                      <div className="flex gap-1 mt-1">
                        <input type="number" min={1} max={50} value={heightFt} onChange={e => { setHeightFt(+e.target.value); setActivePreset(null); }} className="w-16 border rounded-lg px-2 py-1.5 text-sm" />
                        <span className="self-center text-xs text-gray-500">ft</span>
                        <input type="number" min={0} max={11} value={heightInR} onChange={e => { setHeightInR(+e.target.value); setActivePreset(null); }} className="w-16 border rounded-lg px-2 py-1.5 text-sm" />
                        <span className="self-center text-xs text-gray-500">in</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">{sqft.toFixed(1)} sq ft</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Material</label>
                  <select value={MATERIALS.find(m => m.mapped === material)?.key || '13oz'} onChange={e => { const sel = MATERIALS.find(m => m.key === e.target.value); if (sel) setMaterial(sel.mapped); }} className="w-full border rounded-xl px-3 py-2.5 text-sm bg-white">
                    {MATERIALS.map(m => (<option key={m.key} value={m.key}>{m.label}</option>))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Upload Your Artwork</label>
                  {!uploadedFile ? (
                    <div onDrop={onDrop} onDragOver={e => { e.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onClick={() => fileInputRef.current?.click()} className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${dragActive ? 'border-orange-400 bg-orange-50 scale-[1.01] shadow-md' : 'border-gray-300 bg-gray-50/50 hover:border-orange-300 hover:bg-orange-50/30'}`}>
                      <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.ai,.eps" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} className="hidden" />
                      {isUploading ? (
                        <div className="flex flex-col items-center">
                          <Loader2 className="h-10 w-10 text-orange-500 animate-spin mb-2" />
                          <p className="text-sm text-gray-600">Uploading...</p>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                          <p className="font-semibold text-gray-800">Drag &amp; Drop or Click to Upload</p>
                          <p className="text-xs text-gray-500 mt-1">PDF, PNG, JPG, AI, EPS - Max 10 MB</p>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="border-2 rounded-xl p-4 flex items-center justify-between bg-green-50 border-green-300 shadow-sm">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <span className="text-sm font-semibold text-green-800">File Ready ✓</span>
                        <span className="text-sm font-semibold text-green-800 truncate max-w-[160px]">{uploadedFile.name}</span>
                      </div>
                      <button onClick={() => { setUploadedFile(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="text-gray-400 hover:text-gray-600 transition-colors"><X className="h-4 w-4" /></button>
                    </div>
                  )}
                  {uploadError && <p className="text-xs text-red-600 mt-2">{uploadError}</p>}
                  <p className="text-xs text-gray-400 mt-2 text-center">Every file reviewed by a real designer before printing.</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Quantity</label>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setQuantity(q => Math.max(1, q - 1))} className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-xl hover:border-gray-400 transition-colors">
                      <Minus className="h-4 w-4 text-gray-600" />
                    </button>
                    <input type="number" min={1} max={999} value={quantity} onChange={e => setQuantity(Math.max(1, +e.target.value || 1))} className="w-20 border rounded-xl px-3 py-1.5 text-sm text-center" />
                    <button onClick={() => setQuantity(q => Math.min(999, q + 1))} className="w-9 h-9 flex items-center justify-center border border-gray-200 rounded-xl hover:border-gray-400 transition-colors">
                      <Plus className="h-4 w-4 text-gray-600" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Finishing Options</label>
                  <div className="space-y-3">
                    <div>
                      <span className="text-xs text-gray-600">Grommets</span>
                      <select value={grommets} onChange={e => setGrommets(e.target.value)} className="w-full border rounded-xl px-3 py-1.5 text-sm mt-1 bg-white">
                        {GROMMET_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <span className="text-xs text-gray-600">Pole Pockets</span>
                      <select value={polePockets} onChange={e => setPolePockets(e.target.value)} className="w-full border rounded-xl px-3 py-1.5 text-sm mt-1 bg-white">
                        <option value="none">None</option>
                        <option value="top">Top</option>
                        <option value="bottom">Bottom</option>
                        <option value="top-bottom">Top &amp; Bottom</option>
                        <option value="left">Left</option>
                        <option value="right">Right</option>
                      </select>
                    </div>
                    <div className="flex gap-4">
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={addRope} onChange={e => setAddRope(e.target.checked)} className="accent-orange-500" /> Rope
                      </label>
                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input type="checkbox" checked={hemming} onChange={e => setHemming(e.target.checked)} className="accent-orange-500" /> Hemming (included)
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-xl p-6 text-center" style={{ background: "#F7F8FA", boxShadow: "0 2px 12px rgba(0,0,0,0.06)" }}>
                  <p className="text-sm text-gray-500 mb-1">Your Price</p>
                  <p className="text-5xl font-extrabold text-gray-900 leading-tight">{usd(totals.materialTotal)}</p>
                  <p className="text-base text-green-600 font-semibold mt-2">FREE Next-Day Air Included</p>
                  <p className="text-sm text-gray-500 mt-1">Printed within 24 hours.</p>
                  <p className="text-xs text-gray-400 mt-3">Tax calculated at checkout</p>
                </div>

                <button onClick={handleCheckout} disabled={!uploadedFile} className={`group w-full font-bold text-lg py-5 rounded-xl shadow-lg transition-all duration-200 flex items-center justify-center gap-2 ${uploadedFile ? 'bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white cursor-pointer shadow-orange-500/30' : 'bg-orange-300 text-white/80 cursor-not-allowed'}`}>
                  Upload &amp; Checkout
                  <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
                </button>
                <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mt-1">
                  <Lock className="h-3 w-3" />
                  <span>Secure checkout.</span>
                </div>
                {!uploadedFile && <p className="text-xs text-center text-gray-400">Upload your artwork to continue</p>}
              </div>
            </div>
          </div>
        </section>

        <section className="py-10 px-4 bg-gray-50">
          <div className="max-w-4xl mx-auto">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-center">
              {[
                { icon: <Users className="h-7 w-7 text-orange-500 mx-auto mb-1" />, text: '10,000+ Happy Customers' },
                { icon: <CheckCircle className="h-7 w-7 text-orange-500 mx-auto mb-1" />, text: 'Satisfaction Guaranteed' },
                { icon: <Shield className="h-7 w-7 text-orange-500 mx-auto mb-1" />, text: 'Secure Checkout' },
                { icon: <FileCheck className="h-7 w-7 text-orange-500 mx-auto mb-1" />, text: 'Real Designer Review' },
                { icon: <Clock className="h-7 w-7 text-orange-500 mx-auto mb-1" />, text: '24 Hour Production' },
              ].map((item, i) => (
                <div key={i} className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                  {item.icon}
                  <p className="text-xs md:text-sm font-medium text-gray-700">{item.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-10 px-4 bg-white">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-6">Frequently Asked Questions</h2>
            <div className="space-y-3">
              {FAQS.map((faq, i) => (
                <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button onClick={() => setOpenFaq(openFaq === i ? null : i)} className="w-full flex items-center justify-between px-4 py-3 text-left font-medium text-gray-800 hover:bg-gray-50 transition-colors">
                    <span>{faq.q}</span>
                    {openFaq === i ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </button>
                  {openFaq === i && <div className="px-4 pb-3 text-sm text-gray-600">{faq.a}</div>}
                </div>
              ))}
            </div>
          </div>
        </section>

        <div className="py-4 text-center text-xs text-gray-400 border-t border-gray-100">
          &copy; {new Date().getFullYear()} Banners On The Fly. All rights reserved.
        </div>
      </div>
    </>
  );
};

export default GoogleAdsBanner;
