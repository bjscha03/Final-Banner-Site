import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  GraduationCap,
  Upload,
  Sparkles,
  Truck,
  Clock,
  ShieldCheck,
  CheckCircle,
  ArrowRight,
  Loader2,
  Image as ImageIcon,
  Trash2,
} from 'lucide-react';
import Layout from '@/components/Layout';
import { useToast } from '@/components/ui/use-toast';
import { useCartStore } from '@/store/cart';
import type { MaterialKey } from '@/store/quote';
import { calculateBannerPricing } from '@/lib/bannerPricingEngine';
import {
  calcCarMagnetPricing,
  CAR_MAGNET_SIZES,
  CAR_MAGNET_ROUNDED_CORNERS,
  getCarMagnetRoundedCornersLabel,
  type CarMagnetRoundedCorner,
} from '@/lib/car-magnet-pricing';
import {
  calcYardSignPricing,
  validateYardSignQuantity,
  YARD_SIGN_INCREMENT,
  YARD_SIGN_MIN_QUANTITY,
  YARD_SIGN_MAX_QUANTITY,
  type YardSignSidedness,
} from '@/lib/yard-sign-pricing';
import { DESIGN_GROMMET_OPTIONS } from '@/lib/grommets';
import { BANNER_MATERIALS, getBannerMaterialByKey } from '@/lib/banner-materials';
import { usd } from '@/lib/pricing';

type ProductType = 'banner' | 'yard_sign' | 'car_magnet';
type Flow = null | 'upload' | 'designer';

interface InspirationFile {
  name: string;
  url: string;
  fileKey: string;
  category: 'inspiration' | 'graduate_photo' | 'school_logo';
  size: number;
}

const PRODUCT_LABELS: Record<ProductType, string> = {
  banner: 'Banner',
  yard_sign: 'Yard Sign',
  car_magnet: 'Car Magnet',
};

// /design supports `?product=banner|yard-signs|car-magnets`
const PRODUCT_QUERY_SLUG: Record<ProductType, string> = {
  banner: 'banner',
  yard_sign: 'yard-signs',
  car_magnet: 'car-magnets',
};

// Banner size presets — match the normal banner builder (`src/pages/Design.tsx` PRESET_SIZES).
const BANNER_SIZE_PRESETS = [
  "2' × 4'",
  "2' × 6'",
  "3' × 6'",
  "3' × 8'",
  "4' × 8'",
  "4' × 10'",
  'Custom',
];

// Banner pole-pocket option values match the normal banner builder dropdown
// in `src/pages/Design.tsx` (and the `PolePocketPosition` type in
// `src/lib/bannerPricingEngine.ts`).
const POLE_POCKET_OPTIONS: { value: string; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'top-bottom', label: 'Top & Bottom' },
  { value: 'left', label: 'Left' },
  { value: 'right', label: 'Right' },
];

const STYLE_OPTIONS = [
  'Clean / Classic',
  'Bold / Sports',
  'Elegant',
  'School Spirit',
  'Fun / Party',
  'Custom / Other',
];

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Can I upload my own graduation design?',
    a: 'Yes! Choose “Upload My Own Design” to use our normal banner, yard sign, or car magnet builder. You\u2019ll see a live preview and can add to cart immediately.',
  },
  {
    q: 'Can you design it for me?',
    a: 'Absolutely. Choose “Let Our Designers Design It For You,” fill out the intake form, and pay a $19 design fee. Our designers create a custom proof for you to review.',
  },
  {
    q: 'When does production start?',
    a: 'For uploaded designs, production starts as soon as your order is paid. For designer-assisted orders, production begins after you approve your proof and pay the final product balance.',
  },
  {
    q: 'How long does shipping take?',
    a: 'All orders ship FREE next-day air after production is complete. Most orders are produced within 24 hours of approval.',
  },
  {
    q: 'What happens if I need edits?',
    a: 'On the proof approval page you can request edits with notes. Our designers will revise the proof and send you a new version for review.',
  },
];

const INTAKE_STORAGE_KEY = 'graduation_intake_draft';

const GraduationSigns: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const addDesignDeposit = useCartStore((state) => state.addDesignDeposit);

  const [flow, setFlow] = useState<Flow>(null);

  // Upload-Own-Design product picker
  const [uploadProduct, setUploadProduct] = useState<ProductType>('banner');

  // Designer-assisted intake form state
  const [submitting, setSubmitting] = useState(false);

  const [customer, setCustomer] = useState({ name: '', email: '', phone: '' });
  const [graduate, setGraduate] = useState({
    graduateName: '',
    schoolName: '',
    graduationYear: '',
    schoolColors: '',
    graduationDate: '',
    partyDate: '',
  });
  const [designerProduct, setDesignerProduct] = useState<ProductType>('banner');

  // Banner specs
  const [bannerSpecs, setBannerSpecs] = useState({
    sizePreset: "3' × 6'",
    customSize: '',
    // Stored as the shared MaterialKey ('13oz' | '15oz' | '18oz' | 'mesh')
    // so the same value feeds the pricing engine and the material lookup.
    material: '13oz' as MaterialKey,
    quantity: 1,
    grommets: '4-corners',
    polePockets: 'none',
    addRope: false,
    sidedness: 'single',
  });
  const [bannerMaterialDropdownOpen, setBannerMaterialDropdownOpen] = useState(false);

  // Yard sign specs — fixed 24" × 18" corrugated plastic, like the normal builder.
  const [yardSignSpecs, setYardSignSpecs] = useState({
    quantity: YARD_SIGN_MIN_QUANTITY,
    sidedness: 'single' as YardSignSidedness,
    addStakes: true,
  });

  // Car magnet specs — sourced from CAR_MAGNET_SIZES / CAR_MAGNET_ROUNDED_CORNERS.
  const [carMagnetSpecs, setCarMagnetSpecs] = useState({
    size: CAR_MAGNET_SIZES[0].label,
    quantity: 1,
    roundedCorners: 'none' as CarMagnetRoundedCorner,
  });

  // Design direction
  const [designDirection, setDesignDirection] = useState({
    colorsStyle: '',
    mainText: '',
    secondaryText: '',
    contactInfo: '',
    notes: '',
    preferredStyle: 'School Spirit',
  });

  // Inspiration files (uploaded to Cloudinary via /.netlify/functions/upload-file)
  const [files, setFiles] = useState<InspirationFile[]>([]);
  const [uploadingCategory, setUploadingCategory] = useState<InspirationFile['category'] | null>(null);

  const handleStartOver = () => {
    setFlow(null);
    try { sessionStorage.removeItem(INTAKE_STORAGE_KEY); } catch (_e) {}
  };

  const navigateToBuilder = (product: ProductType) => {
    navigate(`/design?product=${PRODUCT_QUERY_SLUG[product]}&theme=graduation`);
    setTimeout(() => window.scrollTo({ top: 0, behavior: 'smooth' }), 50);
  };

  const handleFileUpload = useCallback(
    async (file: File, category: InspirationFile['category']) => {
      if (file.size > 25 * 1024 * 1024) {
        toast({
          title: 'File too large',
          description: 'Please upload a file under 25MB.',
          variant: 'destructive',
        });
        return;
      }
      if (files.length >= 8) {
        toast({
          title: 'Too many files',
          description: 'You can upload up to 8 inspiration files.',
          variant: 'destructive',
        });
        return;
      }
      setUploadingCategory(category);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/.netlify/functions/upload-file', { method: 'POST', body: fd });
        if (!res.ok) throw new Error('Upload failed');
        const data = await res.json();
        if (!data.secureUrl) throw new Error('Upload returned no URL');
        setFiles((prev) => [
          ...prev,
          {
            name: file.name,
            url: data.secureUrl,
            fileKey: data.fileKey || data.publicId || '',
            category,
            size: file.size,
          },
        ]);
      } catch (err) {
        console.error('Inspiration upload failed:', err);
        toast({
          title: 'Upload failed',
          description: 'Please try again or skip the upload.',
          variant: 'destructive',
        });
      } finally {
        setUploadingCategory(null);
      }
    },
    [files.length, toast]
  );

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const productSpecsFor = (p: ProductType) => {
    if (p === 'banner') {
      const { sizePreset, customSize, material, ...rest } = bannerSpecs;
      const matLabel = getBannerMaterialByKey(material).label;
      return {
        size: sizePreset === 'Custom' ? customSize || 'Custom (TBD)' : sizePreset,
        material: matLabel,
        ...rest,
      };
    }
    if (p === 'yard_sign') {
      return {
        size: '24" × 18"',
        material: 'Corrugated Plastic',
        ...yardSignSpecs,
      };
    }
    return {
      ...carMagnetSpecs,
      material: 'Premium Magnetic Material',
      roundedCornersLabel: getCarMagnetRoundedCornersLabel(carMagnetSpecs.roundedCorners),
    };
  };

  /**
   * Live estimated product price for the designer-assisted intake form.
   *
   * Reuses the same pricing engines as the regular product builders so the
   * preview the customer sees here matches what they'll be charged for the
   * final product balance after proof approval. Returns null when the
   * configuration cannot be priced (e.g. custom banner size with no W×H typed).
   */
  const estimate = useMemo(() => {
    try {
      if (designerProduct === 'banner') {
        const sizeStr = bannerSpecs.sizePreset === 'Custom' ? bannerSpecs.customSize : bannerSpecs.sizePreset;
        const m = (sizeStr || '')
          .replace(/[\u201C\u201D\u2033]/g, '"')
          .replace(/×/g, 'x')
          .match(/(\d+(?:\.\d+)?)\s*('|")?\s*x\s*(\d+(?:\.\d+)?)\s*('|")?/i);
        if (!m) return null;
        const isFeetW = m[2] === "'";
        const isFeetH = m[4] === "'" || (!m[4] && isFeetW);
        const widthIn = Number(m[1]) * (isFeetW ? 12 : 1);
        const heightIn = Number(m[3]) * (isFeetH ? 12 : 1);
        const result = calculateBannerPricing({
          widthIn,
          heightIn,
          quantity: Math.max(1, Number(bannerSpecs.quantity) || 1),
          material: bannerSpecs.material,
          addRope: bannerSpecs.addRope,
          polePockets: bannerSpecs.polePockets,
          grommets: bannerSpecs.grommets,
        });
        return {
          subtotalCents: result.subtotalCents,
          taxCents: result.taxCents,
          totalCents: result.totalCents,
        };
      }
      if (designerProduct === 'yard_sign') {
        const sidedness: YardSignSidedness = yardSignSpecs.sidedness === 'double' ? 'double' : 'single';
        const qty = Math.max(YARD_SIGN_MIN_QUANTITY, Number(yardSignSpecs.quantity) || YARD_SIGN_MIN_QUANTITY);
        const addStakes = yardSignSpecs.addStakes === true;
        const r = calcYardSignPricing(sidedness, qty, addStakes, qty, 0);
        return { subtotalCents: r.subtotalCents, taxCents: r.taxCents, totalCents: r.totalWithTaxCents };
      }
      if (designerProduct === 'car_magnet') {
        const match = CAR_MAGNET_SIZES.find((o) => o.label === carMagnetSpecs.size) || CAR_MAGNET_SIZES[0];
        const r = calcCarMagnetPricing(match.widthIn, match.heightIn, Math.max(1, Number(carMagnetSpecs.quantity) || 1));
        return { subtotalCents: r.subtotalCents, taxCents: r.taxCents, totalCents: r.totalCents };
      }
    } catch (_e) {
      return null;
    }
    return null;
  }, [designerProduct, bannerSpecs, yardSignSpecs, carMagnetSpecs]);


  const handleIntakeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;

    if (!customer.name.trim() || !customer.email.trim() || !customer.phone.trim()) {
      toast({
        title: 'Missing customer info',
        description: 'Please provide your name, email, and phone number.',
        variant: 'destructive',
      });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email.trim())) {
      toast({
        title: 'Invalid email',
        description: 'Please enter a valid email address.',
        variant: 'destructive',
      });
      return;
    }
    if (!graduate.graduateName.trim() || !graduate.schoolName.trim() || !graduate.graduationYear.trim()) {
      toast({
        title: 'Missing graduate info',
        description: 'Please provide the graduate\u2019s name, school, and graduation year.',
        variant: 'destructive',
      });
      return;
    }

    // Yard signs follow the same business rules as the normal builder:
    // multiples of YARD_SIGN_INCREMENT, between min and max.
    if (designerProduct === 'yard_sign') {
      const v = validateYardSignQuantity(yardSignSpecs.quantity);
      if (!v.valid) {
        toast({
          title: 'Invalid yard sign quantity',
          description: v.message || `Order in increments of ${YARD_SIGN_INCREMENT} (min ${YARD_SIGN_MIN_QUANTITY}, max ${YARD_SIGN_MAX_QUANTITY}).`,
          variant: 'destructive',
        });
        return;
      }
    }

    setSubmitting(true);
    try {
      const body = {
        customerName: customer.name.trim(),
        customerEmail: customer.email.trim(),
        customerPhone: customer.phone.trim(),
        productType: designerProduct,
        productSpecs: productSpecsFor(designerProduct),
        graduateInfo: { ...graduate },
        designNotes: { ...designDirection },
        inspirationFiles: files.map((f) => ({
          name: f.name,
          url: f.url,
          fileKey: f.fileKey,
          category: f.category,
        })),
        // Client-computed estimate is a hint only — server recomputes
        // authoritatively and stores its own value on the intake row.
        estimatedProductSubtotalCents: estimate?.subtotalCents ?? null,
        estimatedTaxCents: estimate?.taxCents ?? null,
        estimatedProductTotalCents: estimate?.totalCents ?? null,
      };
      const res = await fetch('/.netlify/functions/designer-intake-submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Submission failed');
      }

      // Intake saved as pending_payment — add $19 deposit to cart and go to checkout.
      // Pass the SERVER-validated estimate (falling back to local) so post-payment
      // emails reliably include it even for older intake rows.
      addDesignDeposit({
        intakeId: data.intakeId,
        customerName: customer.name.trim(),
        customerEmail: customer.email.trim(),
        graduateName: graduate.graduateName.trim(),
        schoolName: graduate.schoolName.trim(),
        graduationYear: graduate.graduationYear.trim(),
        productType: designerProduct,
        estimatedProductSubtotalCents: data.estimatedProductSubtotalCents ?? estimate?.subtotalCents ?? null,
        estimatedTaxCents: data.estimatedTaxCents ?? estimate?.taxCents ?? null,
        estimatedProductTotalCents: data.estimatedProductTotalCents ?? estimate?.totalCents ?? null,
      });

      try { sessionStorage.removeItem(INTAKE_STORAGE_KEY); } catch (_e) {}
      navigate('/checkout');
    } catch (err) {
      console.error('Designer intake submit failed:', err);
      toast({
        title: 'Submission failed',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Layout>
      <Helmet>
        <title>Custom Graduation Signs – Designed For You | Banners On The Fly</title>
        <meta
          name="description"
          content="Upload your own design or let our designers create one. Printed in 24 hours with free next-day air shipping."
        />
        <meta property="og:title" content="Custom Graduation Signs – Designed For You" />
        <meta
          property="og:description"
          content="Upload your own design or let our designers create one. Printed in 24 hours with free next-day air shipping."
        />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://bannersonthefly.com/graduation-signs" />
        <meta
          property="og:image"
          content="https://res.cloudinary.com/dtrxl120u/image/upload/v1777021980/Graduation_hero_xw9rnh.png"
        />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Custom Graduation Signs – Designed For You" />
        <meta
          name="twitter:description"
          content="Upload your own design or let our designers create one. Printed in 24 hours with free next-day air shipping."
        />
        <meta
          name="twitter:image"
          content="https://res.cloudinary.com/dtrxl120u/image/upload/v1777021980/Graduation_hero_xw9rnh.png"
        />
      </Helmet>

      {/* Hero */}
      <section className="relative text-white overflow-hidden bg-[#0B1F3A]">
        {/* Background image */}
        <div
          className="absolute inset-0 bg-cover bg-center sm:bg-right"
          style={{
            backgroundImage:
              "url('https://res.cloudinary.com/dtrxl120u/image/upload/v1777023371/hero_tbmims.png')",
          }}
          aria-hidden="true"
        />
        {/* Dark left-side gradient overlay for text readability */}
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(to right, rgba(11,31,58,0.92) 0%, rgba(11,31,58,0.88) 35%, rgba(11,31,58,0.65) 55%, rgba(11,31,58,0.2) 75%, rgba(11,31,58,0) 100%)',
          }}
          aria-hidden="true"
        />
        {/* Soft blur on left portion for high-end look */}
        <div
          className="absolute inset-0"
          style={{
            backdropFilter: 'blur(4px)',
            WebkitBackdropFilter: 'blur(4px)',
            maskImage: 'linear-gradient(to right, black 0%, black 50%, transparent 75%)',
            WebkitMaskImage: 'linear-gradient(to right, black 0%, black 50%, transparent 75%)',
          }}
          aria-hidden="true"
        />
        <div className="relative z-[2] max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-24 lg:py-32">
          <div className="max-w-xl lg:max-w-lg">
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 backdrop-blur px-4 py-1.5 text-sm font-semibold mb-6 ring-1 ring-white/20">
              <GraduationCap className="h-4 w-4 text-[#FF6A00]" /> Class of {new Date().getFullYear()}
            </div>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight leading-tight text-white">
              Custom <span className="text-[#FF6A00]">Graduation Signs</span> Made Easy
            </h1>
            <p className="mt-5 text-lg md:text-xl text-white/90">
              Upload your own design or let our designers create one for you.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  setFlow('upload');
                  setTimeout(
                    () => document.getElementById('flow-section')?.scrollIntoView({ behavior: 'smooth' }),
                    50
                  );
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-[#FF6A00] hover:bg-[#E65F00] text-white font-bold px-6 py-3.5 text-base shadow-lg transition"
              >
                <Upload className="h-5 w-5" /> Upload My Design
              </button>
              <button
                type="button"
                onClick={() => {
                  setFlow('designer');
                  setTimeout(
                    () => document.getElementById('flow-section')?.scrollIntoView({ behavior: 'smooth' }),
                    50
                  );
                }}
                className="inline-flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/30 text-white font-bold px-6 py-3.5 text-base shadow-lg transition backdrop-blur"
              >
                <Sparkles className="h-5 w-5" /> Have Us Design It
              </button>
            </div>
            <p className="mt-4 text-xs text-white/70 max-w-sm">
              Need a design? Start with a $19 design deposit. We'll create a proof, email it for approval, then you pay the final product balance after you approve.
            </p>
            <ul className="mt-6 grid sm:grid-cols-2 gap-2.5 text-sm font-medium">
              {[
                { icon: Clock, text: 'Printed in 24 hours after approval' },
                { icon: Truck, text: 'FREE next-day air shipping' },
              ].map(({ icon: Icon, text }, i) => (
                <li key={i} className="flex items-center gap-2 text-white/90">
                  <Icon className="h-4 w-4 flex-shrink-0 text-[#FF6A00]" />
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Choose how to start */}
      <section id="choose" className="bg-[#F7F7F7] py-14 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-[#0B1F3A]">
              Choose how you want to start
            </h2>
            <p className="mt-3 text-gray-600 max-w-2xl mx-auto">
              Upload artwork you already have, or let our team design something custom for your
              graduate. Either way, we print and ship fast.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6 items-stretch">
            <button
              type="button"
              onClick={() => {
                setFlow('upload');
                setTimeout(
                  () => document.getElementById('flow-section')?.scrollIntoView({ behavior: 'smooth' }),
                  50
                );
              }}
              className={`text-left rounded-2xl border bg-white p-7 shadow-sm hover:shadow-md transition group ${
                flow === 'upload'
                  ? 'border-[#FF6A00] ring-2 ring-[#FF6A00]/30'
                  : 'border-[#E5E5E5] hover:border-[#FF6A00]/50'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#0B1F3A]/5 text-[#0B1F3A]">
                  <Upload className="h-6 w-6" />
                </span>
                <h3 className="text-2xl font-bold text-[#0B1F3A]">Upload My Own Design</h3>
              </div>
              <p className="text-gray-600">
                Already have a graduation design? Upload your artwork, choose your product, and check
                out in minutes with our normal builder.
              </p>
              <div className="mt-5 inline-flex items-center font-semibold text-[#FF6A00] group-hover:gap-2 gap-1 transition-all">
                Start uploading <ArrowRight className="h-4 w-4" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setFlow('designer');
                setTimeout(
                  () => document.getElementById('flow-section')?.scrollIntoView({ behavior: 'smooth' }),
                  50
                );
              }}
              className={`relative text-left rounded-2xl border-2 bg-white p-7 shadow-md hover:shadow-xl transition group ${
                flow === 'designer'
                  ? 'border-[#FF6A00] ring-2 ring-[#FF6A00]/30'
                  : 'border-[#FF6A00]'
              }`}
            >
              <span className="absolute -top-3 left-7 inline-flex items-center rounded-full bg-[#FF6A00] px-3 py-0.5 text-xs font-bold uppercase tracking-wide text-white shadow">
                Most Popular
              </span>
              <div className="flex items-center gap-3 mb-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#FF6A00]/10 text-[#FF6A00]">
                  <Sparkles className="h-6 w-6" />
                </span>
                <h3 className="text-2xl font-bold text-[#0B1F3A]">Let Our Designers Design It For You</h3>
              </div>
              <p className="text-gray-600">
                Tell us about your graduate and we’ll create a custom proof for approval.
                <span className="font-semibold text-[#0B1F3A]"> $19 design fee due today.</span> Final
                product cost is paid after you approve your proof.
              </p>
              <div className="mt-5 inline-flex items-center font-semibold text-[#FF6A00] group-hover:gap-2 gap-1 transition-all">
                Start the intake form <ArrowRight className="h-4 w-4" />
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* Dynamic flow section */}
      <section id="flow-section" className="bg-white py-14 sm:py-20">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          {flow === null && (
            <div className="text-center text-gray-500">
              <p>Choose an option above to get started.</p>
            </div>
          )}

          {flow === 'upload' && (
            <div>
              <div className="text-center mb-10">
                <h2 className="text-3xl font-extrabold text-[#0B1F3A]">
                  Choose your product
                </h2>
                <p className="mt-2 text-gray-600">
                  We’ll open the same builder used across our site — with the full preview, pricing,
                  and add-to-cart flow.
                </p>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                {(Object.keys(PRODUCT_LABELS) as ProductType[]).map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setUploadProduct(p)}
                    className={`rounded-xl border-2 p-5 text-center font-semibold transition ${
                      uploadProduct === p
                        ? 'border-[#FF6A00] bg-[#FF6A00]/5 text-[#0B1F3A]'
                        : 'border-[#E5E5E5] bg-white text-[#0B1F3A] hover:border-[#FF6A00]/60'
                    }`}
                  >
                    {PRODUCT_LABELS[p]}
                  </button>
                ))}
              </div>
              <div className="mt-8 text-center">
                <button
                  type="button"
                  onClick={() => navigateToBuilder(uploadProduct)}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#FF6A00] hover:bg-[#E65F00] text-white font-bold px-8 py-3 text-lg shadow-md transition"
                >
                  Open the {PRODUCT_LABELS[uploadProduct]} Builder <ArrowRight className="h-5 w-5" />
                </button>
                <p className="mt-3 text-sm text-gray-500">
                  Uses our existing builder, cart, upsell, PayPal checkout, admin order, and print-file
                  pipeline.
                </p>
              </div>
            </div>
          )}

          {flow === 'designer' && (

            <form onSubmit={handleIntakeSubmit} className="space-y-10">
              <div className="rounded-2xl border border-[#FF6A00]/30 bg-[#FF6A00]/5 p-5">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-6 w-6 text-[#FF6A00] flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-bold text-[#0B1F3A]">$19 design fee due today</p>
                    <p className="text-sm text-[#0B1F3A]/80">
                      This covers the custom design proof. Final product cost is paid after you approve
                      your proof.
                    </p>
                  </div>
                </div>
              </div>

              {/* Customer */}
              <fieldset className="space-y-4">
                <legend className="text-xl font-bold text-[#0B1F3A]">Your contact info</legend>
                <div className="grid sm:grid-cols-3 gap-4">
                  <Field
                    label="Full name"
                    required
                    value={customer.name}
                    onChange={(v) => setCustomer({ ...customer, name: v })}
                  />
                  <Field
                    label="Email"
                    type="email"
                    required
                    value={customer.email}
                    onChange={(v) => setCustomer({ ...customer, email: v })}
                  />
                  <Field
                    label="Phone"
                    type="tel"
                    required
                    value={customer.phone}
                    onChange={(v) => setCustomer({ ...customer, phone: v })}
                  />
                </div>
              </fieldset>

              {/* Graduate */}
              <fieldset className="space-y-4">
                <legend className="text-xl font-bold text-[#0B1F3A]">About the graduate</legend>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field
                    label="Graduate's name"
                    required
                    value={graduate.graduateName}
                    onChange={(v) => setGraduate({ ...graduate, graduateName: v })}
                  />
                  <Field
                    label="School name"
                    required
                    value={graduate.schoolName}
                    onChange={(v) => setGraduate({ ...graduate, schoolName: v })}
                  />
                  <Field
                    label="Graduation year"
                    required
                    value={graduate.graduationYear}
                    onChange={(v) => setGraduate({ ...graduate, graduationYear: v })}
                  />
                  <Field
                    label="School colors"
                    placeholder="e.g. Navy & Gold"
                    value={graduate.schoolColors}
                    onChange={(v) => setGraduate({ ...graduate, schoolColors: v })}
                  />
                  <Field
                    label="Graduation date (optional)"
                    type="date"
                    value={graduate.graduationDate}
                    onChange={(v) => setGraduate({ ...graduate, graduationDate: v })}
                  />
                  <Field
                    label="Party / open house date (optional)"
                    type="date"
                    value={graduate.partyDate}
                    onChange={(v) => setGraduate({ ...graduate, partyDate: v })}
                  />
                </div>
              </fieldset>

              {/* Product */}
              <fieldset className="space-y-4">
                <legend className="text-xl font-bold text-[#0B1F3A]">What product do you need?</legend>
                <div className="grid sm:grid-cols-3 gap-3">
                  {(Object.keys(PRODUCT_LABELS) as ProductType[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setDesignerProduct(p)}
                      className={`rounded-xl border-2 p-4 text-center font-semibold transition ${
                        designerProduct === p
                          ? 'border-[#FF6A00] bg-[#FF6A00]/5 text-[#0B1F3A]'
                          : 'border-[#E5E5E5] bg-white text-[#0B1F3A] hover:border-[#FF6A00]/60'
                      }`}
                    >
                      {PRODUCT_LABELS[p]}
                    </button>
                  ))}
                </div>

                {designerProduct === 'banner' && (
                  <div className="grid sm:grid-cols-2 gap-4 pt-2">
                    <SelectField
                      label="Size"
                      value={bannerSpecs.sizePreset}
                      options={BANNER_SIZE_PRESETS}
                      onChange={(v) => setBannerSpecs({ ...bannerSpecs, sizePreset: v })}
                    />
                    {bannerSpecs.sizePreset === 'Custom' && (
                      <Field
                        label="Custom size (W × H)"
                        placeholder='e.g. 36" × 96"'
                        value={bannerSpecs.customSize}
                        onChange={(v) => setBannerSpecs({ ...bannerSpecs, customSize: v })}
                      />
                    )}
                    <BannerMaterialSelect
                      value={bannerSpecs.material}
                      open={bannerMaterialDropdownOpen}
                      onToggle={() => setBannerMaterialDropdownOpen((o) => !o)}
                      onClose={() => setBannerMaterialDropdownOpen(false)}
                      onChange={(v) => setBannerSpecs({ ...bannerSpecs, material: v })}
                    />
                    <NumberField
                      label="Quantity"
                      value={bannerSpecs.quantity}
                      onChange={(v) => setBannerSpecs({ ...bannerSpecs, quantity: v })}
                    />
                    <SelectField
                      label="Grommets"
                      value={bannerSpecs.grommets}
                      options={DESIGN_GROMMET_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
                      onChange={(v) => setBannerSpecs({ ...bannerSpecs, grommets: v })}
                    />
                    <SelectField
                      label="Pole pockets"
                      value={bannerSpecs.polePockets}
                      options={POLE_POCKET_OPTIONS}
                      onChange={(v) => setBannerSpecs({ ...bannerSpecs, polePockets: v })}
                    />
                    <label className="flex items-center gap-2 text-sm font-semibold text-[#0B1F3A] sm:col-span-2 mt-1 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={bannerSpecs.addRope}
                        onChange={(e) => setBannerSpecs({ ...bannerSpecs, addRope: e.target.checked })}
                        className="accent-[#FF6A00]"
                      />
                      Add rope (priced per linear foot)
                    </label>
                  </div>
                )}

                {designerProduct === 'yard_sign' && (
                  <div className="pt-2 space-y-4">
                    <div className="rounded-xl border-2 border-[#FF6A00]/30 bg-white p-4">
                      <p className="text-xs uppercase tracking-wide text-[#FF6A00] font-bold">Sign Size</p>
                      <p className="text-lg font-bold text-[#0B1F3A] mt-1">24" × 18"</p>
                      <p className="text-sm text-gray-600">Corrugated Plastic</p>
                      <p className="text-xs text-gray-500 mt-2">
                        One standard size for fast 24-hour production. Includes free next-day air shipping.
                      </p>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <SelectField
                        label="Print"
                        value={yardSignSpecs.sidedness}
                        options={[
                          { value: 'single', label: 'Single-Sided ($12 / sign)' },
                          { value: 'double', label: 'Double-Sided ($14 / sign)' },
                        ]}
                        onChange={(v) =>
                          setYardSignSpecs({ ...yardSignSpecs, sidedness: v as YardSignSidedness })
                        }
                      />
                      <NumberField
                        label={`Quantity (multiples of ${YARD_SIGN_INCREMENT}, max ${YARD_SIGN_MAX_QUANTITY})`}
                        value={yardSignSpecs.quantity}
                        min={YARD_SIGN_MIN_QUANTITY}
                        max={YARD_SIGN_MAX_QUANTITY}
                        step={YARD_SIGN_INCREMENT}
                        onChange={(v) => setYardSignSpecs({ ...yardSignSpecs, quantity: v })}
                      />
                      <label className="flex items-center gap-2 text-sm font-semibold text-[#0B1F3A] mt-1 cursor-pointer sm:col-span-2">
                        <input
                          type="checkbox"
                          checked={yardSignSpecs.addStakes}
                          onChange={(e) => setYardSignSpecs({ ...yardSignSpecs, addStakes: e.target.checked })}
                          className="accent-[#FF6A00]"
                        />
                        Include H-stakes (+$1.50 each)
                      </label>
                    </div>
                    {!validateYardSignQuantity(yardSignSpecs.quantity).valid && (
                      <p className="text-xs text-red-600 font-medium">
                        {validateYardSignQuantity(yardSignSpecs.quantity).message ||
                          `Quantity must be a multiple of ${YARD_SIGN_INCREMENT} between ${YARD_SIGN_MIN_QUANTITY} and ${YARD_SIGN_MAX_QUANTITY}.`}
                      </p>
                    )}
                  </div>
                )}

                {designerProduct === 'car_magnet' && (
                  <div className="grid sm:grid-cols-2 gap-4 pt-2">
                    <SelectField
                      label="Size"
                      value={carMagnetSpecs.size}
                      options={CAR_MAGNET_SIZES.map((s) => ({ value: s.label, label: s.label }))}
                      onChange={(v) => setCarMagnetSpecs({ ...carMagnetSpecs, size: v })}
                    />
                    <NumberField
                      label="Quantity"
                      value={carMagnetSpecs.quantity}
                      onChange={(v) => setCarMagnetSpecs({ ...carMagnetSpecs, quantity: v })}
                    />
                    <SelectField
                      label="Rounded Corners (Included Free)"
                      value={carMagnetSpecs.roundedCorners}
                      options={CAR_MAGNET_ROUNDED_CORNERS.map((o) => ({ value: o.value, label: o.label }))}
                      onChange={(v) =>
                        setCarMagnetSpecs({ ...carMagnetSpecs, roundedCorners: v as CarMagnetRoundedCorner })
                      }
                    />
                    <div className="rounded-xl border border-[#E5E5E5] bg-[#F7F7F7] p-3 text-sm sm:col-span-2">
                      <p className="font-semibold text-[#0B1F3A]">Material</p>
                      <p className="text-gray-600">Premium Magnetic Material</p>
                    </div>
                  </div>
                )}
              </fieldset>

              {/* Design direction */}
              <fieldset className="space-y-4">
                <legend className="text-xl font-bold text-[#0B1F3A]">Design direction</legend>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field
                    label="Main text to include"
                    placeholder="e.g. Congrats Sarah! Class of 2026"
                    value={designDirection.mainText}
                    onChange={(v) => setDesignDirection({ ...designDirection, mainText: v })}
                  />
                  <Field
                    label="Secondary text"
                    placeholder="e.g. Lincoln High Football"
                    value={designDirection.secondaryText}
                    onChange={(v) => setDesignDirection({ ...designDirection, secondaryText: v })}
                  />
                  <Field
                    label="Phone, email, or website to include"
                    placeholder="Optional"
                    value={designDirection.contactInfo}
                    onChange={(v) => setDesignDirection({ ...designDirection, contactInfo: v })}
                  />
                  <Field
                    label="Colors / style preference"
                    placeholder="e.g. Navy & gold, photo-driven"
                    value={designDirection.colorsStyle}
                    onChange={(v) => setDesignDirection({ ...designDirection, colorsStyle: v })}
                  />
                  <SelectField
                    label="Preferred style"
                    value={designDirection.preferredStyle}
                    options={STYLE_OPTIONS}
                    onChange={(v) => setDesignDirection({ ...designDirection, preferredStyle: v })}
                  />
                </div>
                <TextAreaField
                  label="Notes for the designer"
                  value={designDirection.notes}
                  onChange={(v) => setDesignDirection({ ...designDirection, notes: v })}
                  placeholder="Anything else we should know? Inside jokes, must-have words, references, etc."
                />

                {/* File uploads */}
                <div className="grid sm:grid-cols-3 gap-4">
                  <UploadButton
                    label="Inspiration photo"
                    busy={uploadingCategory === 'inspiration'}
                    onSelect={(f) => handleFileUpload(f, 'inspiration')}
                  />
                  <UploadButton
                    label="Graduate photo"
                    busy={uploadingCategory === 'graduate_photo'}
                    onSelect={(f) => handleFileUpload(f, 'graduate_photo')}
                  />
                  <UploadButton
                    label="School logo"
                    busy={uploadingCategory === 'school_logo'}
                    onSelect={(f) => handleFileUpload(f, 'school_logo')}
                  />
                </div>
                {files.length > 0 && (
                  <ul className="rounded-xl border border-gray-200 divide-y divide-gray-100">
                    {files.map((f, i) => (
                      <li key={`${f.url}-${i}`} className="flex items-center justify-between gap-3 p-3 text-sm">
                        <div className="flex items-center gap-3 min-w-0">
                          <ImageIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                          <span className="truncate">{f.name}</span>
                          <span className="text-xs text-gray-400 flex-shrink-0">({f.category})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeFile(i)}
                          className="text-gray-400 hover:text-red-600 flex-shrink-0"
                          aria-label="Remove file"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </fieldset>

              <div className="rounded-2xl border-2 border-[#FF6A00]/40 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-xs uppercase tracking-wide text-[#FF6A00] font-bold">Estimated Pricing</p>
                    <h3 className="text-lg font-bold text-[#0B1F3A] mt-1">What you'll pay</h3>
                  </div>
                </div>
                <div className="mt-4 grid sm:grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[#FF6A00]/10 p-4">
                    <p className="text-xs text-[#0B1F3A]/80 font-semibold uppercase tracking-wide">Design fee due today</p>
                    <p className="text-2xl font-extrabold text-[#0B1F3A] mt-1">$19.00</p>
                    <p className="text-xs text-[#0B1F3A]/70 mt-1">Charged at checkout</p>
                  </div>
                  <div className="rounded-xl bg-[#0B1F3A]/5 p-4">
                    <p className="text-xs text-[#0B1F3A]/80 font-semibold uppercase tracking-wide">Estimated product total</p>
                    {estimate ? (
                      <>
                        <p className="text-2xl font-extrabold text-[#0B1F3A] mt-1">{usd(estimate.totalCents / 100)}</p>
                        <p className="text-xs text-[#0B1F3A]/70 mt-1">
                          {usd(estimate.subtotalCents / 100)} subtotal + {usd(estimate.taxCents / 100)} tax
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-base font-semibold text-[#0B1F3A]/60 mt-1 italic">Select size & options</p>
                        <p className="text-xs text-[#0B1F3A]/70 mt-1">Pricing updates as you choose options.</p>
                      </>
                    )}
                    <p className="text-xs text-[#0B1F3A]/70 mt-2">Due after proof approval</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500 mt-3">
                  Production begins after proof approval and final product payment. Final total may
                  update if product options are changed before approval.
                </p>
              </div>

              <div className="rounded-2xl border border-[#E5E5E5] bg-[#F7F7F7] p-5">
                <p className="font-semibold text-[#0B1F3A]">Approval &amp; payment</p>
                <p className="text-sm text-[#0B1F3A]/80 mt-1">
                  Our designers will create your design and send a proof for approval. Production
                  begins only after you approve the proof and pay the final product balance.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
                <p className="text-sm text-gray-500">
                  By submitting, you agree to be contacted about your design request.
                </p>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#FF6A00] hover:bg-[#E65F00] disabled:opacity-60 text-white font-bold px-8 py-3 text-lg shadow-md transition"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-5 w-5 animate-spin" /> Submitting…
                    </>
                  ) : (
                    <>
                      Submit Design Request <ArrowRight className="h-5 w-5" />
                    </>
                  )}
                </button>
              </div>
            </form>
          )}
        </div>
      </section>

      {/* Trust */}
      <section className="bg-[#F7F7F7] py-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Clock, title: '24-Hour Production', text: 'Production starts as soon as your design is approved.' },
              { icon: Truck, title: 'FREE Next-Day Air', text: 'Every order ships free, fast, and tracked.' },
              { icon: ShieldCheck, title: 'Designer Reviewed', text: 'Real humans review every print file for quality.' },
              { icon: CheckCircle, title: 'Easy Proof Approval', text: 'Approve, request edits, or pay \u2014 all in one click.' },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-xl bg-white p-5 shadow-sm border border-[#E5E5E5]">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-[#FF6A00]/10 text-[#FF6A00] mb-3">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-[#0B1F3A]">{title}</h3>
                <p className="text-sm text-gray-600 mt-1">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-14 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-[#0B1F3A] text-center">Graduation FAQ</h2>
          <div className="mt-8 space-y-3">
            {FAQS.map((f) => (
              <details
                key={f.q}
                className="group rounded-xl border border-[#E5E5E5] bg-[#F7F7F7] open:bg-white open:shadow-sm"
              >
                <summary className="cursor-pointer list-none flex items-center justify-between gap-3 p-5 font-semibold text-[#0B1F3A]">
                  <span>{f.q}</span>
                  <span className="text-[#FF6A00] group-open:rotate-45 transition">+</span>
                </summary>
                <div className="px-5 pb-5 text-gray-700">{f.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>
    </Layout>
  );
};

// ----- Small form helpers -----

const baseInput =
  'w-full rounded-lg border border-[#E5E5E5] px-3 py-2 text-[#0B1F3A] focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none';

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}> = ({ label, value, onChange, type = 'text', required, placeholder }) => (
  <label className="block">
    <span className="block text-sm font-semibold text-[#0B1F3A] mb-1">
      {label}
      {required && <span className="text-[#FF6A00]"> *</span>}
    </span>
    <input
      type={type}
      required={required}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={baseInput}
    />
  </label>
);

const NumberField: React.FC<{
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
}> = ({ label, value, onChange, min = 1, max, step = 1 }) => (
  <label className="block">
    <span className="block text-sm font-semibold text-[#0B1F3A] mb-1">{label}</span>
    <input
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Math.max(min, parseInt(e.target.value || String(min), 10) || min))}
      className={baseInput}
    />
  </label>
);

type SelectOption = string | { value: string; label: string };

const SelectField: React.FC<{
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <label className="block">
    <span className="block text-sm font-semibold text-[#0B1F3A] mb-1">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} className={baseInput}>
      {options.map((opt) => {
        const o = typeof opt === 'string' ? { value: opt, label: opt } : opt;
        return (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        );
      })}
    </select>
  </label>
);

/**
 * Banner material selector that mirrors the image-thumbnail dropdown used by
 * the normal banner builder (`src/pages/Design.tsx`). Backed by the shared
 * `BANNER_MATERIALS` source of truth.
 */
const BannerMaterialSelect: React.FC<{
  value: MaterialKey;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  onChange: (v: MaterialKey) => void;
}> = ({ value, open, onToggle, onClose, onChange }) => {
  const selected = getBannerMaterialByKey(value);
  return (
    <div className="block">
      <span className="block text-sm font-semibold text-[#0B1F3A] mb-1">Material</span>
      <div className="relative">
        <button
          type="button"
          onClick={onToggle}
          className="w-full flex items-center gap-3 rounded-lg border border-[#E5E5E5] bg-white px-3 py-2 text-left hover:border-[#FF6A00] focus:border-[#FF6A00] focus:ring-1 focus:ring-[#FF6A00] outline-none"
        >
          <img
            src={selected.image}
            alt={selected.label}
            className="w-9 h-9 rounded object-cover flex-shrink-0 bg-gray-100"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <span className="font-medium text-[#0B1F3A]">{selected.label}</span>
          <svg
            className={`ml-auto w-4 h-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {open && (
          <div className="absolute z-30 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden max-h-72 overflow-y-auto">
            {BANNER_MATERIALS.map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => {
                  onChange(m.mapped);
                  onClose();
                }}
                className={`w-full flex items-center gap-3 px-3 py-3 text-left transition-colors cursor-pointer ${
                  m.mapped === value
                    ? 'bg-[#FF6A00]/5 border-l-2 border-[#FF6A00]'
                    : 'hover:bg-gray-50 border-l-2 border-transparent'
                }`}
              >
                <img
                  src={m.image}
                  alt={m.label}
                  className="w-10 h-10 rounded object-cover flex-shrink-0 bg-gray-100"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
                <div className="min-w-0">
                  <div className={`text-sm font-medium ${m.mapped === value ? 'text-[#FF6A00]' : 'text-[#0B1F3A]'}`}>
                    {m.label}
                  </div>
                  <div className="text-xs text-gray-500 truncate">{m.desc}</div>
                </div>
                {m.mapped === value && <CheckCircle className="ml-auto w-4 h-4 text-[#FF6A00] flex-shrink-0" />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const TextAreaField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <label className="block">
    <span className="block text-sm font-semibold text-[#0B1F3A] mb-1">{label}</span>
    <textarea
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      rows={4}
      className={baseInput}
    />
  </label>
);

const UploadButton: React.FC<{
  label: string;
  busy: boolean;
  onSelect: (f: File) => void;
}> = ({ label, busy, onSelect }) => {
  const inputRef = React.useRef<HTMLInputElement>(null);
  return (
    <button
      type="button"
      onClick={() => inputRef.current?.click()}
      disabled={busy}
      className="rounded-xl border-2 border-dashed border-[#E5E5E5] bg-[#F7F7F7] hover:border-[#FF6A00] hover:bg-[#FF6A00]/5 p-4 text-center transition disabled:opacity-60"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onSelect(f);
          e.currentTarget.value = '';
        }}
      />
      <div className="flex items-center justify-center gap-2 text-sm font-semibold text-[#0B1F3A]">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4 text-[#FF6A00]" />}
        Upload {label}
      </div>
      <p className="mt-1 text-xs text-gray-500">Optional · PNG, JPG, or PDF</p>
    </button>
  );
};

export default GraduationSigns;
