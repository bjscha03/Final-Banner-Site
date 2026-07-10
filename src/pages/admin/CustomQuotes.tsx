import React, { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, Search, Shield } from 'lucide-react';
import Layout from '@/components/Layout';
import { useAuth, isAdmin } from '@/lib/auth';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';

type Quote = { id:string; quote_number:string; status:string; full_name:string; company_name?:string; email:string; phone:string; product_type:string; width:string; height:string; unit:string; quantity:number; material_specs?:string; finishing_options?:string; needed_by_date?:string; shipping_zip:string; project_description:string; additional_notes?:string; product_options:Record<string, unknown>; artwork_files:Array<{originalName?:string; secureUrl:string; publicId?:string}>; internal_notes?:string; created_at:string; };
const STATUSES = ['New', 'Reviewing', 'Quoted', 'Approved', 'Declined', 'Closed'];
const PRODUCT_LABELS: Record<string,string> = { banner:'Banner', yard_sign:'Yard Sign', magnet:'Magnet' };

const AdminCustomQuotes: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [selected, setSelected] = useState<Quote | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const newCount = counts.New || 0;

  useEffect(() => { if (!authLoading && (!user || !isAdmin(user))) navigate('/admin/setup', { replace:true }); }, [user, authLoading, navigate]);
  useEffect(() => { if (user && isAdmin(user)) load(); }, [user, status]);

  const load = async () => {
    setLoading(true);
    try {
      setLoadError(null);
      const params = new URLSearchParams({ status, q: query, email: user?.email || '' });
      const response = await fetch(`/.netlify/functions/admin-custom-quotes?${params}`);
      const data = await response.json();
      if (!response.ok || !data.ok) throw new Error(data.error || 'Failed to load custom quotes');
      setQuotes(data.quotes || []);
      setCounts(Object.fromEntries((data.counts || []).map((c: any) => [c.status, c.count])));
    } catch (err) { const message = err instanceof Error ? err.message : 'Please try again.'; setLoadError(message); toast({ title:'Unable to load custom quotes', description: message, variant:'destructive' }); }
    finally { setLoading(false); }
  };

  const save = async (quote: Quote, patch: Partial<Quote>) => {
    const response = await fetch('/.netlify/functions/admin-custom-quotes', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ id: quote.id, status: patch.status, internalNotes: patch.internal_notes, email: user?.email || '' }) });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || 'Save failed');
    setQuotes(prev => prev.map(q => q.id === quote.id ? data.quote : q));
    setSelected(data.quote);
  };

  const visible = useMemo(() => quotes, [quotes]);
  if (authLoading || loading) return <Layout><div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-[#18448D]" /></div></Layout>;

  return <Layout><section className="bg-slate-50 px-4 py-8"><div className="mx-auto max-w-7xl"><div className="mb-6 flex flex-col justify-between gap-4 md:flex-row md:items-center"><div><div className="flex items-center gap-3"><Shield className="h-7 w-7 text-[#18448D]" /><h1 className="text-3xl font-black text-slate-900">Custom Quotes</h1>{newCount > 0 && <Badge className="bg-[#FF6A00] text-white">{newCount} New</Badge>}</div><p className="mt-1 text-slate-600">Review custom banner, yard sign, and magnet quote requests.</p></div><Button variant="outline" onClick={()=>navigate('/admin/orders')}>Back to Orders</Button></div><div className="mb-5 grid gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 md:grid-cols-[1fr_220px_auto]"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><Input className="pl-9" placeholder="Search quote number, customer, email, company" value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') load(); }} /></div><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All statuses</SelectItem>{STATUSES.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select><Button onClick={load}>Search</Button></div>{loadError && <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-700">Unable to load custom quote requests. {loadError}</div>}<div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"><div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">{visible.map(q=><button key={q.id} onClick={()=>setSelected(q)} className={`block w-full border-b border-slate-100 p-4 text-left hover:bg-blue-50 ${selected?.id===q.id?'bg-blue-50':''}`}><div className="flex items-start justify-between gap-3"><div><p className="font-black text-slate-900">{q.quote_number}</p><p className="text-sm text-slate-600">{q.full_name} • {PRODUCT_LABELS[q.product_type] || q.product_type}</p><p className="text-xs text-slate-500">{new Date(q.created_at).toLocaleString()}</p></div><Badge variant={q.status === 'New' ? 'default' : 'secondary'}>{q.status}</Badge></div></button>)}{visible.length===0 && <p className="p-8 text-center text-slate-500">No custom quote requests found.</p>}</div><QuoteDetail quote={selected} save={save} /></div></div></section></Layout>;
};

const QuoteDetail = ({ quote, save }: { quote: Quote | null; save: (q: Quote, patch: Partial<Quote>)=>Promise<void> }) => {
  const { toast } = useToast();
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(()=>setNotes(quote?.internal_notes || ''), [quote]);
  if (!quote) return <div className="rounded-2xl bg-white p-8 text-center text-slate-500 shadow-sm ring-1 ring-slate-200">Select a quote request to view details.</div>;
  const doSave = async (patch: Partial<Quote>) => { setSaving(true); try { await save(quote, patch); toast({ title:'Custom quote updated' }); } catch(e) { toast({ title:'Save failed', description:e instanceof Error ? e.message : 'Please try again.', variant:'destructive' }); } finally { setSaving(false); } };
  return <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-start"><div><h2 className="text-2xl font-black text-slate-900">{quote.quote_number}</h2><p className="text-slate-600">Submitted {new Date(quote.created_at).toLocaleString()}</p></div><Select value={quote.status} onValueChange={v=>doSave({ status:v })}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent>{STATUSES.map(s=><SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select></div><div className="mt-6 grid gap-4 md:grid-cols-2"><Info label="Customer" value={`${quote.full_name}${quote.company_name ? `, ${quote.company_name}` : ''}`} /><Info label="Contact" value={`${quote.email} • ${quote.phone}`} /><Info label="Product" value={PRODUCT_LABELS[quote.product_type] || quote.product_type} /><Info label="Size / quantity" value={`${quote.width} × ${quote.height} ${quote.unit} • Qty ${quote.quantity}`} /><Info label="Needed by" value={quote.needed_by_date || '—'} /><Info label="Shipping ZIP" value={quote.shipping_zip} /></div><Section title="Selected options"><div className="grid gap-2 md:grid-cols-2">{Object.entries(quote.product_options || {}).map(([k,v])=><Info key={k} label={k.replace(/_/g,' ')} value={Array.isArray(v) ? v.join(', ') : String(v)} />)}</div></Section><Section title="Specifications"><p className="whitespace-pre-wrap text-sm text-slate-700">{quote.material_specs || '—'}</p></Section><Section title="Finishing/options"><p className="whitespace-pre-wrap text-sm text-slate-700">{quote.finishing_options || '—'}</p></Section><Section title="Project description"><p className="whitespace-pre-wrap text-sm text-slate-700">{quote.project_description}</p></Section><Section title="Additional notes"><p className="whitespace-pre-wrap text-sm text-slate-700">{quote.additional_notes || '—'}</p></Section><Section title="Artwork files">{quote.artwork_files?.length ? <div className="space-y-2">{quote.artwork_files.map((file, i)=><a key={i} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-[#18448D] hover:bg-slate-50" href={file.secureUrl} target="_blank" rel="noreferrer"><span>{file.originalName || file.publicId || `Artwork ${i+1}`}</span><Download className="h-4 w-4" /></a>)}</div> : <p className="text-sm text-slate-500">No artwork uploaded.</p>}</Section><Section title="Internal notes"><Textarea rows={5} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Add private admin notes..." /><Button className="mt-3 bg-[#18448D]" disabled={saving} onClick={()=>doSave({ internal_notes: notes })}>{saving ? 'Saving…' : 'Save internal notes'}</Button></Section></div>;
};
const Info = ({ label, value }: { label:string; value:string }) => <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs font-bold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 font-semibold text-slate-900">{value}</p></div>;
const Section = ({ title, children }: { title:string; children:React.ReactNode }) => <div className="mt-6"><h3 className="mb-2 font-black text-slate-900">{title}</h3>{children}</div>;
export default AdminCustomQuotes;
