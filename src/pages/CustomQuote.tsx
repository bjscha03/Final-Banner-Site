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
const PRODUCT_LABELS: Record<ProductType, string> = { banner: 'Banner', yard_sign: 'Yard Sign', magnet: 'Magnet' };

const emptyOptions = { bannerMaterial: '', grommets: false, polePockets: false, rope: false, bannerSides: 'single', yardSignSides: 'single', stakeQuantity: '', customSize: false, specialQuantity: false, magnetSize: 'standard', magnetCorners: 'square' };

const CustomQuote: React.FC = () => {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [quoteNumber, setQuoteNumber] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [form, setForm] = useState({ fullName: '', companyName: '', email: '', phone: '', productType: 'banner' as ProductType, width: '', height: '', unit: 'inches', quantity: '', materialSpecs: '', finishingOptions: '', neededByDate: '', shippingZip: '', projectDescription: '', additionalNotes: '', ...emptyOptions });

  const fileHelp = useMemo(() => `Accepted files: ${ACCEPTED_EXTENSIONS.map(e => e.toUpperCase()).join(', ')}. Maximum ${MAX_FILE_MB}MB per file.`, []);
  const update = (key: string, value: string | boolean) => setForm(prev => ({ ...prev, [key]: value }));

  const validate = () => {
    const required = ['fullName', 'email', 'phone', 'width', 'height', 'quantity', 'shippingZip', 'projectDescription'];
    for (const field of required) if (!String((form as any)[field]).trim()) return `${field.replace(/([A-Z])/g, ' $1')} is required.`;
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return 'Please enter a valid email address.';
    if (Number(form.width) <= 0 || Number(form.height) <= 0) return 'Width and height must be greater than zero.';
    if (!Number.isInteger(Number(form.quantity)) || Number(form.quantity) <= 0) return 'Quantity must be a positive whole number.';
    for (const file of files) {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      if (!ACCEPTED_EXTENSIONS.includes(ext)) return `${file.name} is not an accepted file type.`;
      if (file.size > MAX_FILE_MB * 1024 * 1024) return `${file.name} exceeds the ${MAX_FILE_MB}MB file-size limit.`;
    }
    return null;
  };

  const onFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const next = [...files, ...Array.from(incoming)].slice(0, 8);
    setFiles(next);
  };

  const uploadFiles = async () => {
    const uploaded = [] as Array<{ originalName: string; secureUrl: string; publicId: string; fileKey: string }>;
    for (const file of files) {
      const body = new FormData();
      body.append('file', file);
      const response = await fetch('/.netlify/functions/upload-file', { method: 'POST', body });
      if (!response.ok) throw new Error(`Upload failed for ${file.name}: ${await response.text()}`);
      const data = await response.json();
      uploaded.push({ originalName: file.name, secureUrl: data.secureUrl, publicId: data.publicId, fileKey: data.fileKey });
    }
    return uploaded;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting) return;
    const error = validate();
    if (error) { toast({ title: 'Please check the form', description: error, variant: 'destructive' }); return; }
    setSubmitting(true);
    try {
      const artworkFiles = await uploadFiles();
      const productOptions = form.productType === 'banner'
        ? { banner_material: form.bannerMaterial, grommets: form.grommets, pole_pockets: form.polePockets, rope: form.rope, sides: form.bannerSides }
        : form.productType === 'yard_sign'
          ? { sides: form.yardSignSides, stake_quantity: form.stakeQuantity, custom_size: form.customSize, special_quantity: form.specialQuantity }
          : { size: form.magnetSize, corners: form.magnetCorners };
      const response = await fetch('/.netlify/functions/custom-quote-submit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...form, productOptions, artworkFiles }) });
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Unable to submit quote request');
      setQuoteNumber(data.quoteNumber);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      toast({ title: 'Quote request failed', description: err instanceof Error ? err.message : 'Please try again.', variant: 'destructive' });
    } finally { setSubmitting(false); }
  };

  if (quoteNumber) return <Layout><SEO title="Custom Quote Request Received | Banners On The Fly" description="Your custom quote request was received." canonical="https://bannersonthefly.com/custom-quote" /><section className="bg-slate-50 py-16"><div className="mx-auto max-w-3xl px-4"><div className="rounded-3xl bg-white p-8 text-center shadow-xl"><CheckCircle2 className="mx-auto h-16 w-16 text-green-600" /><h1 className="mt-4 text-3xl font-black text-slate-900">We received your request.</h1><p className="mt-3 text-lg text-slate-600">Your custom quote request number is <strong className="text-[#18448D]">{quoteNumber}</strong>.</p><p className="mt-2 text-slate-600">Our team will review your project details and respond with pricing.</p><Button className="mt-6 bg-[#FF6A00] hover:bg-orange-700" asChild><a href="/">Return Home</a></Button></div></div></section></Layout>;

  return <Layout><SEO title="Request a Custom Quote | Banners On The Fly" description="Request a custom quote for special banner, yard sign, or magnet sizes, quantities, and finishing." canonical="https://bannersonthefly.com/custom-quote" /><section className="bg-gradient-to-br from-[#18448D] to-slate-900 px-4 py-14 text-white"><div className="mx-auto max-w-5xl"><p className="text-sm font-bold uppercase tracking-[0.25em] text-orange-300">Custom Quote</p><h1 className="mt-3 text-4xl font-black md:text-5xl">Tell us about your custom project.</h1><p className="mt-4 max-w-2xl text-lg text-blue-100">Special sizes, unusual quantities, custom finishing, and bulk orders for banners, yard signs, and magnets.</p></div></section><form onSubmit={submit} className="bg-slate-50 py-10"><div className="mx-auto grid max-w-5xl gap-6 px-4"><div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><h2 className="text-xl font-black text-slate-900">Contact information</h2><div className="mt-5 grid gap-4 md:grid-cols-2"><Field label="Full name" required><Input value={form.fullName} onChange={e=>update('fullName', e.target.value)} /></Field><Field label="Company name"><Input value={form.companyName} onChange={e=>update('companyName', e.target.value)} /></Field><Field label="Email" required><Input type="email" value={form.email} onChange={e=>update('email', e.target.value)} /></Field><Field label="Phone" required><Input value={form.phone} onChange={e=>update('phone', e.target.value)} /></Field></div></div><div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><h2 className="text-xl font-black text-slate-900">Project details</h2><div className="mt-5 grid gap-4 md:grid-cols-4"><Field label="Product type" required><Select value={form.productType} onValueChange={(v: ProductType)=>update('productType', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="banner">Banner</SelectItem><SelectItem value="yard_sign">Yard Sign</SelectItem><SelectItem value="magnet">Magnet</SelectItem></SelectContent></Select></Field><Field label="Width" required><Input type="number" min="0" step="0.01" value={form.width} onChange={e=>update('width', e.target.value)} /></Field><Field label="Height" required><Input type="number" min="0" step="0.01" value={form.height} onChange={e=>update('height', e.target.value)} /></Field><Field label="Unit" required><Select value={form.unit} onValueChange={v=>update('unit', v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="inches">Inches</SelectItem><SelectItem value="feet">Feet</SelectItem><SelectItem value="cm">Centimeters</SelectItem></SelectContent></Select></Field><Field label="Quantity" required><Input type="number" min="1" step="1" value={form.quantity} onChange={e=>update('quantity', e.target.value)} /></Field><Field label="Needed-by date"><Input type="date" value={form.neededByDate} onChange={e=>update('neededByDate', e.target.value)} /></Field><Field label="Shipping ZIP code" required><Input value={form.shippingZip} onChange={e=>update('shippingZip', e.target.value)} /></Field></div><div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4"><h3 className="font-bold text-[#18448D]">{PRODUCT_LABELS[form.productType]} options</h3><ProductOptions form={form} update={update} /></div><div className="mt-5 grid gap-4 md:grid-cols-2"><Field label="Material or product specifications"><Textarea value={form.materialSpecs} onChange={e=>update('materialSpecs', e.target.value)} rows={4} /></Field><Field label="Finishing/options"><Textarea value={form.finishingOptions} onChange={e=>update('finishingOptions', e.target.value)} rows={4} /></Field></div><Field label="Project description" required className="mt-4"><Textarea value={form.projectDescription} onChange={e=>update('projectDescription', e.target.value)} rows={5} placeholder="Tell us what you need, where it will be used, and any special requirements." /></Field><Field label="Additional notes" className="mt-4"><Textarea value={form.additionalNotes} onChange={e=>update('additionalNotes', e.target.value)} rows={3} /></Field></div><div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><h2 className="text-xl font-black text-slate-900">Artwork upload</h2><p className="mt-1 text-sm text-slate-600">{fileHelp}</p><label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 text-center hover:border-[#18448D]"><UploadCloud className="h-10 w-10 text-[#18448D]" /><span className="mt-2 font-bold text-slate-900">Upload artwork files</span><span className="text-sm text-slate-500">Multiple files supported</span><input className="sr-only" type="file" multiple accept=".pdf,.jpg,.jpeg,.png,.ai,.eps,.svg" onChange={e=>onFiles(e.target.files)} /></label>{files.length > 0 && <ul className="mt-4 space-y-2 text-sm">{files.map((file, i)=><li key={`${file.name}-${i}`} className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-2"><span>{file.name}</span><button type="button" className="text-red-600" onClick={()=>setFiles(files.filter((_, idx)=>idx!==i))}>Remove</button></li>)}</ul>}</div><div className="sticky bottom-0 rounded-2xl bg-white p-4 shadow-xl ring-1 ring-slate-200"><Button type="submit" disabled={submitting} className="w-full bg-[#FF6A00] py-6 text-base font-black hover:bg-orange-700">{submitting ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Submitting secure quote request…</> : 'Request a Custom Quote'}</Button></div></div></form></Layout>;
};

const Field = ({ label, required, children, className = '' }: { label: string; required?: boolean; children: React.ReactNode; className?: string }) => <div className={className}><Label className="mb-2 block font-bold text-slate-700">{label}{required && <span className="text-red-600"> *</span>}</Label>{children}</div>;
const CheckField = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean)=>void }) => <label className="flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-medium"><Checkbox checked={checked} onCheckedChange={(v)=>onChange(Boolean(v))} />{label}</label>;
const ProductOptions = ({ form, update }: { form: any; update: (key: string, value: string | boolean)=>void }) => {
  if (form.productType === 'banner') return <div className="mt-3 grid gap-3 md:grid-cols-2"><Field label="Banner material"><Select value={form.bannerMaterial} onValueChange={v=>update('bannerMaterial', v)}><SelectTrigger className="bg-white"><SelectValue placeholder="Select material" /></SelectTrigger><SelectContent><SelectItem value="13oz vinyl">13oz vinyl</SelectItem><SelectItem value="15oz vinyl">15oz vinyl</SelectItem><SelectItem value="18oz blockout">18oz blockout</SelectItem><SelectItem value="mesh">Mesh</SelectItem><SelectItem value="other">Other / not sure</SelectItem></SelectContent></Select></Field><Field label="Print sides"><Select value={form.bannerSides} onValueChange={v=>update('bannerSides', v)}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="single">Single-sided</SelectItem><SelectItem value="double">Double-sided</SelectItem></SelectContent></Select></Field><CheckField label="Grommets" checked={form.grommets} onChange={v=>update('grommets', v)} /><CheckField label="Pole pockets" checked={form.polePockets} onChange={v=>update('polePockets', v)} /><CheckField label="Rope" checked={form.rope} onChange={v=>update('rope', v)} /></div>;
  if (form.productType === 'yard_sign') return <div className="mt-3 grid gap-3 md:grid-cols-2"><Field label="Print sides"><Select value={form.yardSignSides} onValueChange={v=>update('yardSignSides', v)}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="single">Single-sided</SelectItem><SelectItem value="double">Double-sided</SelectItem></SelectContent></Select></Field><Field label="Stake quantity"><Input className="bg-white" type="number" min="0" value={form.stakeQuantity} onChange={e=>update('stakeQuantity', e.target.value)} /></Field><CheckField label="Custom size" checked={form.customSize} onChange={v=>update('customSize', v)} /><CheckField label="Special quantity" checked={form.specialQuantity} onChange={v=>update('specialQuantity', v)} /></div>;
  return <div className="mt-3 grid gap-3 md:grid-cols-2"><Field label="Size type"><Select value={form.magnetSize} onValueChange={v=>update('magnetSize', v)}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="standard">Standard size</SelectItem><SelectItem value="custom">Custom size</SelectItem></SelectContent></Select></Field><Field label="Corners"><Select value={form.magnetCorners} onValueChange={v=>update('magnetCorners', v)}><SelectTrigger className="bg-white"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="square">Square corners</SelectItem><SelectItem value="rounded">Rounded corners</SelectItem></SelectContent></Select></Field></div>;
};
export default CustomQuote;
