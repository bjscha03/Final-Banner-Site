import React, { useCallback, useState } from 'react';
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

const BANNER_SIZE_PRESETS = [
  "2' × 4'",
  "2' × 6'",
  "3' × 6'",
  "3' × 8'",
  "4' × 8'",
  "4' × 10'",
  'Custom',
];

const CAR_MAGNET_SIZE_PRESETS = [
  '12" × 24"',
  '12" × 18"',
  '6" × 24"',
  '8" × 16"',
  'Other',
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

const GraduationSigns: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [flow, setFlow] = useState<Flow>(null);

  // Upload-Own-Design product picker
  const [uploadProduct, setUploadProduct] = useState<ProductType>('banner');

  // Designer-assisted intake form state
  const [submitting, setSubmitting] = useState(false);
  const [submittedId, setSubmittedId] = useState<string | null>(null);

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
    material: '13oz Vinyl',
    quantity: 1,
    grommets: '4-corners',
    polePockets: 'none',
    rope: 'none',
    sidedness: 'single',
  });

  // Yard sign specs
  const [yardSignSpecs, setYardSignSpecs] = useState({
    quantity: 1,
    sizeType: '18" × 24" coroplast',
    sidedness: 'single',
    addStakes: 'yes',
  });

  // Car magnet specs
  const [carMagnetSpecs, setCarMagnetSpecs] = useState({
    size: '12" × 24"',
    quantity: 1,
    roundedCorners: 'standard',
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
    setSubmittedId(null);
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
      const { sizePreset, customSize, ...rest } = bannerSpecs;
      return {
        size: sizePreset === 'Custom' ? customSize || 'Custom (TBD)' : sizePreset,
        ...rest,
      };
    }
    if (p === 'yard_sign') return { ...yardSignSpecs };
    return { ...carMagnetSpecs };
  };

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
      setSubmittedId(data.intakeId || 'submitted');
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
        <title>Graduation Banners, Yard Signs &amp; Car Magnets | Banners On The Fly</title>
        <meta
          name="description"
          content="Celebrate your graduate with custom graduation banners, senior yard signs, and car magnets. Upload your own design or let our designers create one. Printed in 24 hours with FREE next-day air shipping."
        />
        <meta property="og:title" content="Graduation Banners, Yard Signs & Car Magnets" />
        <meta
          property="og:description"
          content="Custom graduation banners, yard signs, and car magnets printed fast. Upload your own design or let our designers create one."
        />
      </Helmet>

      {/* Hero */}
      <section className="relative bg-gradient-to-br from-indigo-700 via-purple-700 to-rose-600 text-white">
        <div className="absolute inset-0 opacity-20" aria-hidden="true">
          <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-yellow-400 blur-3xl" />
          <div className="absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-pink-400 blur-3xl" />
        </div>
        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 lg:py-24 text-center">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/15 backdrop-blur px-4 py-1.5 text-sm font-semibold mb-6">
            <GraduationCap className="h-4 w-4" /> Class of {new Date().getFullYear()} · Built for Graduation Season
          </div>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight">
            Graduation Banners, Yard Signs &amp; Car Magnets
          </h1>
          <p className="mt-5 text-lg md:text-2xl text-indigo-100 max-w-3xl mx-auto">
            Celebrate your graduate with custom banners, yard signs, and car magnets printed fast.
          </p>
          <ul className="mt-8 grid sm:grid-cols-2 lg:grid-cols-4 gap-3 max-w-4xl mx-auto text-left">
            {[
              { icon: Upload, text: 'Upload your own design or let our designers create one' },
              { icon: Clock, text: 'Printed in 24 hours after approval' },
              { icon: Truck, text: 'FREE next-day air shipping' },
              { icon: Sparkles, text: 'Perfect for parties, senior nights & driveway displays' },
            ].map(({ icon: Icon, text }, i) => (
              <li
                key={i}
                className="flex items-start gap-3 rounded-xl bg-white/10 backdrop-blur px-4 py-3 text-sm font-medium"
              >
                <Icon className="h-5 w-5 flex-shrink-0 text-yellow-300 mt-0.5" />
                <span>{text}</span>
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <a
              href="#choose"
              className="inline-flex items-center gap-2 rounded-full bg-yellow-400 hover:bg-yellow-300 text-slate-900 font-bold px-8 py-3 text-lg shadow-lg transition"
            >
              Get Started <ArrowRight className="h-5 w-5" />
            </a>
          </div>
        </div>
      </section>

      {/* Choose how to start */}
      <section id="choose" className="bg-gray-50 py-14 sm:py-20">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-3xl sm:text-4xl font-extrabold text-gray-900">
              Choose how you want to start
            </h2>
            <p className="mt-3 text-gray-600 max-w-2xl mx-auto">
              Upload artwork you already have, or let our team design something custom for your
              graduate. Either way, we print and ship fast.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <button
              type="button"
              onClick={() => {
                setFlow('upload');
                setSubmittedId(null);
                setTimeout(
                  () => document.getElementById('flow-section')?.scrollIntoView({ behavior: 'smooth' }),
                  50
                );
              }}
              className={`text-left rounded-2xl border-2 bg-white p-7 shadow-sm hover:shadow-xl transition group ${
                flow === 'upload' ? 'border-indigo-600 ring-2 ring-indigo-200' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700">
                  <Upload className="h-6 w-6" />
                </span>
                <h3 className="text-2xl font-bold text-gray-900">Upload My Own Design</h3>
              </div>
              <p className="text-gray-600">
                Already have a graduation design? Upload your artwork, choose your product, and check
                out in minutes with our normal builder.
              </p>
              <div className="mt-5 inline-flex items-center font-semibold text-indigo-700 group-hover:gap-2 gap-1 transition-all">
                Start uploading <ArrowRight className="h-4 w-4" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                setFlow('designer');
                setSubmittedId(null);
                setTimeout(
                  () => document.getElementById('flow-section')?.scrollIntoView({ behavior: 'smooth' }),
                  50
                );
              }}
              className={`text-left rounded-2xl border-2 bg-white p-7 shadow-sm hover:shadow-xl transition group ${
                flow === 'designer' ? 'border-purple-600 ring-2 ring-purple-200' : 'border-gray-200'
              }`}
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-purple-100 text-purple-700">
                  <Sparkles className="h-6 w-6" />
                </span>
                <h3 className="text-2xl font-bold text-gray-900">Let Our Designers Design It For You</h3>
              </div>
              <p className="text-gray-600">
                Tell us about your graduate and we’ll create a custom proof for approval.
                <span className="font-semibold text-purple-700"> $19 design fee due today.</span> Final
                product cost is paid after you approve your proof.
              </p>
              <div className="mt-5 inline-flex items-center font-semibold text-purple-700 group-hover:gap-2 gap-1 transition-all">
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
                <h2 className="text-3xl font-extrabold text-gray-900">
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
                        ? 'border-indigo-600 bg-indigo-50 text-indigo-800'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-indigo-400'
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
                  className="inline-flex items-center gap-2 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-8 py-3 text-lg shadow-md transition"
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

          {flow === 'designer' && submittedId && (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-8 text-center">
              <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900">Thanks — we received your request!</h2>
              <p className="mt-3 text-gray-700">
                We’ve emailed you a confirmation. Our team will reach out shortly with payment
                instructions for the $19 design fee, and we’ll send your custom proof for approval as
                soon as it’s ready.
              </p>
              <p className="mt-2 text-sm text-gray-500">Reference: {submittedId}</p>
              <button
                type="button"
                onClick={handleStartOver}
                className="mt-6 inline-flex items-center gap-2 rounded-full bg-white border border-gray-300 px-6 py-2 font-semibold text-gray-700 hover:bg-gray-50"
              >
                Submit another request
              </button>
            </div>
          )}

          {flow === 'designer' && !submittedId && (
            <form onSubmit={handleIntakeSubmit} className="space-y-10">
              <div className="rounded-2xl border border-purple-200 bg-purple-50 p-5">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-6 w-6 text-purple-700 flex-shrink-0 mt-1" />
                  <div>
                    <p className="font-bold text-purple-900">$19 design fee due today</p>
                    <p className="text-sm text-purple-900/80">
                      This covers the custom design proof. Final product cost is paid after you approve
                      your proof.
                    </p>
                  </div>
                </div>
              </div>

              {/* Customer */}
              <fieldset className="space-y-4">
                <legend className="text-xl font-bold text-gray-900">Your contact info</legend>
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
                <legend className="text-xl font-bold text-gray-900">About the graduate</legend>
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
                <legend className="text-xl font-bold text-gray-900">What product do you need?</legend>
                <div className="grid sm:grid-cols-3 gap-3">
                  {(Object.keys(PRODUCT_LABELS) as ProductType[]).map((p) => (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setDesignerProduct(p)}
                      className={`rounded-xl border-2 p-4 text-center font-semibold transition ${
                        designerProduct === p
                          ? 'border-purple-600 bg-purple-50 text-purple-800'
                          : 'border-gray-200 bg-white text-gray-700 hover:border-purple-400'
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
                    <SelectField
                      label="Material"
                      value={bannerSpecs.material}
                      options={['13oz Vinyl', '15oz Vinyl', '18oz Vinyl', 'Mesh Fence']}
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
                      options={['none', '4-corners', 'top-corners', 'every-2ft', 'every-1-2ft']}
                      onChange={(v) => setBannerSpecs({ ...bannerSpecs, grommets: v })}
                    />
                    <SelectField
                      label="Pole pockets"
                      value={bannerSpecs.polePockets}
                      options={['none', 'top', 'bottom', 'top-and-bottom']}
                      onChange={(v) => setBannerSpecs({ ...bannerSpecs, polePockets: v })}
                    />
                    <SelectField
                      label="Rope"
                      value={bannerSpecs.rope}
                      options={['none', 'top', 'top-and-bottom']}
                      onChange={(v) => setBannerSpecs({ ...bannerSpecs, rope: v })}
                    />
                    <SelectField
                      label="Print sides"
                      value={bannerSpecs.sidedness}
                      options={['single', 'double']}
                      onChange={(v) => setBannerSpecs({ ...bannerSpecs, sidedness: v })}
                    />
                  </div>
                )}

                {designerProduct === 'yard_sign' && (
                  <div className="grid sm:grid-cols-2 gap-4 pt-2">
                    <SelectField
                      label="Sign type / size"
                      value={yardSignSpecs.sizeType}
                      options={['18" × 24" coroplast', 'Other (note in design notes)']}
                      onChange={(v) => setYardSignSpecs({ ...yardSignSpecs, sizeType: v })}
                    />
                    <NumberField
                      label="Quantity"
                      value={yardSignSpecs.quantity}
                      onChange={(v) => setYardSignSpecs({ ...yardSignSpecs, quantity: v })}
                    />
                    <SelectField
                      label="Print sides"
                      value={yardSignSpecs.sidedness}
                      options={['single', 'double']}
                      onChange={(v) => setYardSignSpecs({ ...yardSignSpecs, sidedness: v })}
                    />
                    <SelectField
                      label="Include H-stakes?"
                      value={yardSignSpecs.addStakes}
                      options={['yes', 'no']}
                      onChange={(v) => setYardSignSpecs({ ...yardSignSpecs, addStakes: v })}
                    />
                  </div>
                )}

                {designerProduct === 'car_magnet' && (
                  <div className="grid sm:grid-cols-2 gap-4 pt-2">
                    <SelectField
                      label="Size"
                      value={carMagnetSpecs.size}
                      options={CAR_MAGNET_SIZE_PRESETS}
                      onChange={(v) => setCarMagnetSpecs({ ...carMagnetSpecs, size: v })}
                    />
                    <NumberField
                      label="Quantity"
                      value={carMagnetSpecs.quantity}
                      onChange={(v) => setCarMagnetSpecs({ ...carMagnetSpecs, quantity: v })}
                    />
                    <SelectField
                      label="Rounded corners"
                      value={carMagnetSpecs.roundedCorners}
                      options={['none', 'standard', 'large']}
                      onChange={(v) => setCarMagnetSpecs({ ...carMagnetSpecs, roundedCorners: v })}
                    />
                  </div>
                )}
              </fieldset>

              {/* Design direction */}
              <fieldset className="space-y-4">
                <legend className="text-xl font-bold text-gray-900">Design direction</legend>
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

              <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5">
                <p className="font-semibold text-blue-900">Approval &amp; payment</p>
                <p className="text-sm text-blue-900/80 mt-1">
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
                  className="inline-flex items-center gap-2 rounded-full bg-purple-600 hover:bg-purple-700 disabled:opacity-60 text-white font-bold px-8 py-3 text-lg shadow-md transition"
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
      <section className="bg-gray-50 py-14">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { icon: Clock, title: '24-Hour Production', text: 'Production starts as soon as your design is approved.' },
              { icon: Truck, title: 'FREE Next-Day Air', text: 'Every order ships free, fast, and tracked.' },
              { icon: ShieldCheck, title: 'Designer Reviewed', text: 'Real humans review every print file for quality.' },
              { icon: CheckCircle, title: 'Easy Proof Approval', text: 'Approve, request edits, or pay \u2014 all in one click.' },
            ].map(({ icon: Icon, title, text }) => (
              <div key={title} className="rounded-xl bg-white p-5 shadow-sm border border-gray-100">
                <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-indigo-100 text-indigo-700 mb-3">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="font-bold text-gray-900">{title}</h3>
                <p className="text-sm text-gray-600 mt-1">{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="bg-white py-14 sm:py-20">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-extrabold text-gray-900 text-center">Graduation FAQ</h2>
          <div className="mt-8 space-y-3">
            {FAQS.map((f) => (
              <details
                key={f.q}
                className="group rounded-xl border border-gray-200 bg-gray-50 open:bg-white open:shadow-sm"
              >
                <summary className="cursor-pointer list-none flex items-center justify-between gap-3 p-5 font-semibold text-gray-900">
                  <span>{f.q}</span>
                  <span className="text-gray-400 group-open:rotate-45 transition">+</span>
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
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none';

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
  placeholder?: string;
}> = ({ label, value, onChange, type = 'text', required, placeholder }) => (
  <label className="block">
    <span className="block text-sm font-semibold text-gray-700 mb-1">
      {label}
      {required && <span className="text-red-500"> *</span>}
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

const NumberField: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({
  label,
  value,
  onChange,
}) => (
  <label className="block">
    <span className="block text-sm font-semibold text-gray-700 mb-1">{label}</span>
    <input
      type="number"
      min={1}
      value={value}
      onChange={(e) => onChange(Math.max(1, parseInt(e.target.value || '1', 10)))}
      className={baseInput}
    />
  </label>
);

const SelectField: React.FC<{
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}> = ({ label, value, options, onChange }) => (
  <label className="block">
    <span className="block text-sm font-semibold text-gray-700 mb-1">{label}</span>
    <select value={value} onChange={(e) => onChange(e.target.value)} className={baseInput}>
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt}
        </option>
      ))}
    </select>
  </label>
);

const TextAreaField: React.FC<{
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}> = ({ label, value, onChange, placeholder }) => (
  <label className="block">
    <span className="block text-sm font-semibold text-gray-700 mb-1">{label}</span>
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
      className="rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 hover:border-indigo-400 hover:bg-indigo-50 p-4 text-center transition disabled:opacity-60"
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
      <div className="flex items-center justify-center gap-2 text-sm font-semibold text-gray-700">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        Upload {label}
      </div>
      <p className="mt-1 text-xs text-gray-500">Optional · PNG, JPG, or PDF</p>
    </button>
  );
};

export default GraduationSigns;
