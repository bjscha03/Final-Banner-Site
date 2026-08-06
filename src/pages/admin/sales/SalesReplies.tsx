import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileDown, Inbox, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { downloadOutboundRepliesCsv, getOutboundReplies, updateOutboundReply, type OutboundRepliesResponse } from '@/lib/outboundSales';
import { useToast } from '@/components/ui/use-toast';

const classifications = ['', 'interested', 'quote_request', 'question', 'not_now', 'not_interested', 'unsubscribe', 'out_of_office', 'wrong_contact', 'automatic_reply', 'unclear'];
const titleCase = (value: string) => value.replace(/_/g, ' ').replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function SalesReplies() {
  const [data, setData] = useState<OutboundRepliesResponse | null>(null);
  const [classification, setClassification] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const { toast } = useToast();
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError('');
    try { setData(await getOutboundReplies({ classification, limit: 100, signal })); }
    catch (requestError) { if ((requestError as Error)?.name !== 'AbortError') setError(requestError instanceof Error ? requestError.message : 'Unable to load replies.'); }
    finally { setLoading(false); }
  }, [classification]);
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [load]);
  const review = async (replyId: string, reviewStatus: string) => {
    try { await updateOutboundReply(replyId, reviewStatus); await load(); toast({ title: 'Reply review saved', description: 'The change was added to outbound audit history.' }); }
    catch (requestError) { toast({ title: 'Review was not saved', description: requestError instanceof Error ? requestError.message : 'Try again.', variant: 'destructive' }); }
  };
  return <div className="space-y-6">
    <section className="rounded-2xl border border-sky-200 bg-sky-50 p-5 text-sky-950 shadow-sm">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex gap-2"><Badge className="bg-sky-700 text-white">Review only</Badge><Badge variant="outline">Automatic replies locked</Badge></div><h2 className="mt-3 text-2xl font-black">Replies</h2><p className="mt-1 max-w-3xl text-sm">Reliable reply intent is classified deterministically. Unclear messages remain flagged; every suggested response requires human review and cannot be sent from this admin.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} />Refresh</Button><Button variant="outline" onClick={() => void downloadOutboundRepliesCsv()} disabled={!data?.schemaReady}><FileDown className="mr-2 h-4 w-4" />Export CSV</Button></div></div>
    </section>
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{['interested','quote_request','question','unsubscribe','unclear'].map((key)=><button key={key} onClick={()=>setClassification(key)} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm"><p className="text-xs font-black uppercase tracking-wide text-slate-500">{titleCase(key)}</p><p className="mt-1 text-2xl font-black text-slate-950">{data?.classificationCounts?.[key]??0}</p></button>)}</section>
    <div className="flex flex-wrap gap-2">{classifications.map((value)=><Button key={value||'all'} size="sm" variant={classification===value?'default':'outline'} onClick={()=>setClassification(value)}>{value?titleCase(value):'All replies'}</Button>)}</div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 font-semibold text-red-800">{error}</div>}
    {!loading && data && !data.schemaReady && <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-amber-900"><AlertTriangle className="mr-2 inline h-5 w-5" />Reply migration is not present; inbound processing remains fail-closed.</div>}
    {!loading && data?.schemaReady && !(data.replies?.length ?? 0) && <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center"><Inbox className="mx-auto h-8 w-8 text-slate-400" /><h3 className="mt-3 font-black">No replies in this view</h3><p className="mt-1 text-sm text-slate-500">The inbox is ready and automatic reply sending remains unavailable.</p></div>}
    <div className="space-y-4">{data?.replies?.map((reply)=><article key={reply.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-col gap-3 border-b border-slate-200 p-5 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-black text-slate-950">{reply.businessName}</h3><Badge variant="outline">{titleCase(reply.classification)}</Badge><Badge variant="outline">{Math.round(reply.classificationConfidence*100)}% deterministic confidence</Badge></div><p className="mt-1 break-all text-sm text-slate-500">{reply.fromEmail} · {new Date(reply.receivedAt).toLocaleString()}</p></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={()=>void review(reply.id,'reviewed')}><ShieldCheck className="mr-1 h-4 w-4" />Reviewed</Button><Button size="sm" onClick={()=>void review(reply.id,'handled')}><CheckCircle2 className="mr-1 h-4 w-4" />Handled</Button></div></div><div className="grid gap-5 p-5 xl:grid-cols-2"><div><p className="text-xs font-black uppercase tracking-wide text-slate-500">{reply.subject||'No subject'}</p><div className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-700">{reply.bodyText||'No text body available.'}</div></div><div><p className="text-xs font-black uppercase tracking-wide text-[#18448D]">Suggested response — never auto-sent</p>{reply.suggestedResponseBody?<><p className="mt-3 text-sm font-bold">{reply.suggestedResponseSubject}</p><div className="mt-2 whitespace-pre-wrap rounded-xl border border-sky-200 bg-sky-50 p-4 text-sm leading-6 text-sky-950">{reply.suggestedResponseBody}</div></>:<p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">No response is suggested for this classification.</p>}</div></div></article>)}</div>
  </div>;
}
