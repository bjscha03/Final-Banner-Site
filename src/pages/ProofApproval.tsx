import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import {
  CheckCircle,
  Loader2,
  Edit3,
  Image as ImageIcon,
  ShieldCheck,
  ArrowRight,
  Upload,
} from 'lucide-react';
import Layout from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { usd } from '@/lib/pricing';
import { useCartStore } from '@/store/cart';

interface PublicProof {
  id: string;
  versionNumber: number;
  proofFileUrl: string;
  proofFileName?: string | null;
  adminMessage?: string | null;
  status: string;
  sentAt: string;
}

interface PublicIntake {
  id: string;
  customerName: string;
  productType: string;
  productSpecs: Record<string, unknown>;
  graduateInfo: Record<string, unknown>;
  status: string;
  designFeePaid: boolean;
  finalPaymentPaid: boolean;
  estimatedProductSubtotalCents?: number | null;
  estimatedTaxCents?: number | null;
  estimatedProductTotalCents?: number | null;
  finalBalanceCents: number;
}

const PRODUCT_LABELS: Record<string, string> = {
  banner: 'Banner',
  yard_sign: 'Yard Sign',
  car_magnet: 'Car Magnet',
};

/**
 * Customer-facing proof approval page. Loads via the public approval token
 * so authentication is not required (the token itself is the credential).
 *
 * The page renders the latest proof, the order summary, and two actions:
 *   - Approve & Pay  → marks proof approved server-side, loads the final
 *     product balance into the standard site cart, and navigates to
 *     /checkout?graduationFinalPayment=<intakeId> for normal checkout.
 *   - Request Edits  → calls graduation-proof-request-edits to log a revision
 */
const ProofApproval: React.FC = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const addGraduationFinalPayment = useCartStore((s) => s.addGraduationFinalPayment);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [intake, setIntake] = useState<PublicIntake | null>(null);
  const [proof, setProof] = useState<PublicProof | null>(null);
  const [approving, setApproving] = useState(false);
  const [requestingEdits, setRequestingEdits] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editAttachment, setEditAttachment] = useState<{ url: string; name: string } | null>(null);
  const [uploadingAttachment, setUploadingAttachment] = useState(false);
  const [editSent, setEditSent] = useState(false);

  const loadProof = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/.netlify/functions/graduation-proof-get', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to load proof');
      setIntake(data.intake);
      setProof(data.proof);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load proof');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) loadProof();
  }, [token, loadProof]);

  // Surface a friendly notice if the customer was bounced back from a
  // cancelled PayPal session or returned via a stale link from the legacy
  // direct-PayPal flow. We no longer attempt to capture from this page —
  // payment is completed via the standard /checkout page.
  const finalParam = searchParams.get('final');
  useEffect(() => {
    if (finalParam === 'cancel') {
      toast({
        title: 'Payment cancelled',
        description: 'You can approve and pay again whenever you’re ready.',
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalParam]);

  const handleApprove = async () => {
    if (!intake) return;
    setApproving(true);
    try {
      const res = await fetch('/.netlify/functions/graduation-proof-approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to approve proof');

      // Load the final product balance into the standard site cart.
      addGraduationFinalPayment({
        intakeId: data.intakeId,
        proofVersionNumber: data.proofVersionNumber,
        approvedProofUrl: data.approvedProofUrl,
        approvedProofFileName: data.approvedProofFileName ?? null,
        productType: data.productType,
        productSpecs: data.productSpecs || {},
        amountCents: data.amountCents,
        customerName: data.customerName ?? null,
        customerEmail: data.customerEmail ?? null,
      });

      // Redirect to standard site checkout with marker query param.
      navigate(`/checkout?graduationFinalPayment=${encodeURIComponent(data.intakeId)}`);
    } catch (err) {
      toast({
        title: 'Could not start checkout',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
      setApproving(false);
    }
  };

  const handleAttachmentSelect = async (file: File) => {
    if (file.size > 25 * 1024 * 1024) {
      toast({ title: 'File too large', description: 'Please upload a file under 25MB.', variant: 'destructive' });
      return;
    }
    setUploadingAttachment(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/.netlify/functions/upload-file', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Upload failed');
      const data = await res.json();
      if (!data.secureUrl) throw new Error('Upload returned no URL');
      setEditAttachment({ url: data.secureUrl, name: file.name });
    } catch (err) {
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'Please try again or skip the upload.',
        variant: 'destructive',
      });
    } finally {
      setUploadingAttachment(false);
    }
  };

  const handleSubmitEdits = async () => {
    if (!editNotes.trim()) {
      toast({ title: 'Please describe the changes', variant: 'destructive' });
      return;
    }
    setRequestingEdits(true);
    try {
      const res = await fetch('/.netlify/functions/graduation-proof-request-edits', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          notes: editNotes.trim(),
          attachmentUrl: editAttachment?.url ?? null,
          attachmentName: editAttachment?.name ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Failed to send edit request');
      setEditSent(true);
      setShowEditForm(false);
      toast({ title: 'Edit request sent', description: "We'll send a revised proof shortly." });
      await loadProof();
    } catch (err) {
      toast({
        title: 'Failed to send edits',
        description: err instanceof Error ? err.message : 'Please try again.',
        variant: 'destructive',
      });
    } finally {
      setRequestingEdits(false);
    }
  };

  const productLabel = intake ? PRODUCT_LABELS[intake.productType] || intake.productType : '';
  const specs = (intake?.productSpecs || {}) as Record<string, string | number>;
  const sizeText = String(specs.size || specs.sizeType || '');

  return (
    <Layout>
      <Helmet>
        <title>Review Your Graduation Design Proof</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <section className="bg-[#F7F7F7] min-h-screen py-10">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          {loading && (
            <div className="text-center py-20">
              <Loader2 className="h-8 w-8 animate-spin text-[#FF6A00] mx-auto" />
              <p className="text-gray-500 mt-3">Loading your proof…</p>
            </div>
          )}

          {!loading && error && (
            <div className="rounded-2xl bg-white p-8 shadow-sm border border-red-100 text-center">
              <h1 className="text-xl font-bold text-red-700">Proof not available</h1>
              <p className="text-sm text-gray-600 mt-2">{error}</p>
              <p className="text-sm text-gray-500 mt-4">
                If you believe this is a mistake, please contact{' '}
                <a className="text-[#FF6A00]" href="mailto:support@bannersonthefly.com">
                  support@bannersonthefly.com
                </a>
                .
              </p>
            </div>
          )}

          {!loading && !error && intake && (
            <>
              <div className="text-center mb-6">
                <p className="text-sm uppercase tracking-wide text-[#FF6A00] font-bold">
                  Graduation Design Proof
                </p>
                <h1 className="text-3xl font-extrabold text-[#0B1F3A] mt-1">
                  Hi {intake.customerName.split(' ')[0] || 'there'}, your proof is ready
                </h1>
              </div>

              {intake.finalPaymentPaid ? (
                <div className="rounded-2xl bg-white p-8 shadow-sm border border-green-100 text-center">
                  <CheckCircle className="h-12 w-12 text-green-600 mx-auto" />
                  <h2 className="text-2xl font-bold text-[#0B1F3A] mt-3">Approved &amp; paid 🎓</h2>
                  <p className="text-gray-600 mt-2">
                    Your payment is confirmed and production is starting. You'll receive shipping
                    tracking shortly.
                  </p>
                  {proof && (
                    <p className="mt-4 text-sm">
                      <a
                        href={proof.proofFileUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[#FF6A00] underline"
                      >
                        View approved proof
                      </a>
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {/* Proof preview */}
                  <div className="rounded-2xl bg-white p-6 shadow-sm border border-gray-200">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div>
                        <p className="text-xs uppercase tracking-wide text-gray-500">
                          Proof — Version {proof?.versionNumber || '—'}
                        </p>
                        <h2 className="text-lg font-bold text-[#0B1F3A]">
                          {productLabel}
                          {sizeText ? ` · ${sizeText}` : ''}
                        </h2>
                      </div>
                      {proof?.proofFileUrl && (
                        <a
                          href={proof.proofFileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-[#FF6A00] underline"
                        >
                          Open full size
                        </a>
                      )}
                    </div>
                    {proof?.proofFileUrl ? (
                      <div className="mt-4 rounded-xl overflow-hidden border border-gray-200 bg-gray-50">
                        {/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(proof.proofFileUrl) ? (
                          <img
                            src={proof.proofFileUrl}
                            alt="Proof preview"
                            className="w-full h-auto block"
                          />
                        ) : (
                          <div className="p-10 text-center">
                            <ImageIcon className="h-10 w-10 text-gray-400 mx-auto mb-2" />
                            <p className="text-sm text-gray-600">
                              {proof.proofFileName || 'Proof file'} (preview not available)
                            </p>
                            <a
                              href={proof.proofFileUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block mt-3 text-sm font-semibold text-[#FF6A00] underline"
                            >
                              Download / view
                            </a>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500 mt-4">
                        Your proof will appear here once our designer uploads it.
                      </p>
                    )}
                    {proof?.adminMessage && (
                      <div className="mt-4 rounded-xl bg-[#FFF7ED] border-l-4 border-[#FF6A00] p-4">
                        <p className="text-xs uppercase font-bold text-[#FF6A00]">From the designer</p>
                        <p className="text-sm text-[#0B1F3A] mt-1 whitespace-pre-wrap">
                          {proof.adminMessage}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Order summary */}
                  <div className="mt-5 rounded-2xl bg-white p-6 shadow-sm border border-gray-200">
                    <h3 className="text-sm font-bold text-[#0B1F3A] uppercase tracking-wide">
                      Order Summary
                    </h3>
                    <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
                      <dt className="text-gray-500">Product</dt>
                      <dd className="font-semibold text-[#0B1F3A]">{productLabel}</dd>
                      {sizeText && (
                        <>
                          <dt className="text-gray-500">Size</dt>
                          <dd className="font-semibold text-[#0B1F3A]">{sizeText}</dd>
                        </>
                      )}
                      {specs.quantity != null && (
                        <>
                          <dt className="text-gray-500">Quantity</dt>
                          <dd className="font-semibold text-[#0B1F3A]">{String(specs.quantity)}</dd>
                        </>
                      )}
                    </dl>
                    <hr className="my-4 border-gray-200" />
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600">Design fee paid</span>
                      <span className="font-semibold text-[#0B1F3A]">$19.00</span>
                    </div>
                    <div className="flex items-center justify-between mt-2 text-lg">
                      <span className="text-[#0B1F3A] font-bold">Balance due now</span>
                      <span className="font-extrabold text-[#0B1F3A]">
                        {usd(intake.finalBalanceCents / 100)}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mt-3 flex items-start gap-2">
                      <ShieldCheck className="h-4 w-4 flex-shrink-0 text-[#FF6A00] mt-0.5" />
                      Pricing is computed automatically from your selected options. Production starts
                      immediately after approval and payment.
                    </p>
                  </div>

                  {/* Actions */}
                  {editSent ? (
                    <div className="mt-5 rounded-2xl bg-white p-6 shadow-sm border border-yellow-200">
                      <p className="text-[#0B1F3A] font-semibold">Edit request received ✓</p>
                      <p className="text-sm text-gray-600 mt-1">
                        Our designer is on it. You'll get an email when your revised proof is ready.
                      </p>
                    </div>
                  ) : (
                    <>
                      {!showEditForm && (
                        <div className="mt-6 grid sm:grid-cols-2 gap-3">
                          <Button
                            onClick={handleApprove}
                            disabled={approving || !proof}
                            className="bg-[#FF6A00] hover:bg-[#E65F00] text-white font-bold py-6 text-base"
                          >
                            {approving ? (
                              <>
                                <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                                Continuing to checkout…
                              </>
                            ) : (
                              <>
                                Approve &amp; Pay {usd(intake.finalBalanceCents / 100)}
                                <ArrowRight className="h-5 w-5 ml-2" />
                              </>
                            )}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => setShowEditForm(true)}
                            disabled={!proof}
                            className="border-[#0B1F3A]/20 text-[#0B1F3A] py-6 text-base font-semibold"
                          >
                            <Edit3 className="h-5 w-5 mr-2" />
                            Request Edits
                          </Button>
                        </div>
                      )}

                      {showEditForm && (
                        <div className="mt-5 rounded-2xl bg-white p-6 shadow-sm border border-gray-200">
                          <h3 className="text-base font-bold text-[#0B1F3A]">Request edits</h3>
                          <p className="text-sm text-gray-600 mt-1">
                            Tell us what you'd like changed. Be as specific as possible.
                          </p>
                          <textarea
                            className="mt-3 w-full rounded-lg border border-gray-300 p-3 min-h-[120px] focus:border-[#FF6A00] focus:outline-none"
                            placeholder="e.g. Make the graduate's name larger, change school colors to navy and gold, add the date 5/15/2025."
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                            maxLength={8000}
                          />
                          <div className="mt-3">
                            <label className="inline-flex items-center gap-2 text-sm font-semibold text-[#0B1F3A] cursor-pointer">
                              <Upload className="h-4 w-4" />
                              {uploadingAttachment ? 'Uploading…' : (editAttachment ? 'Replace attachment' : 'Add reference image (optional)')}
                              <input
                                type="file"
                                className="sr-only"
                                accept="image/*,.pdf"
                                onChange={(e) => {
                                  const f = e.target.files?.[0];
                                  if (f) handleAttachmentSelect(f);
                                  e.target.value = '';
                                }}
                                disabled={uploadingAttachment}
                              />
                            </label>
                            {editAttachment && (
                              <p className="text-xs text-gray-500 mt-1 truncate">
                                Attached: {editAttachment.name}
                              </p>
                            )}
                          </div>
                          <div className="flex gap-3 mt-4">
                            <Button
                              onClick={handleSubmitEdits}
                              disabled={requestingEdits || !editNotes.trim()}
                              className="bg-[#FF6A00] hover:bg-[#E65F00] text-white font-bold"
                            >
                              {requestingEdits ? (
                                <>
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                  Sending…
                                </>
                              ) : (
                                'Send edit request'
                              )}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              onClick={() => setShowEditForm(false)}
                              disabled={requestingEdits}
                            >
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </section>
    </Layout>
  );
};

export default ProofApproval;
