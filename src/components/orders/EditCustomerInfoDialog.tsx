import { useEffect, useState } from 'react';
import { Edit3, Loader2 } from 'lucide-react';
import type { Order } from '@/lib/orders/types';
import { adminFetch } from '@/lib/serverAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';

const fields = [['customer_name','Customer full name'],['customer_first_name','Customer first name'],['email','Customer email'],['customer_phone','Customer phone'],['shipping_name','Shipping recipient name'],['shipping_street','Shipping street'],['shipping_street2','Shipping street line 2'],['shipping_city','Shipping city'],['shipping_state','Shipping state'],['shipping_zip','Shipping ZIP/postal code'],['shipping_country','Shipping country']] as const;

export default function EditCustomerInfoDialog({ order, onUpdated, compact=false }: { order: Order; onUpdated: (order: Order) => void; compact?: boolean }) {
 const [open,setOpen]=useState(false), [form,setForm]=useState<Record<string,string>>({}), [reason,setReason]=useState('Corrected customer information from Admin');
 const [resend,setResend]=useState(false), [saving,setSaving]=useState(false), [error,setError]=useState(''), [result,setResult]=useState('');
 useEffect(()=>{ if(open){ setForm(Object.fromEntries(fields.map(([k])=>[k,String(order[k]||'')]))); setResend(/^guest-/i.test(order.email||'')||/@bannersonthefly\.com$/i.test(order.email||'')); setError(''); setResult(''); }},[open,order]);
 const save=async()=>{ setSaving(true);setError('');setResult(''); try { const response=await adminFetch('/.netlify/functions/update-order-customer-info',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:order.id,...form,change_reason:reason})}); const body=await response.json(); if(!response.ok) throw new Error(body.error||'Save failed'); onUpdated(body.order); setResult('Customer information saved.'); if(resend){ try { const mail=await adminFetch('/.netlify/functions/admin-resend-confirmation',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId:order.id})}); if(!mail.ok) throw new Error((await mail.json()).error||'Email service rejected the resend'); setResult('Customer information saved. Confirmation resent successfully.'); } catch(e){setResult(`Customer information saved, but confirmation resend failed: ${e instanceof Error?e.message:'Unknown error'}`);} } } catch(e){setError(e instanceof Error?e.message:'Save failed');} finally{setSaving(false);} };
 return <Dialog open={open} onOpenChange={setOpen}><DialogTrigger asChild><Button size="sm" variant="outline" className={compact?'w-full text-xs':'h-8 text-xs'}><Edit3 className="mr-1 h-3 w-3"/>Edit Customer Info</Button></DialogTrigger><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>Edit Customer Info</DialogTitle></DialogHeader>
 {order.paypal_order_id&&<section className="rounded-md border bg-slate-50 p-3 text-sm"><h3 className="font-semibold">Original PayPal Information</h3><p className="text-slate-600">Original payer details remain preserved in PayPal/payment evidence and are never changed here.</p></section>}
 <div className="grid gap-3 sm:grid-cols-2">{fields.map(([k,label])=><label key={k} className="text-sm font-medium">{label}<Input value={form[k]||''} type={k==='email'?'email':'text'} onChange={e=>{setForm(v=>({...v,[k]:e.target.value}));setError('');}}/></label>)}</div>
 <label className="text-sm font-medium">Change reason<Input value={reason} onChange={e=>{setReason(e.target.value);setError('');}}/></label><label className="flex items-center gap-2 text-sm"><Checkbox checked={resend} onCheckedChange={v=>setResend(v===true)}/>Resend customer order confirmation after saving</label>
 {error&&<p role="alert" className="rounded bg-red-50 p-2 text-sm text-red-700">{error}</p>}{result&&<p role="status" className="rounded bg-green-50 p-2 text-sm text-green-800">{result}</p>}<div className="flex justify-end gap-2"><Button variant="outline" onClick={()=>setOpen(false)} disabled={saving}>Cancel</Button><Button onClick={save} disabled={saving}>{saving&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Save Changes</Button></div></DialogContent></Dialog>;
}
