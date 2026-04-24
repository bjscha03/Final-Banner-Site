import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  ArrowLeft,
  Loader2,
  Upload,
  Send,
  Image as ImageIcon,
  CheckCircle,
  Clock,
  RefreshCcw,
  Mail,
  Phone,
} from 'lucide-react';
import Layout from '@/components/Layout';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useAuth, isAdmin } from '@/lib/auth';
import { usd } from '@/lib/pricing';

interface IntakeRow {
  id: string;
  customer_name: string;
  customer_email: string;
  customer_phone?: string | null;
  product_type: string;
  product_specs: Record<string, unknown>;
  graduate_info: Record<string, unknown>;
  design_notes: Record<string, unknown>;
  inspiration_files: Array<{ name?: string; url: string; category?: string }>;
  status: string;
  design_fee_paid: boolean;
  design_fee_paid_at?: string | null;
  final_payment_paid: boolean;
  final_payment_paid_at?: string | null;
  estimated_product_subtotal_cents?: number | null;
  estimated_tax_cents?: number | null;
  estimated_product_total_cents?: number | null;
  final_product_amount_cents?: number | null;
  approval_token?: string | null;
  latest_proof_version?: number | null;
  created_at: string;
  updated_at: string;
}

interface ProofRow {
  id: string;
  version_number: number;
  proof_file_url: string;
  proof_file_name?: string | null;
  admin_message?: string | null;
  admin_email?: string | null;
  status: string;
  sent_at: string;
  responded_at?: string | null;
}

interface RevisionRow {
  id: string;
  proof_version_id?: string | null;
  notes: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  created_at: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending_payment: 'Pending Deposit',
  design_paid: 'Design Requested',
  deposit_paid: 'Design Requested',
  design_requested: 'Design Requested',
  proof_sent: 'Proof Sent',
  revision_requested: 'Revision Requested',
  approved_awaiting_payment: 'Approved — Awaiting Payment',
  paid_ready_for_production: 'Paid — Ready for Production',
  in_production: 'In Production',
  completed: 'Completed',
};

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  pending_payment: 'outline',
  design_paid: 'secondary',
  deposit_paid: 'secondary',
  design_requested: 'secondary',
  proof_sent: 'default',
  revision_requested: 'destructive',
  approved_awaiting_payment: 'default',
  paid_ready_for_production: 'default',
  in_production: 'default',
  completed: 'secondary',
};

const PRODUCT_LABELS: Record<string, string> = {
  banner: 'Banner',
  yard_sign: 'Yard Sign',
  car_magnet: 'Car Magnet',
};

function fmtMoney(cents?: number | null) {
  if (cents == null) return '—';
  return usd(cents / 100);
}

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <div className="flex flex-col">
      <dt className="text-xs uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="text-sm font-semibold text-[#0B1F3A] mt-0.5">{value}</dd>
    </div>
  );
}

/**
 * Admin detail view for a designer-assisted graduation intake.
 *
 * Shows every section captured on the customer-facing intake form, all uploaded
 * file download links, payment summary, full proof history, all revision
 * requests, and an upload-and-send-proof control. Authenticated via the same
 * `is_admin` flag the rest of /admin pages use; the backend additionally
 * validates the requester's email against ADMIN_TEST_PAY_ALLOWLIST.
 */
const AdminGraduationIntake: React.FC = () => {
  const { intakeId = '' } = useParams<{ intakeId: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intake, setIntake] = useState<IntakeRow | null>(null);
  const [proofs, setProofs] = useState<ProofRow[]>([]);
  const [revisions, setRevisions] = useState<RevisionRow[]>([]);

  // Proof upload state
  const [uploadingProof, setUploadingProof] = useState(false);
  const [proofUpload, setProofUpload] = useState<{ url: string; key?: string; name: string } | null>(null);
  const [adminMessage, setAdminMessage] = useState('');
  const [sendingProof, setSendingProof] = useState(false);

  const load = useCallback(async () => {
    if (!user?.email) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/.netlify/functions/admin-graduation-get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: user.email, intakeId }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load intake');
      setIntake(data.intake);
      setProofs(data.proofs || []);
      setRevisions(data.revisions || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load intake');
    } finally {
      setLoading(false);
    }
  }, [intakeId, user?.email]);

  useEffect(() => {
    if (!authLoading && (!user || !isAdmin(user))) {
      navigate('/admin/orders');
      return;
    }
    if (user?.email && intakeId) load();
  }, [user, authLoading, intakeId, load, navigate]);

  const handleProofFileSelect = async (file: File) => {
    if (file.size > 50 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Maximum 50MB.', variant: 'destructive' });
      return;
    }
    setUploadingProof(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/.netlify/functions/upload-file', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      if (!data.secureUrl) throw new Error('Upload returned no URL');
      setProofUpload({ url: data.secureUrl, key: data.publicId, name: file.name });
      toast({ title: 'Proof uploaded', description: 'Ready to send to customer.' });
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setUploadingProof(false);
    }
  };

  const handleSendProof = async () => {
    if (!proofUpload || !user?.email) return;
    setSendingProof(true);
    try {
      const res = await fetch('/.netlify/functions/admin-graduation-send-proof', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          intakeId,
          proofFileUrl: proofUpload.url,
          proofFileKey: proofUpload.key,
          proofFileName: proofUpload.name,
          adminMessage: adminMessage.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to send proof');
      toast({ title: 'Proof sent', description: 'Customer notified.' });
      setProofUpload(null);
      setAdminMessage('');
      await load();
    } catch (err) {
      toast({
        title: 'Failed to send proof',
        description: err instanceof Error ? err.message : 'Try again.',
        variant: 'destructive',
      });
    } finally {
      setSendingProof(false);
    }
  };

  if (authLoading || loading) {
    return (
      <Layout>
        <div className="min-h-screen flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-[#FF6A00]" />
        </div>
      </Layout>
    );
  }

  if (error || !intake) {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-4 py-10">
          <Button variant="ghost" onClick={() => navigate('/admin/graduation-intakes')}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to intakes
          </Button>
          <div className="mt-6 rounded-2xl bg-white border border-red-100 p-6 text-center">
            <h1 className="text-lg font-bold text-red-700">Could not load intake</h1>
            <p className="text-sm text-gray-600 mt-2">{error || 'Intake not found.'}</p>
          </div>
        </div>
      </Layout>
    );
  }

  const productLabel = PRODUCT_LABELS[intake.product_type] || intake.product_type;
  const specs = intake.product_specs as Record<string, string | number>;
  const grad = intake.graduate_info as Record<string, string>;
  const dn = intake.design_notes as Record<string, string>;
  const reviewLink = intake.approval_token ? `${window.location.origin}/proof/${intake.approval_token}` : null;
  const canSendProof = intake.design_fee_paid && !intake.final_payment_paid;

  return (
    <Layout>
      <Helmet>
        <title>Graduation Intake · Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <div className="bg-[#F7F7F7] min-h-screen">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Header */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <Button variant="ghost" onClick={() => navigate('/admin/graduation-intakes')}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to intakes
            </Button>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCcw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>

          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <Badge className="bg-[#FF6A00] hover:bg-[#FF6A00] text-white">Designer Assisted · Graduation</Badge>
            <Badge variant={STATUS_VARIANT[intake.status] || 'secondary'}>
              {STATUS_LABEL[intake.status] || intake.status}
            </Badge>
            <span className="text-xs text-gray-500 font-mono">{intake.id}</span>
          </div>

          <h1 className="text-2xl font-extrabold text-[#0B1F3A] mt-2">
            {intake.customer_name}{grad?.graduateName ? ` · for ${grad.graduateName}` : ''}
          </h1>
          <p className="text-sm text-gray-500 mt-1">Created {fmtDate(intake.created_at)}</p>

          {/* Proof upload */}
          <section className="mt-6 rounded-2xl bg-white shadow-sm border border-gray-200 p-6">
            <h2 className="text-base font-bold text-[#0B1F3A]">Send proof for approval</h2>
            {!canSendProof && (
              <p className="text-sm text-gray-600 mt-2">
                {intake.final_payment_paid
                  ? 'Order is fully paid — proof workflow complete.'
                  : 'Customer has not paid the $19 design fee yet. Sending proofs is disabled.'}
              </p>
            )}
            {canSendProof && (
              <div className="mt-3 grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#0B1F3A] cursor-pointer">
                    <Upload className="h-4 w-4" />
                    {uploadingProof ? 'Uploading…' : (proofUpload ? 'Replace proof file' : 'Upload proof (image or PDF)')}
                    <input
                      type="file"
                      className="sr-only"
                      accept="image/*,.pdf"
                      disabled={uploadingProof || sendingProof}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleProofFileSelect(f);
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {proofUpload && (
                    <p className="text-xs text-gray-500 mt-1 truncate">
                      File: <a href={proofUpload.url} target="_blank" rel="noopener noreferrer" className="text-[#FF6A00] underline">{proofUpload.name}</a>
                    </p>
                  )}
                </div>
                <div>
                  <label className="text-xs uppercase tracking-wide text-gray-500 font-bold">Optional message to customer</label>
                  <textarea
                    className="mt-1 w-full rounded-lg border border-gray-300 p-2 text-sm min-h-[80px]"
                    placeholder="Anything you want them to notice on this proof?"
                    value={adminMessage}
                    onChange={(e) => setAdminMessage(e.target.value)}
                    maxLength={4000}
                    disabled={sendingProof}
                  />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <Button
                    onClick={handleSendProof}
                    disabled={!proofUpload || sendingProof}
                    className="bg-[#FF6A00] hover:bg-[#E65F00] text-white font-bold"
                  >
                    {sendingProof ? (
                      <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Sending…</>
                    ) : (
                      <><Send className="h-4 w-4 mr-2" />Send Proof for Approval</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* Customer info */}
          <section className="mt-6 rounded-2xl bg-white shadow-sm border border-gray-200 p-6">
            <h2 className="text-base font-bold text-[#0B1F3A]">Customer</h2>
            <dl className="mt-3 grid sm:grid-cols-3 gap-4">
              <KV label="Name" value={intake.customer_name} />
              <KV label="Email" value={<a className="text-[#FF6A00] inline-flex items-center gap-1" href={`mailto:${intake.customer_email}`}><Mail className="h-3 w-3" />{intake.customer_email}</a>} />
              <KV label="Phone" value={intake.customer_phone ? (<a className="text-[#FF6A00] inline-flex items-center gap-1" href={`tel:${intake.customer_phone}`}><Phone className="h-3 w-3" />{intake.customer_phone}</a>) : '—'} />
            </dl>
          </section>

          {/* Product specs */}
          <section className="mt-6 rounded-2xl bg-white shadow-sm border border-gray-200 p-6">
            <h2 className="text-base font-bold text-[#0B1F3A]">Product · {productLabel}</h2>
            <dl className="mt-3 grid sm:grid-cols-3 gap-4">
              {Object.entries(specs).map(([k, v]) => (
                <KV key={k} label={k} value={String(v)} />
              ))}
            </dl>
          </section>

          {/* Graduate */}
          <section className="mt-6 rounded-2xl bg-white shadow-sm border border-gray-200 p-6">
            <h2 className="text-base font-bold text-[#0B1F3A]">Graduate Info</h2>
            <dl className="mt-3 grid sm:grid-cols-3 gap-4">
              <KV label="Graduate name" value={grad.graduateName} />
              <KV label="School" value={grad.schoolName} />
              <KV label="Graduation year" value={grad.graduationYear} />
              <KV label="School colors" value={grad.schoolColors} />
              <KV label="Graduation date" value={grad.graduationDate} />
              <KV label="Party / open house" value={grad.partyDate} />
            </dl>
          </section>

          {/* Design direction */}
          <section className="mt-6 rounded-2xl bg-white shadow-sm border border-gray-200 p-6">
            <h2 className="text-base font-bold text-[#0B1F3A]">Design Direction</h2>
            <dl className="mt-3 grid sm:grid-cols-2 gap-4">
              <KV label="Preferred style" value={dn.preferredStyle} />
              <KV label="Colors / style preference" value={dn.colorsStyle} />
              <KV label="Headline / main text" value={dn.mainText} />
              <KV label="Secondary text" value={dn.secondaryText} />
              <KV label="Contact info to include" value={dn.contactInfo} />
              <KV label="Notes for designer" value={dn.notes ? <span className="whitespace-pre-wrap">{dn.notes}</span> : null} />
            </dl>
          </section>

          {/* Files */}
          <section className="mt-6 rounded-2xl bg-white shadow-sm border border-gray-200 p-6">
            <h2 className="text-base font-bold text-[#0B1F3A]">Uploaded Files</h2>
            {intake.inspiration_files && intake.inspiration_files.length > 0 ? (
              <ul className="mt-3 divide-y divide-gray-100 border border-gray-100 rounded-lg">
                {intake.inspiration_files.map((f, i) => (
                  <li key={`${f.url}-${i}`} className="flex items-center justify-between gap-3 p-3 text-sm">
                    <div className="flex items-center gap-3 min-w-0">
                      <ImageIcon className="h-4 w-4 text-gray-400 flex-shrink-0" />
                      <span className="truncate font-semibold text-[#0B1F3A]">{f.name || 'file'}</span>
                      {f.category && <span className="text-xs text-gray-400 flex-shrink-0">({f.category})</span>}
                    </div>
                    <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-[#FF6A00] font-semibold text-sm flex-shrink-0">
                      Download
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-500 mt-2 italic">No files uploaded.</p>
            )}
          </section>

          {/* Payment summary */}
          <section className="mt-6 rounded-2xl bg-white shadow-sm border border-gray-200 p-6">
            <h2 className="text-base font-bold text-[#0B1F3A]">Payment Summary</h2>
            <dl className="mt-3 grid sm:grid-cols-3 gap-4">
              <KV
                label="Design fee"
                value={
                  <span>
                    $19.00 {intake.design_fee_paid ? <span className="text-green-700">· paid</span> : <span className="text-gray-500">· unpaid</span>}
                    {intake.design_fee_paid_at && (
                      <span className="block text-xs text-gray-500 font-normal mt-0.5">{fmtDate(intake.design_fee_paid_at)}</span>
                    )}
                  </span>
                }
              />
              <KV label="Estimated subtotal" value={fmtMoney(intake.estimated_product_subtotal_cents)} />
              <KV label="Estimated tax" value={fmtMoney(intake.estimated_tax_cents)} />
              <KV label="Estimated total" value={fmtMoney(intake.estimated_product_total_cents)} />
              <KV label="Final amount" value={fmtMoney(intake.final_product_amount_cents)} />
              <KV
                label="Final balance"
                value={
                  intake.final_payment_paid
                    ? <span className="text-green-700">Paid · {fmtDate(intake.final_payment_paid_at)}</span>
                    : <span className="text-gray-500">Unpaid</span>
                }
              />
            </dl>
            {reviewLink && !intake.final_payment_paid && (
              <p className="text-xs text-gray-500 mt-3">
                Customer review link: <a className="text-[#FF6A00] underline break-all" href={reviewLink}>{reviewLink}</a>
              </p>
            )}
          </section>

          {/* Proof history */}
          <section className="mt-6 rounded-2xl bg-white shadow-sm border border-gray-200 p-6">
            <h2 className="text-base font-bold text-[#0B1F3A]">Proof History</h2>
            {proofs.length === 0 ? (
              <p className="text-sm text-gray-500 mt-2 italic">No proofs sent yet.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {proofs.map((p) => (
                  <li key={p.id} className="rounded-lg border border-gray-100 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-gray-400" />
                        <span className="font-semibold text-[#0B1F3A]">Version {p.version_number}</span>
                        <Badge variant={p.status === 'approved' ? 'default' : p.status === 'revision_requested' ? 'destructive' : p.status === 'superseded' ? 'outline' : 'secondary'}>
                          {p.status}
                        </Badge>
                        <span className="text-xs text-gray-500">{fmtDate(p.sent_at)}</span>
                      </div>
                      <a href={p.proof_file_url} target="_blank" rel="noopener noreferrer" className="text-[#FF6A00] font-semibold text-sm">
                        {p.proof_file_name || 'View file'}
                      </a>
                    </div>
                    {p.admin_message && (
                      <p className="text-sm text-gray-700 mt-2 whitespace-pre-wrap">{p.admin_message}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Revisions */}
          <section className="mt-6 rounded-2xl bg-white shadow-sm border border-gray-200 p-6">
            <h2 className="text-base font-bold text-[#0B1F3A]">Revision Requests</h2>
            {revisions.length === 0 ? (
              <p className="text-sm text-gray-500 mt-2 italic">No revisions requested.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {revisions.map((r) => (
                  <li key={r.id} className="rounded-lg border border-gray-100 p-3 text-sm bg-yellow-50/40">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <CheckCircle className="h-3.5 w-3.5 text-[#FF6A00]" />
                      {fmtDate(r.created_at)}
                    </div>
                    <p className="mt-1 whitespace-pre-wrap text-[#0B1F3A]">{r.notes}</p>
                    {r.attachment_url && (
                      <p className="mt-2 text-sm">
                        <a className="text-[#FF6A00] underline" href={r.attachment_url} target="_blank" rel="noopener noreferrer">
                          {r.attachment_name || 'View attachment'}
                        </a>
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
};

export default AdminGraduationIntake;
