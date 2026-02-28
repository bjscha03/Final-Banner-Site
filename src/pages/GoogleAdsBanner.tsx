import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import { Upload, Shield, Clock, Star, CheckCircle, Truck, Users, FileCheck, X, Loader2, ArrowRight, Brush, Minus, Plus, Lock, Mail, Droplets, Sun, Wind, Palette, Tag, Move, ZoomIn, ZoomOut } from 'lucide-react';
import { useQuoteStore, type MaterialKey } from '@/store/quote';
import { useCartStore } from '@/store/cart';
import { useUIStore } from '@/store/ui';
import { calcTotals, usd, PRICE_PER_SQFT } from '@/lib/pricing';

const PRESET_SIZES = [
  { label: "2' x 4'", w: 48, h: 24 },
  { label: "3' x 6'", w: 72, h: 36 },
  { label: "4' x 8'", w: 96, h: 48 },
  { label: "2' x 6'", w: 72, h: 24 },
  { label: "3' x 8'", w: 96, h: 36 },
  { label: "4' x 10'", w: 120, h: 48 },
];

const MATERIALS: { key: string; label: string; mapped: MaterialKey; desc: string }[] = [
  { key: '13oz', label: '13oz Vinyl', mapped: '13oz', desc: 'Standard outdoor — great for most uses' },
  { key: '15oz', label: '15oz Vinyl', mapped: '15oz', desc: 'Heavy-duty — extra durability and rigidity' },
  { key: '18oz', label: '18oz Vinyl', mapped: '18oz', desc: 'Premium blockout — thick, wind-resistant' },
  { key: 'mesh', label: 'Mesh Fence', mapped: 'mesh', desc: 'Wind pass-through — ideal for fences' },
];

const GROMMET_OPTIONS = [
  { value: 'none', label: 'None' },
  { value: '4-corners', label: '4 Corners' },
  { value: 'every-2-3ft', label: 'Every 2 Feet' },
];

const TESTIMONIALS = [
  {
    name: "Dan Oliver",
    company: "Dan-O's Seasoning",
    image: "https://res.cloudinary.com/dtrxl120u/image/upload/v1759799151/dan-oliver_1200xx3163-3170-1048-0_zgphzw.jpg",
    text: "I've been ordering banners from these guys since before they even launched their new website. They've handled every single one of my banner needs since the day I started my business.",
  },
  {
    name: "Brandon Schaefer",
    company: "HempRise LLC",
    image: "https://res.cloudinary.com/dtrxl120u/image/upload/v1759933582/1758106259564_oysdje.jpg",
    text: "Best banner service I've used. The 24-hour turnaround saved our grand opening event. Quality exceeded expectations.",
  },
  {
    name: "Jennifer Chen",
    company: "Premier Events",
    image: "https://d64gsuwffb70l.cloudfront.net/68bb812d3c680d9a9bc2bdd7_1757118820418_895c1191.webp",
    text: "We order dozens of banners monthly for events. Banners On The Fly consistently delivers premium quality with fast turnaround.",
  },
];

// Calculate grommet positions for preview overlay
function calcGrommetPts(w: number, h: number, mode: string): { x: number; y: number }[] {
  const m = 1;
  const corners = [{ x: m, y: m }, { x: w - m, y: m }, { x: m, y: h - m }, { x: w - m, y: h - m }];
  if (mode === "none") return [];
  if (mode === "4-corners") return corners;
  if (mode === "top-corners") return [corners[0], corners[1]];
  if (mode === "left-corners") return [corners[0], corners[2]];
  if (mode === "right-corners") return [corners[1], corners[3]];
  const spacing = mode === "every-1-2ft" ? 18 : 24;
  const pts = [...corners];
  const uw = Math.max(0, w - 2 * m), nw = Math.floor(uw / spacing);
  if (nw > 0) { const ws = uw / (nw + 1); for (let i = 1; i <= nw; i++) { pts.push({ x: m + i * ws, y: m }); pts.push({ x: m + i * ws, y: h - m }); } }
  const uh = Math.max(0, h - 2 * m), nh = Math.floor(uh / spacing);
  if (nh > 0) { const hs = uh / (nh + 1); for (let i = 1; i <= nh; i++) { pts.push({ x: m, y: m + i * hs }); pts.push({ x: w - m, y: m + i * hs }); } }
  const seen = new Set<string>();
  return pts.filter(p => { const k = p.x.toFixed(2) + "," + p.y.toFixed(2); if (seen.has(k)) return false; seen.add(k); return true; });
}


// Convert Cloudinary PDF URL to an image thumbnail (renders page 1)
function getPdfThumbnailUrl(pdfUrl: string): string {
  if (!pdfUrl || !pdfUrl.includes('cloudinary.com') || !pdfUrl.toLowerCase().endsWith('.pdf')) return pdfUrl;
  return pdfUrl.replace('/upload/', '/upload/pg_1,f_jpg,w_800/');
}
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
  const [uploadedFile, setUploadedFile] = useState<{name: string; url: string; fileKey: string; size: number; isPdf: boolean; thumbnailUrl?: string} | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [activePreset, setActivePreset] = useState<number | null>(2);
  const [dragActive, setDragActive] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [promoCode, setPromoCode] = useState('');
  const [promoApplied, setPromoApplied] = useState(false);

  // Preview modal state
  const [showPreview, setShowPreview] = useState(false);
  const [imgPos, setImgPos] = useState({ x: 0, y: 0 });
  const [imgScale, setImgScale] = useState(1);
  const [fitMode, setFitMode] = useState<'fill' | 'fit' | 'stretch'>('fill');
  const [isDraggingPreview, setIsDraggingPreview] = useState(false);
  const [dragStartPt, setDragStartPt] = useState({ x: 0, y: 0 });
  const [dragStartPos, setDragStartPos] = useState({ x: 0, y: 0 });
  const [lastPinchDist, setLastPinchDist] = useState<number | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);

  const quoteStore = useQuoteStore();
  const cartStore = useCartStore();
  const { setIsCartOpen } = useUIStore();

  const widthIn = widthFt * 12 + widthInR;
  const heightIn = heightFt * 12 + heightInR;
  const sqft = (widthIn * heightIn) / 144;
  const totals = calcTotals({ widthIn, heightIn, qty: quantity, material, addRope, polePockets });

  const pricePerSqFt = PRICE_PER_SQFT[material];
  const materialLabel = MATERIALS.find(m => m.mapped === material)?.label || '13oz Vinyl';
  const grommetsLabel = GROMMET_OPTIONS.find(o => o.value === grommets)?.label || 'None';
  const widthDisplay = widthInR > 0 ? `${widthFt}'${widthInR}"` : `${widthFt}'`;
  const heightDisplay = heightInR > 0 ? `${heightFt}'${heightInR}"` : `${heightFt}'`;

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

  const handlePromoApply = () => {
    if (promoCode.trim().toUpperCase() === 'NEW20') {
      setPromoApplied(true);
    }
  };

  // Compress images client-side to stay under Netlify's 6 MB function limit
  const compressImage = useCallback(async (file: File): Promise<File> => {
    // Skip PDFs and files already under 4.5 MB
    if (file.type === 'application/pdf' || file.size <= 4.5 * 1024 * 1024) return file;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        // Cap at 4000px on longest side to keep file size reasonable
        const maxDim = 4000;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          const ratio = Math.min(maxDim / width, maxDim / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(file); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob((blob) => {
          if (!blob || blob.size >= file.size) { resolve(file); return; }
          const compressed = new File([blob], file.name.replace(/.png$/i, '.jpg'), { type: 'image/jpeg' });
          console.log('Compressed:', file.size, '->', compressed.size);
          resolve(compressed);
        }, 'image/jpeg', 0.85);
      };
      img.onerror = () => resolve(file);
      img.src = URL.createObjectURL(file);
    });
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    setUploadError('');
    const accepted = ['application/pdf','image/jpeg','image/png'];
    const ext = file.name.split('.').pop()?.toLowerCase() || '';
    if (!accepted.includes(file.type) && !['pdf','png','jpg','jpeg'].includes(ext)) {
      setUploadError('Please upload a PDF, PNG, JPG, or JPEG file.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File must be under 10 MB.');
      return;
    }
    setIsUploading(true);
    try {
      const uploadFile = await compressImage(file);
      const formData = new FormData();
      formData.append('file', uploadFile);
      const res = await fetch('/.netlify/functions/upload-file', { method: 'POST', body: formData });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      setUploadedFile({ name: file.name, url: data.secureUrl, fileKey: data.fileKey || data.publicId, size: file.size, isPdf: file.type === 'application/pdf', thumbnailUrl: file.type === 'application/pdf' ? getPdfThumbnailUrl(data.secureUrl) : undefined });
    } catch {
      setUploadError('Upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [compressImage]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) handleFileUpload(f);
  }, [handleFileUpload]);

  // Open preview modal instead of going straight to checkout
  const handleCheckout = useCallback(() => {
    if (!uploadedFile) return;
    setImgPos({ x: 0, y: 0 });
    setImgScale(1);
    setShowPreview(true);
  }, [uploadedFile]);

  const doCheckout = useCallback((pos: { x: number; y: number }, scale: number) => {
    if (!uploadedFile) return;
    quoteStore.set({
      widthIn, heightIn, quantity, material,
      grommets: grommets as any, polePockets, addRope,
      imagePosition: pos,
      imageScale: scale,
      fitMode: fitMode,
      thumbnailUrl: uploadedFile.thumbnailUrl,
      file: { name: uploadedFile.name, url: uploadedFile.url, fileKey: uploadedFile.fileKey, size: uploadedFile.size, isPdf: uploadedFile.isPdf, thumbnailUrl: uploadedFile.thumbnailUrl, type: uploadedFile.isPdf ? 'application/pdf' : 'image/*' } as any,
    });
    const pricing = {
      unit_price_cents: Math.round(totals.unit * 100),
      rope_cost_cents: Math.round(totals.rope * 100),
      pole_pocket_cost_cents: Math.round(totals.polePocket * 100),
      line_total_cents: Math.round(totals.materialTotal * 100),
    };
    cartStore.addFromQuote(useQuoteStore.getState(), undefined, pricing);
    setIsCartOpen(true);
    setShowPreview(false);
    navigate('/checkout');
  }, [uploadedFile, widthIn, heightIn, material, grommets, polePockets, addRope, totals, quoteStore, cartStore, setIsCartOpen, navigate]);

  // Preview drag handlers
  const onPreviewMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsDraggingPreview(true);
    setDragStartPt({ x: e.clientX, y: e.clientY });
    setDragStartPos({ ...imgPos });
  }, [imgPos]);

  const onPreviewMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingPreview) return;
    const dx = (e.clientX - dragStartPt.x) * 1.5;
    const dy = (e.clientY - dragStartPt.y) * 1.5;
    setImgPos({ x: dragStartPos.x + dx, y: dragStartPos.y + dy });
  }, [isDraggingPreview, dragStartPt, dragStartPos]);

  const onPreviewMouseUp = useCallback(() => {
    setIsDraggingPreview(false);
  }, []);

  const onPreviewTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      setLastPinchDist(Math.sqrt(dx * dx + dy * dy));
      setIsDraggingPreview(false);
      return;
    }
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    setIsDraggingPreview(true);
    setDragStartPt({ x: t.clientX, y: t.clientY });
    setDragStartPos({ ...imgPos });
  }, [imgPos]);

  const onPreviewTouchMove = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 2 && lastPinchDist !== null) {
      e.preventDefault();
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const delta = dist / lastPinchDist;
      setImgScale(s => Math.min(3, Math.max(0.5, s * delta)));
      setLastPinchDist(dist);
      return;
    }
    if (!isDraggingPreview || e.touches.length !== 1) return;
    e.preventDefault();
    const t = e.touches[0];
    const dx2 = (t.clientX - dragStartPt.x) * 1.5;
    const dy2 = (t.clientY - dragStartPt.y) * 1.5;
    setImgPos({ x: dragStartPos.x + dx2, y: dragStartPos.y + dy2 });
  }, [isDraggingPreview, dragStartPt, dragStartPos, lastPinchDist]);

  const onPreviewTouchEnd = useCallback(() => {
    setIsDraggingPreview(false);
    setLastPinchDist(null);
  }, []);

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
        <section className="px-4 pt-10 pb-12 md:pt-14 md:pb-14" style={{ background: 'linear-gradient(180deg, #F9FAFB 0%, #EEF2F7 100%)' }}>
          <div className="max-w-2xl mx-auto text-center space-y-5">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-tight">
              Custom Banner Printing
              <br />
              <span className="text-orange-500">24-Hour Production</span>
            </h1>

            <p className="text-base md:text-lg text-gray-500 max-w-lg mx-auto leading-relaxed">
              Upload your file, pick a size, and get <strong className="text-gray-700">FREE Next-Day Air Shipping</strong>.
            </p>

            {/* Inline benefit pills */}
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[13px] text-gray-500">
              {[
                { icon: <Clock className="h-3.5 w-3.5 text-orange-500" />, label: '24-Hr Print' },
                { icon: <Truck className="h-3.5 w-3.5 text-orange-500" />, label: 'Free Next-Day Air' },
                { icon: <Tag className="h-3.5 w-3.5 text-orange-500" />, label: '20% Off \u00b7 NEW20' },
                { icon: <Brush className="h-3.5 w-3.5 text-orange-500" />, label: 'Designer Reviewed' },
              ].map((b, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 font-medium">
                  {b.icon} {b.label}
                </span>
              ))}
            </div>

            <div className="pt-2 flex flex-col items-center gap-2">
              <button
                onClick={scrollToOrder}
                className="group inline-flex items-center justify-center gap-2 bg-orange-500 hover:bg-orange-600 active:scale-[0.98] text-white font-bold text-lg px-10 py-4 rounded-xl shadow-[0_4px_14px_rgba(251,146,60,0.4)] hover:shadow-[0_6px_20px_rgba(251,146,60,0.5)] transition-all w-full sm:w-auto"
              >
                Start Your Order
                <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-0.5" />
              </button>
              <span className="text-xs text-gray-400">Takes less than 60 seconds &middot; <a href="/design" className="underline hover:text-gray-600">or use our free design tool</a></span>
            </div>
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
                  <p className="text-xs text-gray-400 mt-1.5">{MATERIALS.find(m => m.mapped === material)?.desc}</p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">Upload Your Artwork</label>
                  {!uploadedFile ? (
                    <div onDrop={onDrop} onDragOver={e => { e.preventDefault(); setDragActive(true); }} onDragLeave={() => setDragActive(false)} onClick={() => fileInputRef.current?.click()} className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${dragActive ? 'border-orange-400 bg-orange-50 scale-[1.01] shadow-md' : 'border-gray-300 bg-gray-50/50 hover:border-orange-300 hover:bg-orange-50/30'}`}>
                      <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,application/pdf,.png,.jpg,.jpeg,.pdf" onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); }} className="hidden" />
                      {isUploading ? (
                        <div className="flex flex-col items-center">
                          <Loader2 className="h-10 w-10 text-orange-500 animate-spin mb-2" />
                          <p className="text-sm text-gray-600">Uploading...</p>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-10 w-10 text-gray-400 mx-auto mb-3" />
                          <p className="font-semibold text-gray-800">Drag &amp; Drop or Click to Upload</p>
                          <p className="text-xs text-gray-500 mt-1">PDF, PNG, JPG, JPEG — Max 10 MB</p>
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
                  <p className="text-sm text-gray-500 mt-1">{usd(pricePerSqFt)}/sq ft</p>

                  <div className="text-left text-sm text-gray-600 space-y-1 mt-4 mb-2">
                    <p><strong>Size:</strong> {widthDisplay} × {heightDisplay} ({sqft.toFixed(1)} sq ft)</p>
                    <p><strong>Material:</strong> {materialLabel}</p>
                    <p><strong>Quantity:</strong> {quantity}</p>
                    <p><strong>Grommets:</strong> {grommetsLabel}</p>
                    {polePockets !== 'none' && <p><strong>Pole Pockets:</strong> {polePockets}</p>}
                    {addRope && <p><strong>Rope:</strong> Included</p>}
                  </div>

                  {/* Promo Code */}
                  <div className="mt-3 mb-2">
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={promoCode}
                        onChange={e => setPromoCode(e.target.value.toUpperCase())}
                        placeholder="Promo Code"
                        className="flex-1 border rounded-xl px-3 py-2 text-sm"
                      />
                      <button onClick={handlePromoApply} className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-xl text-sm font-medium">
                        Apply
                      </button>
                    </div>
                    {promoApplied && <p className="text-xs text-green-600 mt-1">✓ 20% discount applied!</p>}
                  </div>
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
                <div className="flex items-center justify-center gap-1.5 text-xs text-gray-400 mt-2">
                  <Mail className="h-3 w-3" />
                  <span>Questions? support@bannersonthefly.com</span>
                </div>
                {!uploadedFile && <p className="text-xs text-center text-gray-400">Upload your artwork to continue</p>}
              </div>
            </div>
          </div>
        </section>


        {/* Testimonials */}
        <section className="py-12 px-4 bg-white">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-2xl font-bold text-center mb-8">What Our Customers Say</h2>
            <div className="grid md:grid-cols-3 gap-6">
              {TESTIMONIALS.map((t, i) => (
                <div key={i} className="bg-gray-50 rounded-xl p-5 border border-gray-100">
                  <div className="flex items-center gap-3 mb-3">
                    <img src={t.image} alt={t.name} className="w-10 h-10 rounded-full object-cover" loading="lazy" />
                    <div>
                      <p className="font-semibold text-sm text-gray-800">{t.name}</p>
                      <p className="text-xs text-gray-400">{t.company}</p>
                    </div>
                  </div>
                  <div className="flex gap-0.5 mb-2">
                    {[...Array(5)].map((_, j) => <Star key={j} className="h-3.5 w-3.5 fill-orange-400 text-orange-400" />)}
                  </div>
                  <p className="text-sm text-gray-600 leading-relaxed">{t.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-10 px-4 bg-gray-50">
          <div className="max-w-4xl mx-auto">
            <h2 className="text-lg font-bold text-center mb-5">Built to Last</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <Droplets className="h-7 w-7 text-blue-500 mx-auto mb-1" />
                <p className="text-xs md:text-sm font-medium text-gray-700">Weather Resistant</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <Palette className="h-7 w-7 text-purple-500 mx-auto mb-1" />
                <p className="text-xs md:text-sm font-medium text-gray-700">Vibrant CMYK Colors</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <Sun className="h-7 w-7 text-yellow-500 mx-auto mb-1" />
                <p className="text-xs md:text-sm font-medium text-gray-700">UV Fade Resistant</p>
              </div>
              <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
                <Wind className="h-7 w-7 text-teal-500 mx-auto mb-1" />
                <p className="text-xs md:text-sm font-medium text-gray-700">Indoor &amp; Outdoor Use</p>
              </div>
            </div>
          </div>
        </section>

        <div className="py-4 text-center text-xs text-gray-400 border-t border-gray-100">
          <div className="mb-2">
            <Link to="/terms" className="hover:text-gray-600">Terms</Link>
            <span className="mx-2">&middot;</span>
            <Link to="/privacy" className="hover:text-gray-600">Privacy</Link>
            <span className="mx-2">&middot;</span>
            <Link to="/shipping" className="hover:text-gray-600">Shipping</Link>
          </div>
          &copy; {new Date().getFullYear()} Banners On The Fly. All rights reserved.
        </div>
      </div>

        {/* Mobile sticky CTA */}
        <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-lg z-40">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-gray-500">Total</p>
              <p className="text-xl font-bold text-gray-900">{usd(totals.materialTotal)}</p>
            </div>
            <button
              onClick={uploadedFile ? handleCheckout : scrollToOrder}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 px-6 rounded-xl"
            >
              {uploadedFile ? 'Checkout' : 'Start Order'}
            </button>
          </div>
        </div>

      {/* Preview Modal */}
      {showPreview && uploadedFile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-bold text-gray-900">Position Your Image</h3>
              <button onClick={() => setShowPreview(false)} className="p-1 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 flex-1 overflow-auto">
              <p className="text-sm text-gray-500 mb-3 flex items-center gap-1"><Move className="w-4 h-4" /> {fitMode === 'fill' ? 'Drag to reposition · Pinch or use buttons to zoom' : 'Choose how your image fits the banner'}</p>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium text-gray-500">Fit:</span>
                {(['fill', 'fit', 'stretch'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => { setFitMode(mode); if (mode !== 'fill') { setImgPos({ x: 0, y: 0 }); setImgScale(1); } }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${fitMode === mode ? 'bg-orange-500 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                  >
                    {mode.charAt(0).toUpperCase() + mode.slice(1)}
                  </button>
                ))}
              </div>
              <div
                ref={previewContainerRef}
                className="relative w-full border-2 border-dashed border-gray-300 rounded-lg overflow-hidden select-none"
                style={{ aspectRatio: `${widthIn} / ${heightIn}`, cursor: isDraggingPreview ? "grabbing" : "grab" }}
                onMouseDown={onPreviewMouseDown}
                onMouseMove={onPreviewMouseMove}
                onMouseUp={onPreviewMouseUp}
                onMouseLeave={onPreviewMouseUp}
                onTouchStart={onPreviewTouchStart}
                onTouchMove={onPreviewTouchMove}
                onTouchEnd={onPreviewTouchEnd}
              >
                <img
                  src={uploadedFile.thumbnailUrl || uploadedFile.url}
                  alt="Banner preview"
                  className={`absolute inset-0 w-full h-full pointer-events-none ${fitMode === 'fill' ? 'object-cover' : fitMode === 'fit' ? 'object-contain' : 'object-fill'}`}
                  style={fitMode === 'fill' ? { transform: `translate(${imgPos.x}px, ${imgPos.y}px) scale(${imgScale})` } : {}}
                  draggable={false}
                />
                {/* Grommet overlay */}
                {grommets !== "none" && calcGrommetPts(widthIn, heightIn, grommets).map((pos, idx) => {
                  const leftPct = (pos.x / widthIn) * 100;
                  const topPct = (pos.y / heightIn) * 100;
                  const dotSize = Math.max(6, Math.min(12, 200 / Math.max(widthIn, heightIn)));
                  return (
                    <div key={`grommet-preview-${idx}`} className="absolute rounded-full pointer-events-none" style={{ left: `${leftPct}%`, top: `${topPct}%`, width: `${dotSize}px`, height: `${dotSize}px`, transform: "translate(-50%, -50%)", background: "radial-gradient(circle at 30% 30%, #e2e8f0, #4a5568)", border: "1px solid #2d3748", boxShadow: "inset 0 1px 2px rgba(0,0,0,0.3), 0 1px 1px rgba(0,0,0,0.2)", zIndex: 10 }}>
                      <div className="absolute rounded-full" style={{ left: "50%", top: "50%", width: "50%", height: "50%", transform: "translate(-50%, -50%)", background: "#f7fafc", border: "0.5px solid #cbd5e0" }} />
                    </div>
                  );
                })}
              </div>
              {fitMode === 'fill' && <div className="flex items-center justify-center gap-4 mt-3">
                <button onClick={() => setImgScale(s => Math.max(0.5, s - 0.1))} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"><ZoomOut className="w-5 h-5" /></button>
                <span className="text-sm font-medium text-gray-600">{Math.round(imgScale * 100)}%</span>
                <button onClick={() => setImgScale(s => Math.min(3, s + 0.1))} className="p-2 rounded-lg bg-gray-100 hover:bg-gray-200"><ZoomIn className="w-5 h-5" /></button>
                <button onClick={() => { setImgPos({ x: 0, y: 0 }); setImgScale(1); }} className="text-sm text-orange-600 hover:text-orange-700 font-medium ml-2">Reset</button>
              </div>}
            </div>
            <div className="flex gap-3 p-4 border-t">
              <button onClick={() => setShowPreview(false)} className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-700 font-semibold hover:bg-gray-50">Cancel</button>
              <button onClick={() => doCheckout(imgPos, imgScale)} className="flex-1 py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-semibold shadow-lg">Confirm & Checkout</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default GoogleAdsBanner;
