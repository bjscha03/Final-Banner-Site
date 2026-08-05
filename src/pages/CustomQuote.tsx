import React, { useMemo, useState } from 'react';
import { CheckCircle2, Loader2, UploadCloud } from 'lucide-react';
import Layout from '@/components/Layout';
import SEO from '@/components/SEO';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';

type ProductType = 'banner' | 'yard_sign' | 'magnet';

const MAX_FILE_MB = 200;
const ACCEPTED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png', 'ai', 'eps', 'svg'];
const PRODUCT_LABELS: Record<ProductType, string> = {
  banner: 'Banner',
  yard_sign: 'Yard Sign',
  magnet: 'Magnet',
};

const emptyOptions = {
  bannerMaterial: '',
  grommets: false,
  polePockets: false,
  rope: false,
  yardSignSides: 'single',
  stakeQuantity: '',
  customSize: false,
  specialQuantity: false,
  magnetSize: 'standard',
  magnetCorners: 'square',
};

const CustomQuote: React.FC = () => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [quoteNumber, setQuoteNumber] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({
    fullName: '',
    companyName: '',
    email: '',
    phone: '',
    productType: 'banner' as ProductType,
    width: '',
    height: '',
    unit: 'inches',
    quantity: '',
    materialSpecs: '',
    finishingOptions: '',
    neededByDate: '',
    shippingZip: '',
    projectDescription: '',
    additionalNotes: '',
    ...emptyOptions,
  });

  const fileHelp = useMemo(
    () => `Accepted files: ${ACCEPTED_EXTENSIONS.map((extension) => extension.toUpperCase()).join(', ')}. Maximum ${MAX_FILE_MB}MB per file.`,
    [],
  );

  const update = (key: string, value: string | boolean) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const validate = () => {
    const required = ['fullName', 'email', 'phone', 'width', 'height', 'quantity', 'shippingZip', 'projectDescription'];
    for (const field of required) {
      if (!String((form as Record<string, unknown>)[field]).trim()) {
        return `${field.replace(/([A-Z])/g, ' $1')} is required.`;
      }
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return 'Please enter a valid email address.';
    if (Number(form.width) <= 0 || Number(form.height) <= 0) return 'Width and height must be greater than zero.';
    if (!Number.isInteger(Number(form.quantity)) || Number(form.quantity) <= 0) return 'Quantity must be a positive whole number.';

    for (const file of files) {
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      if (!ACCEPTED_EXTENSIONS.includes(extension)) return `${file.name} is not an accepted file type.`;
      if (file.size > MAX_FILE_MB * 1024 * 1024) return `${file.name} exceeds the ${MAX_FILE_MB}MB file-size limit.`;
    }
    return null;
  };

  const onFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setFiles((previous) => [...previous, ...Array.from(incoming)].slice(0, 8));
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submitting) return;

    const error = validate();
    if (error) {
      toast({ title: 'Please check the form', description: error, variant: 'destructive' });
      return;
    }

    setSubmitting(true);
    try {
      const productOptions = form.productType === 'banner'
        ? {
            banner_material: form.bannerMaterial,
            grommets: form.grommets,
            pole_pockets: form.polePockets,
            rope: form.rope,
            sides: 'single',
          }
        : form.productType === 'yard_sign'
          ? {
              sides: form.yardSignSides,
              stake_quantity: form.stakeQuantity,
              custom_size: form.customSize,
              special_quantity: form.specialQuantity,
            }
          : { size: form.magnetSize, corners: form.magnetCorners };

      const formData = new FormData();
      Object.entries(form).forEach(([key, value]) => {
        if (typeof value === 'boolean') return;
        formData.append(key, String(value ?? ''));
      });
      formData.set('productOptions', JSON.stringify(productOptions));
      files.forEach((file) => formData.append('files', file));

      const response = await fetch('/.netlify/functions/custom-quote-submit', {
        method: 'POST',
        body: formData,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.ok) {
        throw new Error(data?.error || `Quote submission failed with status ${response.status}`);
      }

      setQuoteNumber(data.quoteNumber);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (error) {
      toast({
        title: 'Quote request failed',
        description: error instanceof Error ? error.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (quoteNumber) {
    return (
      <Layout>
        <SEO
          title="Custom Quote Request Received | Banners On The Fly"
          description="Your custom quote request was received."
          canonical="https://bannersonthefly.com/custom-quote"
        />
        <section className="bg-slate-50 py-16">
          <div className="mx-auto max-w-3xl px-4">
            <div className="border-t-4 border-[#FF6A00] bg-white p-8 text-center shadow-[0_12px_30px_rgba(11,31,58,0.08)]">
              <CheckCircle2 className="mx-auto h-16 w-16 text-green-600" />
              <h1 className="mt-4 font-display text-3xl font-bold text-[#0B1F3A]">We received your request.</h1>
              <p className="mt-3 text-lg text-slate-600">
                Your custom quote request number is <strong className="text-[#18448D]">{quoteNumber}</strong>.
              </p>
              <p className="mt-2 text-slate-600">Our team will review your project details and respond with pricing.</p>
              <Button className="mt-6 bg-[#C94E00] hover:bg-[#B84300]" asChild>
                <a href="/">Return Home</a>
              </Button>
            </div>
          </div>
        </section>
      </Layout>
    );
  }

  return (
    <Layout>
      <SEO
        title="Request a Custom Quote | Banners On The Fly"
        description="Request a custom quote for special banner sizes, unusual quantities, custom finishing, and bulk yard-sign or magnet orders."
        canonical="https://bannersonthefly.com/custom-quote"
      />
      <section className="border-b border-white/10 bg-[#0B1F3A] px-4 py-14 text-white sm:py-16">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#FF8A3D]">Custom quote</p>
          <h1 className="mt-3 font-display text-4xl font-bold tracking-[-0.04em] md:text-5xl">Tell us about your custom project.</h1>
          <p className="mt-4 max-w-2xl text-lg leading-8 text-slate-300">
            Special banner sizes, unusual quantities, custom finishing, and bulk yard-sign or magnet orders.
          </p>
        </div>
      </section>

      <form onSubmit={submit} className="bg-[#F7F7F7] py-10 sm:py-14">
        <div className="mx-auto grid max-w-5xl gap-6 px-4">
          <div className="border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="font-display text-xl font-bold text-[#0B1F3A]">Contact information</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Full name" required><Input value={form.fullName} onChange={(event) => update('fullName', event.target.value)} /></Field>
              <Field label="Company name"><Input value={form.companyName} onChange={(event) => update('companyName', event.target.value)} /></Field>
              <Field label="Email" required><Input type="email" value={form.email} onChange={(event) => update('email', event.target.value)} /></Field>
              <Field label="Phone" required><Input value={form.phone} onChange={(event) => update('phone', event.target.value)} /></Field>
            </div>
          </div>

          <div className="border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="font-display text-xl font-bold text-[#0B1F3A]">Project details</h2>
            <div className="mt-5 grid gap-4 md:grid-cols-4">
              <Field label="Product type" required>
                <Select value={form.productType} onValueChange={(value: ProductType) => update('productType', value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="banner">Banner</SelectItem>
                    <SelectItem value="yard_sign">Yard Sign</SelectItem>
                    <SelectItem value="magnet">Magnet</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Width" required><Input type="number" min="0" step="0.01" value={form.width} onChange={(event) => update('width', event.target.value)} /></Field>
              <Field label="Height" required><Input type="number" min="0" step="0.01" value={form.height} onChange={(event) => update('height', event.target.value)} /></Field>
              <Field label="Unit" required>
                <Select value={form.unit} onValueChange={(value) => update('unit', value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="inches">Inches</SelectItem>
                    <SelectItem value="feet">Feet</SelectItem>
                    <SelectItem value="cm">Centimeters</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Quantity" required><Input type="number" min="1" step="1" value={form.quantity} onChange={(event) => update('quantity', event.target.value)} /></Field>
              <Field label="Needed-by date"><Input type="date" value={form.neededByDate} onChange={(event) => update('neededByDate', event.target.value)} /></Field>
              <Field label="Shipping ZIP code" required><Input value={form.shippingZip} onChange={(event) => update('shippingZip', event.target.value)} /></Field>
            </div>

            <div className="mt-6 border-l-4 border-[#FF6A00] bg-[#F7F7F7] p-5">
              <h3 className="font-display font-bold text-[#0B1F3A]">{PRODUCT_LABELS[form.productType]} options</h3>
              <ProductOptions form={form} update={update} />
            </div>

            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <Field label="Material or product specifications"><Textarea value={form.materialSpecs} onChange={(event) => update('materialSpecs', event.target.value)} rows={4} /></Field>
              <Field label="Finishing/options"><Textarea value={form.finishingOptions} onChange={(event) => update('finishingOptions', event.target.value)} rows={4} /></Field>
            </div>
            <Field label="Project description" required className="mt-4">
              <Textarea value={form.projectDescription} onChange={(event) => update('projectDescription', event.target.value)} rows={5} placeholder="Tell us what you need, where it will be used, and any special requirements." />
            </Field>
            <Field label="Additional notes" className="mt-4">
              <Textarea value={form.additionalNotes} onChange={(event) => update('additionalNotes', event.target.value)} rows={3} />
            </Field>
          </div>

          <div className="border border-slate-200 bg-white p-6 sm:p-8">
            <h2 className="font-display text-xl font-bold text-[#0B1F3A]">Artwork upload</h2>
            <p className="mt-1 text-sm text-slate-600">{fileHelp}</p>
            <label className="mt-4 flex cursor-pointer flex-col items-center justify-center border-2 border-dashed border-slate-300 bg-[#F7F7F7] p-8 text-center transition-colors hover:border-[#FF6A00]">
              <UploadCloud className="h-10 w-10 text-[#18448D]" />
              <span className="mt-2 font-bold text-slate-900">Upload artwork files</span>
              <span className="text-sm text-slate-500">Multiple files supported</span>
              <input className="sr-only" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.ai,.eps,.svg" onChange={(event) => onFiles(event.target.files)} />
            </label>
            {files.length > 0 && (
              <ul className="mt-4 space-y-2 text-sm">
                {files.map((file, index) => (
                  <li key={`${file.name}-${index}`} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2">
                    <span>{file.name}</span>
                    <button type="button" className="text-red-600" onClick={() => setFiles(files.filter((_, itemIndex) => itemIndex !== index))}>Remove</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="sticky bottom-0 border border-slate-200 bg-white p-4 shadow-[0_-8px_24px_rgba(11,31,58,0.08)]">
            <Button type="submit" disabled={submitting} className="w-full bg-[#C94E00] py-6 text-base font-bold hover:bg-[#B84300]">
              {submitting ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Submitting secure quote request…</> : 'Request a Custom Quote'}
            </Button>
          </div>
        </div>
      </form>
    </Layout>
  );
};

const Field = ({
  label,
  required,
  children,
  className = '',
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
}) => (
  <div className={className}>
    <Label className="mb-2 block font-bold text-slate-700">
      {label}{required && <span className="text-red-600"> *</span>}
    </Label>
    {children}
  </div>
);

const CheckField = ({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) => (
  <label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium">
    <Checkbox checked={checked} onCheckedChange={(value) => onChange(Boolean(value))} />
    {label}
  </label>
);

const ProductOptions = ({
  form,
  update,
}: {
  form: any;
  update: (key: string, value: string | boolean) => void;
}) => {
  if (form.productType === 'banner') {
    return (
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Banner material">
          <Select value={form.bannerMaterial} onValueChange={(value) => update('bannerMaterial', value)}>
            <SelectTrigger className="bg-white"><SelectValue placeholder="Select material" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="13oz vinyl">13oz vinyl</SelectItem>
              <SelectItem value="15oz vinyl">15oz vinyl</SelectItem>
              <SelectItem value="18oz blockout">18oz blockout</SelectItem>
              <SelectItem value="mesh">Mesh</SelectItem>
              <SelectItem value="other">Other / not sure</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Print sides">
          <div className="flex h-10 items-center rounded-md border border-input bg-white px-3 text-sm text-slate-700">
            Single-sided
          </div>
        </Field>
        <CheckField label="Grommets" checked={form.grommets} onChange={(value) => update('grommets', value)} />
        <CheckField label="Pole pockets" checked={form.polePockets} onChange={(value) => update('polePockets', value)} />
        <CheckField label="Rope" checked={form.rope} onChange={(value) => update('rope', value)} />
      </div>
    );
  }

  if (form.productType === 'yard_sign') {
    return (
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Field label="Print sides">
          <Select value={form.yardSignSides} onValueChange={(value) => update('yardSignSides', value)}>
            <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Single-sided</SelectItem>
              <SelectItem value="double">Double-sided</SelectItem>
            </SelectContent>
          </Select>
        </Field>
        <Field label="Stake quantity"><Input className="bg-white" type="number" min="0" value={form.stakeQuantity} onChange={(event) => update('stakeQuantity', event.target.value)} /></Field>
        <CheckField label="Custom size" checked={form.customSize} onChange={(value) => update('customSize', value)} />
        <CheckField label="Special quantity" checked={form.specialQuantity} onChange={(value) => update('specialQuantity', value)} />
      </div>
    );
  }

  return (
    <div className="mt-3 grid gap-3 md:grid-cols-2">
      <Field label="Size type">
        <Select value={form.magnetSize} onValueChange={(value) => update('magnetSize', value)}>
          <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="standard">Standard size</SelectItem>
            <SelectItem value="custom">Custom size</SelectItem>
          </SelectContent>
        </Select>
      </Field>
      <Field label="Corners">
        <Select value={form.magnetCorners} onValueChange={(value) => update('magnetCorners', value)}>
          <SelectTrigger className="bg-white"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="square">Square corners</SelectItem>
            <SelectItem value="rounded">Rounded corners</SelectItem>
          </SelectContent>
        </Select>
      </Field>
    </div>
  );
};

export default CustomQuote;
