import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  ImagePlus,
  Loader2,
  Maximize2,
  Redo2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Undo2,
  WandSparkles,
  XCircle,
} from 'lucide-react';
import { authenticatedJsonBody, authorizedHeaders, setServerSessionToken } from '@/lib/serverAuth';
import { useAIAdminAccess } from '@/hooks/useAIAdminAccess';
import { trackAIEvent } from '@/lib/aiAnalytics';
import type {
  AIConcept,
  AIDesignSession,
  CreativeBrief,
  CreateWithAIProductType,
  CreateWithAIResult,
  ExactCopy,
} from './types';

type Props = {
  productType: CreateWithAIProductType;
  widthIn: number | null;
  heightIn: number | null;
  material: string | null;
  materialLabel?: string;
  quantity?: number | null;
  initialSession?: AIDesignSession | null;
  onGenerated: (result: CreateWithAIResult) => void | Promise<void>;
  onClose?: () => void;
};

const EMPTY_COPY: ExactCopy = {
  headline: '',
  supportingText: '',
  offer: '',
  callToAction: '',
  businessName: '',
  phone: '',
  website: '',
  address: '',
  date: '',
  other: '',
};

const STYLES = ['Clean and professional', 'Bold and energetic', 'Modern minimal', 'Premium and elegant', 'Friendly and approachable', 'Rustic and handcrafted'];
const PURPOSES = ['Promote a sale or offer', 'Announce an event', 'Promote a business', 'Grand opening', 'Directional or informational', 'Celebrate a milestone'];
const USAGE = ['outdoor', 'indoor'];
const COPY_LIMITS: Record<keyof ExactCopy, number> = {
  headline: 100,
  supportingText: 180,
  offer: 80,
  callToAction: 60,
  businessName: 100,
  phone: 40,
  website: 100,
  address: 140,
  date: 60,
  other: 180,
};

function makeBrief(props: Props): CreativeBrief {
  return {
    structured: false,
    description: '',
    purpose: PURPOSES[2],
    targetAudience: 'General local audience',
    primaryMessage: '',
    visualStyle: STYLES[0],
    brandPersonality: 'Confident and trustworthy',
    colorPalette: 'Navy, white, and restrained orange accents',
    subjectMatter: '',
    composition: 'Clear focal image with a clean typography zone',
    focalPoint: 'Primary subject and headline zone',
    usage: 'outdoor',
    viewingDistance: '20–50 feet',
    widthIn: Number(props.widthIn) || 96,
    heightIn: Number(props.heightIn) || 48,
    material: props.material || '13oz',
    quantity: Number(props.quantity) || 1,
    productType: props.productType,
    textPosition: 'left',
    logoPosition: 'upper-right',
    textColor: '#ffffff',
    accentColor: '#f97316',
    copy: { ...EMPTY_COPY },
  };
}

function requestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function readImage(file: File, maxBytes: number) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > maxBytes) {
    throw new Error(`Choose a PNG, JPEG, or WebP image smaller than ${Math.round(maxBytes / 1024 / 1024)}MB.`);
  }
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('That image could not be read.'));
    reader.readAsDataURL(file);
  });
}

function imageSrc(concept: AIConcept) {
  return `data:${concept.mimeType};base64,${concept.imageBase64}`;
}

function formatDuration(milliseconds: number) {
  if (!milliseconds) return '—';
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function StatusBadge({ concept }: { concept: AIConcept }) {
  if (concept.validation.passed) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Print ready</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800"><AlertCircle className="h-3.5 w-3.5" /> Needs correction</span>;
}

export default function AIWorkspace(props: Props) {
  const access = useAIAdminAccess(true);
  const [brief, setBrief] = useState<CreativeBrief>(() => props.initialSession?.brief || makeBrief(props));
  const [referenceImage, setReferenceImage] = useState<string | null>(props.initialSession?.referenceImage || null);
  const [logoImage, setLogoImage] = useState<string | null>(props.initialSession?.logoImage || null);
  const [briefReviewed, setBriefReviewed] = useState(Boolean(props.initialSession));
  const conceptCount = 1;
  const [concepts, setConcepts] = useState<AIConcept[]>(() => props.initialSession ? [props.initialSession.selectedConcept] : []);
  const [generationId, setGenerationId] = useState(props.initialSession?.generationId || '');
  const [selectedId, setSelectedId] = useState(props.initialSession?.selectedConcept.id || '');
  const [history, setHistory] = useState<AIConcept[]>(props.initialSession?.versionHistory || []);
  const [redo, setRedo] = useState<AIConcept[]>([]);
  const [pendingEdit, setPendingEdit] = useState<AIConcept | null>(null);
  const [pendingBrief, setPendingBrief] = useState<CreativeBrief | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [stage, setStage] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [fullPreview, setFullPreview] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);

  const selected = concepts.find((concept) => concept.id === selectedId) || concepts[0] || null;
  const ratio = (Number(brief.widthIn) || 1) / (Number(brief.heightIn) || 1);
  const requirementsMet = brief.widthIn > 0 && brief.heightIn > 0 && Boolean(brief.material) && Boolean(brief.description.trim());

  const reconnectAdmin = async () => {
    if (!adminPassword || reconnecting) return;
    setReconnecting(true);
    setReconnectError('');
    try {
      const response = await fetch('/.netlify/functions/admin-sign-in', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.sessionToken || body?.user?.is_admin !== true) {
        throw new Error(body?.error || 'The admin session could not be reconnected.');
      }
      setServerSessionToken(body.sessionToken);
      localStorage.setItem('banners_current_user', JSON.stringify(body.user));
      window.dispatchEvent(new Event('user-changed'));
      setAdminPassword('');
      access.refresh();
    } catch (reason) {
      setReconnectError(reason instanceof Error ? reason.message : 'The admin session could not be reconnected.');
    } finally {
      setReconnecting(false);
    }
  };

  useEffect(() => {
    trackAIEvent('ai_designer_opened', { product_type: props.productType });
    return () => controllerRef.current?.abort();
  }, [props.productType]);

  useEffect(() => {
    if (!props.widthIn || !props.heightIn || !props.material) return;
    setBrief((current) => ({
      ...current,
      widthIn: props.widthIn!,
      heightIn: props.heightIn!,
      material: props.material!,
      quantity: Number(props.quantity) || current.quantity,
      productType: props.productType,
    }));
  }, [props.widthIn, props.heightIn, props.material, props.quantity, props.productType]);

  const updateBrief = <K extends keyof CreativeBrief>(key: K, value: CreativeBrief[K]) => {
    setBrief((current) => ({ ...current, [key]: value, structured: false }));
    setBriefReviewed(false);
    if (concepts.length) {
      setConcepts([]);
      setSelectedId('');
      setHistory([]);
      setRedo([]);
      setPendingEdit(null);
      setPendingBrief(null);
    }
  };

  const updateCopy = (key: keyof ExactCopy, value: string) => {
    setBrief((current) => ({ ...current, structured: false, copy: { ...current.copy, [key]: value } }));
    setBriefReviewed(false);
    if (concepts.length) {
      setConcepts([]);
      setSelectedId('');
      setHistory([]);
      setRedo([]);
      setPendingEdit(null);
      setPendingBrief(null);
    }
  };

  const setImage = async (kind: 'reference' | 'logo', file?: File) => {
    if (!file) return;
    setError('');
    try {
      const data = await readImage(file, kind === 'logo' ? 2 * 1024 * 1024 : 3 * 1024 * 1024);
      if (kind === 'logo') setLogoImage(data);
      else setReferenceImage(data);
      setBriefReviewed(false);
      setConcepts([]);
      setSelectedId('');
      setHistory([]);
      setRedo([]);
      setPendingEdit(null);
      setPendingBrief(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The image could not be added.');
    }
  };

  const removeImage = (kind: 'reference' | 'logo') => {
    if (kind === 'logo') setLogoImage(null);
    else setReferenceImage(null);
    setBriefReviewed(false);
    setConcepts([]);
    setSelectedId('');
    setHistory([]);
    setRedo([]);
    setPendingEdit(null);
    setPendingBrief(null);
  };

  const reviewBrief = async () => {
    if (!requirementsMet) {
      setError('Select dimensions and material, then describe the design you want.');
      return;
    }
    if (!access.ready || stage) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const idempotencyKey = requestId();
    setError('');
    setStage('Interpreting your request as a structured production brief');
    try {
      const response = await fetch('/.netlify/functions/ai-designer-brief', {
        method: 'POST',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: authorizedHeaders({
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        }),
        body: authenticatedJsonBody({ brief, idempotencyKey }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body?.brief?.structured) throw new Error(body?.message || 'The production brief could not be interpreted safely.');
      setBrief((current) => ({
        ...current,
        ...body.brief,
        structured: true,
        copy: current.copy,
        textColor: current.textColor,
        accentColor: current.accentColor,
      }));
      setBriefReviewed(true);
      trackAIEvent('ai_brief_created', { product_type: brief.productType, exact_copy_fields: Object.values(brief.copy).filter(Boolean).length });
    } catch (reason) {
      if ((reason as Error)?.name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'The production brief could not be interpreted.');
    } finally {
      controllerRef.current = null;
      setStage(null);
    }
  };

  const generate = async () => {
    if (!access.ready || !briefReviewed || !requirementsMet || stage) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const idempotencyKey = requestId();
    setError('');
    setStage('Preparing the structured creative brief');
    trackAIEvent('ai_generation_started', { concept_count: conceptCount, product_type: brief.productType });
    try {
      setStage('Generating artwork, correcting the exact ratio, and validating print readiness');
      const response = await fetch('/.netlify/functions/ai-designer-generate', {
        method: 'POST',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: authorizedHeaders({
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        }),
        body: authenticatedJsonBody({ brief, conceptCount, referenceImage, logoImage, idempotencyKey }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || 'The AI designer could not generate artwork safely.');
      const nextConcepts = Array.isArray(body.concepts) ? body.concepts : [];
      if (!nextConcepts.length) throw new Error('No artwork was returned.');
      setGenerationId(body.generationId);
      setConcepts((current) => [...current, ...nextConcepts].slice(-4));
      setSelectedId(nextConcepts[0].id);
      setHistory([]);
      setRedo([]);
      setPendingEdit(null);
      setPendingBrief(null);
      const failed = nextConcepts.filter((concept: AIConcept) => !concept.validation.passed).length;
      trackAIEvent('ai_generation_succeeded', { concept_count: nextConcepts.length, validation_failures: failed });
      if (failed) trackAIEvent('ai_validation_failed', { count: failed });
    } catch (reason) {
      if ((reason as Error)?.name !== 'AbortError') {
        const message = reason instanceof Error ? reason.message : 'Generation failed.';
        setError(message);
        trackAIEvent('ai_generation_failed', { category: 'safe_request_failure' });
      }
    } finally {
      controllerRef.current = null;
      setStage(null);
    }
  };

  const edit = async () => {
    if (!selected || !editInstruction.trim() || stage || !access.ready) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const idempotencyKey = requestId();
    setError('');
    setStage('Editing the current artwork and preserving exact text layers');
    trackAIEvent('ai_edit_started', { concept_id: selected.id });
    try {
      const normalizedInstruction = editInstruction.toLowerCase();
      const requestedLogoPosition: CreativeBrief['logoPosition'] | null = !logoImage ? null
        : /logo.{0,24}(upper|top)[ -]?left|(?:upper|top)[ -]?left.{0,24}logo/.test(normalizedInstruction) ? 'upper-left'
          : /logo.{0,24}(upper|top)[ -]?right|(?:upper|top)[ -]?right.{0,24}logo/.test(normalizedInstruction) ? 'upper-right'
            : /logo.{0,24}(lower|bottom)[ -]?left|(?:lower|bottom)[ -]?left.{0,24}logo/.test(normalizedInstruction) ? 'lower-left'
              : /logo.{0,24}(lower|bottom)[ -]?right|(?:lower|bottom)[ -]?right.{0,24}logo/.test(normalizedInstruction) ? 'lower-right'
                : null;
      const briefForEdit = requestedLogoPosition ? { ...brief, logoPosition: requestedLogoPosition } : brief;
      const response = await fetch('/.netlify/functions/ai-designer-edit', {
        method: 'POST',
        credentials: 'same-origin',
        signal: controller.signal,
        headers: authorizedHeaders({
          'Content-Type': 'application/json',
          'X-Idempotency-Key': idempotencyKey,
        }),
        body: authenticatedJsonBody({
          brief: briefForEdit,
          conceptId: selected.id,
          generationId: selected.generationId,
          currentBackgroundRef: selected.backgroundRef,
          editInstruction: editInstruction.trim(),
          referenceImage,
          logoImage,
          idempotencyKey,
        }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message || 'The edit could not be completed safely.');
      if (!body?.usedOriginalImage || !body?.concept) throw new Error('The server did not confirm use of the current artwork.');
      setPendingEdit(body.concept);
      setPendingBrief(briefForEdit);
      if (!body.concept.validation.passed) trackAIEvent('ai_validation_failed', { count: 1 });
    } catch (reason) {
      if ((reason as Error)?.name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'The edit failed.');
    } finally {
      controllerRef.current = null;
      setStage(null);
    }
  };

  const acceptPendingEdit = () => {
    if (!selected || !pendingEdit) return;
    setHistory((items) => [...items, selected].slice(-20));
    setRedo([]);
    setConcepts((items) => items.map((item) => item.id === selected.id ? pendingEdit : item));
    setSelectedId(pendingEdit.id);
    if (pendingBrief) setBrief(pendingBrief);
    setPendingEdit(null);
    setPendingBrief(null);
    setEditInstruction('');
    trackAIEvent('ai_edit_succeeded', { validation_passed: pendingEdit.validation.passed });
  };

  const rejectPendingEdit = () => {
    if (!pendingEdit) return;
    setPendingEdit(null);
    setPendingBrief(null);
    setEditInstruction('');
    trackAIEvent('ai_edit_rejected', { validation_passed: pendingEdit.validation.passed });
  };

  const undo = () => {
    if (!selected || !history.length) return;
    const previous = history[history.length - 1];
    setHistory((items) => items.slice(0, -1));
    setRedo((items) => [...items, selected].slice(-20));
    setConcepts((items) => items.map((item) => item.id === selected.id ? previous : item));
    setSelectedId(previous.id);
  };

  const redoEdit = () => {
    if (!selected || !redo.length) return;
    const next = redo[redo.length - 1];
    setRedo((items) => items.slice(0, -1));
    setHistory((items) => [...items, selected].slice(-20));
    setConcepts((items) => items.map((item) => item.id === selected.id ? next : item));
    setSelectedId(next.id);
  };

  const removeConcept = (conceptId: string) => {
    const next = concepts.filter((concept) => concept.id !== conceptId);
    setConcepts(next);
    if (selectedId === conceptId) setSelectedId(next[0]?.id || '');
  };

  const apply = async () => {
    if (!selected?.validation.passed) return;
    const session: AIDesignSession = {
      generationId: selected.generationId || generationId,
      brief,
      selectedConcept: selected,
      referenceImage,
      logoImage,
      versionHistory: history,
    };
    trackAIEvent('ai_design_approved', { concept_id: selected.id, version_id: selected.versionId });
    await props.onGenerated({
      imageBase64: selected.imageBase64,
      mimeType: selected.mimeType,
      width: brief.widthIn,
      height: brief.heightIn,
      fileName: `ai-${brief.productType}-${brief.widthIn}x${brief.heightIn}-${Date.now()}.jpg`,
      prompt: brief.description,
      session,
    });
    trackAIEvent('ai_applied_to_configurator', { product_type: brief.productType });
  };

  const blockerCopy = access.loading
    ? 'Checking secure GPT Image 2 configuration…'
    : !access.authorized
      ? 'A verified administrator session is required.'
      : !access.enabled
        ? 'AI is disabled for this deployment.'
      : !access.keyConfigured
          ? 'No server-side OpenAI key is configured for this deployment.'
          : !access.temporaryStorageConfigured
            ? 'Authenticated temporary artwork storage is not configured for this deployment.'
          : !access.modelAvailable
            ? 'GPT Image 2 is not available to the configured OpenAI project.'
            : null;

  return (
    <div className="min-h-0 bg-[#f8f6f1] text-slate-900" data-testid="ai-workspace">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-orange-600"><WandSparkles className="h-4 w-4" /> Banners On The Fly</div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-[#0b1f3a] sm:text-3xl">Create professional artwork with AI</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">Flat, edge-to-edge print artwork only. Exact wording and logos stay in controlled layers—never left to the image model.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${access.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
              {access.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : access.ready ? <ShieldCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {access.ready ? `${access.model} ready` : 'Configuration check'}
            </span>
            {props.onClose && <button type="button" onClick={props.onClose} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /> Back</button>}
          </div>
        </div>
        {blockerCopy && !access.loading && <div role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {blockerCopy}</div>{access.authenticationFailed && <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input aria-label="Admin password" type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void reconnectAdmin(); }} placeholder="Enter admin password" className="min-h-11 flex-1 rounded-lg border border-amber-300 bg-white px-3 text-base text-slate-900" /><button type="button" onClick={() => void reconnectAdmin()} disabled={!adminPassword || reconnecting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0b1f3a] px-4 font-bold text-white disabled:opacity-50">{reconnecting && <Loader2 className="h-4 w-4 animate-spin" />} Reconnect admin</button></div>}{reconnectError && <div className="mt-2 text-sm font-semibold text-red-700">{reconnectError}</div>}</div>}
      </div>

      <div className="grid min-h-0 grid-cols-1 xl:grid-cols-[minmax(330px,0.86fr)_minmax(480px,1.45fr)]">
        <section className="space-y-5 border-b border-slate-200 p-4 sm:p-6 xl:border-b-0 xl:border-r">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-black text-[#0b1f3a]">1. Creative brief</h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{brief.widthIn}&quot; × {brief.heightIn}&quot; · {ratio.toFixed(3)}:1</span>
            </div>
            <label htmlFor="ai-description" className="mt-4 block text-sm font-bold text-slate-800">Describe the design you want</label>
            <textarea id="ai-description" value={brief.description} onChange={(event) => updateBrief('description', event.target.value.slice(0, 1200))} rows={5} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-base shadow-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200" placeholder="Example: A polished grand-opening design for a family restaurant, with warm food photography, strong contrast, and space for a headline and offer." />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="text-sm font-semibold text-slate-700">Purpose<select value={brief.purpose} onChange={(event) => updateBrief('purpose', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3">{PURPOSES.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="text-sm font-semibold text-slate-700">Visual direction<select value={brief.visualStyle} onChange={(event) => updateBrief('visualStyle', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3">{STYLES.map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="text-sm font-semibold text-slate-700">Audience<input value={brief.targetAudience} onChange={(event) => updateBrief('targetAudience', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3" /></label>
              <label className="text-sm font-semibold text-slate-700">Subject matter<input value={brief.subjectMatter} onChange={(event) => updateBrief('subjectMatter', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3" placeholder="Food, tools, people, products…" /></label>
              <label className="text-sm font-semibold text-slate-700">Text zone<select value={brief.textPosition} onChange={(event) => updateBrief('textPosition', event.target.value as CreativeBrief['textPosition'])} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
              <label className="text-sm font-semibold text-slate-700">Use<select value={brief.usage} onChange={(event) => updateBrief('usage', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3">{USAGE.map((value) => <option key={value}>{value}</option>)}</select></label>
            </div>
            <details className="mt-3 rounded-xl border border-slate-200 bg-white p-3">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-bold text-[#0b1f3a]">Advanced creative direction <ChevronDown className="h-4 w-4" /></summary>
              <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2">
                <label className="text-sm font-semibold text-slate-700">Brand personality<input value={brief.brandPersonality} onChange={(event) => updateBrief('brandPersonality', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
                <label className="text-sm font-semibold text-slate-700">Color palette<input value={brief.colorPalette} onChange={(event) => updateBrief('colorPalette', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
                <label className="text-sm font-semibold text-slate-700">Focal point<input value={brief.focalPoint} onChange={(event) => updateBrief('focalPoint', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
                <label className="text-sm font-semibold text-slate-700">Viewing distance<input value={brief.viewingDistance} onChange={(event) => updateBrief('viewingDistance', event.target.value)} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 px-3" /></label>
              </div>
            </details>
          </div>

          <div>
            <h3 className="text-lg font-black text-[#0b1f3a]">2. Exact wording</h3>
            <p className="mt-1 text-sm text-slate-600">These fields are rendered separately so phone numbers, prices, dates, and business names stay exact.</p>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {([
                ['headline', 'Headline', 'GRAND OPENING'],
                ['supportingText', 'Supporting text', 'Fresh food. Friendly service.'],
                ['offer', 'Offer', '20% OFF THIS WEEK'],
                ['callToAction', 'Call to action', 'VISIT US TODAY'],
                ['businessName', 'Business name', 'Business name'],
                ['phone', 'Phone', '(502) 555-0123'],
                ['website', 'Website', 'example.com'],
                ['date', 'Date', 'AUGUST 15'],
                ['address', 'Address', '123 Main Street'],
                ['other', 'Other required copy', 'Any other exact wording'],
              ] as Array<[keyof ExactCopy, string, string]>).map(([key, label, placeholder]) => (
                <label key={key} className={`text-sm font-semibold text-slate-700 ${key === 'supportingText' || key === 'address' || key === 'other' ? 'sm:col-span-2' : ''}`}>{label}<input value={brief.copy[key]} maxLength={COPY_LIMITS[key]} onChange={(event) => updateCopy(key, event.target.value)} placeholder={placeholder} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3" /></label>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-4">
              <label className="text-sm font-semibold text-slate-700">Text color<input type="color" value={brief.textColor} onChange={(event) => updateBrief('textColor', event.target.value)} className="ml-2 h-11 w-14 rounded border border-slate-300 align-middle" /></label>
              <label className="text-sm font-semibold text-slate-700">Accent color<input type="color" value={brief.accentColor} onChange={(event) => updateBrief('accentColor', event.target.value)} className="ml-2 h-11 w-14 rounded border border-slate-300 align-middle" /></label>
            </div>
          </div>

          <div>
            <h3 className="text-lg font-black text-[#0b1f3a]">3. Optional brand assets</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-3 text-center hover:border-orange-400"><ImagePlus className="h-5 w-5 text-orange-600" /><span className="mt-1 text-sm font-bold">Reference image</span><span className="text-xs text-slate-500">Style guidance only · max 3MB</span><input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImage('reference', event.target.files?.[0])} /></label>
              <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-3 text-center hover:border-orange-400"><ImagePlus className="h-5 w-5 text-orange-600" /><span className="mt-1 text-sm font-bold">Logo</span><span className="text-xs text-slate-500">Placed as a controlled layer · max 2MB</span><input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImage('logo', event.target.files?.[0])} /></label>
            </div>
            {(referenceImage || logoImage) && <div className="mt-2 flex flex-wrap items-center gap-2">{referenceImage && <button type="button" onClick={() => removeImage('reference')} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold">Remove reference</button>}{logoImage && <><label className="text-sm font-semibold text-slate-700">Logo position<select value={brief.logoPosition} onChange={(event) => updateBrief('logoPosition', event.target.value as CreativeBrief['logoPosition'])} className="ml-2 min-h-11 rounded-lg border border-slate-300 bg-white px-3"><option value="upper-left">Upper left</option><option value="upper-right">Upper right</option><option value="lower-left">Lower left</option><option value="lower-right">Lower right</option></select></label><button type="button" onClick={() => removeImage('logo')} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold">Remove logo</button></>}</div>}
          </div>

          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4">
            <h3 className="font-black text-[#0b1f3a]">Interpreted production brief</h3>
            <ul className="mt-2 space-y-1 text-sm text-slate-700">
              <li><strong>Canvas:</strong> {brief.widthIn}&quot; × {brief.heightIn}&quot;, exact {ratio.toFixed(4)}:1 ratio</li>
              <li><strong>Artwork:</strong> flat and edge-to-edge; no mockup, scene, frame, grommets, eyelets, hardware, folds, rulers, or blank bars</li>
              <li><strong>Copy:</strong> {Object.values(brief.copy).filter(Boolean).length} controlled exact-text field(s)</li>
              <li><strong>Finishing:</strong> preview overlays remain separate and will not be printed</li>
            </ul>
            <button type="button" onClick={() => void reviewBrief()} disabled={!requirementsMet || !access.ready || Boolean(stage)} className={`mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg px-4 text-sm font-black transition ${briefReviewed ? 'bg-emerald-600 text-white' : 'bg-[#0b1f3a] text-white hover:bg-[#12345d]'} disabled:cursor-not-allowed disabled:opacity-50`}>{stage?.startsWith('Interpreting') ? <><Loader2 className="h-4 w-4 animate-spin" /> Interpreting brief…</> : briefReviewed ? <><Check className="h-4 w-4" /> Brief reviewed</> : 'Interpret, review, and confirm brief'}</button>
          </div>
        </section>

        <section className="min-w-0 space-y-5 p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h3 className="text-lg font-black text-[#0b1f3a]">4. Generate and refine</h3><p className="text-sm text-slate-600">Concept previews always show the complete canvas—never a square crop.</p></div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold text-slate-600">One concept per request · compare up to four</span>
              <button type="button" onClick={generate} disabled={!access.ready || !briefReviewed || !requirementsMet || Boolean(stage)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-orange-600 px-5 text-sm font-black text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"><Sparkles className="h-4 w-4" /> {concepts.length ? 'Generate new concepts' : 'Generate concepts'}</button>
            </div>
          </div>

          {stage && <div role="status" aria-live="polite" className="flex items-center justify-between gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm font-semibold text-blue-900"><span className="flex items-center gap-2"><Loader2 className="h-5 w-5 animate-spin" /> {stage}</span><button type="button" onClick={() => controllerRef.current?.abort()} className="min-h-11 rounded-lg border border-blue-300 px-3">Cancel</button></div>}
          {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><XCircle className="mt-0.5 h-5 w-5 shrink-0" /><span>{error}</span></div>}

          {!concepts.length && !stage && <div className="grid min-h-72 place-items-center rounded-2xl border-2 border-dashed border-slate-300 bg-white p-8 text-center"><div><Sparkles className="mx-auto h-9 w-9 text-orange-500" /><h4 className="mt-3 text-lg font-black text-[#0b1f3a]">Your concepts will appear here</h4><p className="mt-1 max-w-md text-sm text-slate-600">Confirm the creative brief, then GPT Image 2 will create the background, apply exact text and logo layers, and validate the finished artwork.</p></div></div>}

          {concepts.length > 0 && <div className="grid grid-cols-1 gap-4 2xl:grid-cols-2">{concepts.map((concept, index) => (
            <article key={concept.versionId} className={`rounded-2xl border-2 bg-white p-3 shadow-sm transition ${selected?.versionId === concept.versionId ? 'border-orange-500 ring-2 ring-orange-100' : 'border-slate-200 hover:border-slate-300'}`}>
              <button type="button" disabled={Boolean(pendingEdit)} onClick={() => { setSelectedId(concept.id); trackAIEvent('ai_concept_selected', { concept_index: index }); }} className="block w-full text-left disabled:cursor-not-allowed disabled:opacity-70" aria-pressed={selected?.versionId === concept.versionId}>
                <div className="flex h-72 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100"><img src={imageSrc(concept)} alt={`Complete AI concept ${index + 1}`} className="h-full w-full object-contain" /></div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-black text-[#0b1f3a]">Concept {index + 1}</div><div className="text-xs text-slate-500">{concept.widthIn}&quot; × {concept.heightIn}&quot; · {concept.aspectRatio.toFixed(4)}:1</div></div><StatusBadge concept={concept} /></div>
              </button>
              <div className="mt-3 flex gap-2"><button type="button" disabled={Boolean(pendingEdit)} onClick={() => setSelectedId(concept.id)} className="min-h-11 flex-1 rounded-lg bg-[#0b1f3a] px-3 text-sm font-bold text-white disabled:opacity-50">Select</button><button type="button" disabled={Boolean(pendingEdit)} onClick={() => removeConcept(concept.id)} aria-label={`Delete concept ${index + 1}`} className="min-h-11 min-w-11 rounded-lg border border-slate-300 text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"><Trash2 className="mx-auto h-4 w-4" /></button></div>
            </article>
          ))}</div>}

          {selected && <div className="rounded-2xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-lg font-black text-[#0b1f3a]">Selected production design</h4><p className="text-sm text-slate-600">Edit the existing background while exact text and logo layers remain controlled.</p></div><div className="flex gap-2"><button type="button" onClick={undo} disabled={!history.length || Boolean(stage) || Boolean(pendingEdit)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-40"><Undo2 className="h-4 w-4" /> Undo</button><button type="button" onClick={redoEdit} disabled={!redo.length || Boolean(stage) || Boolean(pendingEdit)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-40"><Redo2 className="h-4 w-4" /> Redo</button><button type="button" onClick={() => setFullPreview(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold"><Maximize2 className="h-4 w-4" /> Full preview</button></div></div>
            <div className="mt-4 flex h-[min(55vh,36rem)] w-full items-center justify-center overflow-hidden rounded-xl border border-slate-300 bg-slate-100"><img src={imageSrc(selected)} alt="Complete selected flat print artwork" className="h-full w-full object-contain" /></div>

            {pendingEdit && <div className="mt-4 rounded-xl border-2 border-orange-300 bg-orange-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h5 className="font-black text-[#0b1f3a]">Review the proposed edit</h5><p className="mt-1 max-w-3xl text-sm text-slate-700">Image editing preserves unrelated details when technically possible, but cannot guarantee pixel-identical regions. Compare the complete canvases before accepting.</p></div><StatusBadge concept={pendingEdit} /></div><div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2"><figure><figcaption className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-600">Before</figcaption><div className="flex h-56 items-center justify-center overflow-hidden rounded-lg border border-slate-300 bg-slate-100"><img src={imageSrc(selected)} alt="Artwork before proposed AI edit" className="h-full w-full object-contain" /></div></figure><figure><figcaption className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-600">Proposed edit</figcaption><div className="flex h-56 items-center justify-center overflow-hidden rounded-lg border border-orange-300 bg-slate-100"><img src={imageSrc(pendingEdit)} alt="Artwork after proposed AI edit" className="h-full w-full object-contain" /></div></figure></div><div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={rejectPendingEdit} className="min-h-11 rounded-lg border border-slate-400 bg-white px-5 text-sm font-bold text-slate-800">Reject edit</button><button type="button" onClick={acceptPendingEdit} className="min-h-11 rounded-lg bg-orange-600 px-5 text-sm font-black text-white hover:bg-orange-700">Accept edit</button></div></div>}

            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
              <label className="text-sm font-bold text-slate-800">Edit with AI<textarea value={editInstruction} onChange={(event) => setEditInstruction(event.target.value.slice(0, 700))} rows={3} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-base" placeholder='Example: “Make the background lighter and keep everything else exactly the same.”' /></label>
              <button type="button" onClick={edit} disabled={!editInstruction.trim() || Boolean(stage) || !access.ready || Boolean(pendingEdit)} className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-[#0b1f3a] px-5 py-3 text-sm font-black text-white disabled:opacity-50"><WandSparkles className="h-4 w-4" /> Edit current design</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">{['Make the background lighter', 'Change colors to navy and orange', ...(logoImage ? ['Move the logo to the upper-left'] : []), 'Remove the people', 'Make it more professional', 'Keep everything else exactly the same'].map((value) => <button key={value} type="button" onClick={() => setEditInstruction(value)} className="min-h-11 rounded-full border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:border-orange-400">{value}</button>)}</div>

            <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className={`rounded-xl border p-4 ${selected.validation.passed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-center gap-2 font-black text-[#0b1f3a]">{selected.validation.passed ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-amber-700" />} Print-readiness validation</div><ul className="mt-2 space-y-1 text-sm text-slate-700"><li>Dimensions: {selected.validation.checks.dimensions.passed ? 'Exact' : 'Failed'}</li><li>Full edge coverage: {selected.validation.checks.edgeCoverage.passed ? 'Passed' : 'Failed'}</li><li>Flat artwork / no hardware: {selected.validation.checks.flatArtwork.passed ? 'Passed' : 'Failed'}</li><li>Exact text OCR: {selected.validation.checks.exactText.passed ? 'Passed' : 'Failed'}</li><li>Resolution: {selected.validation.checks.resolution.effectivePpi} PPI ({selected.validation.checks.resolution.passed ? 'passed' : 'failed'})</li></ul>{selected.validation.reasons.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">{selected.validation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}</div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 font-black text-[#0b1f3a]"><Clock3 className="h-5 w-5 text-slate-500" /> Version and output</div><ul className="mt-2 space-y-1 text-sm text-slate-700"><li>Output: {selected.diagnostics.outputDimensions}px</li><li>Ratio method: {selected.diagnostics.ratioStrategy.replace(/-/g, ' ')}</li><li>Model: {selected.diagnostics.modelSnapshot || selected.diagnostics.model}</li><li>Generation time: {formatDuration(selected.diagnostics.durationMs)}</li><li>Estimated image API cost: {selected.diagnostics.estimatedCostUsd == null ? 'Unavailable' : `$${selected.diagnostics.estimatedCostUsd.toFixed(4)}`}</li><li>Auto-repaired: {selected.diagnostics.repaired ? 'Yes' : 'No'}</li></ul></div>
            </div>

            {history.length > 0 && <div className="mt-4"><h5 className="text-sm font-black text-[#0b1f3a]">Version history</h5><div className="mt-2 flex gap-2 overflow-x-auto pb-2">{history.map((version, index) => <button key={version.versionId} type="button" onClick={() => { if (!selected) return; setRedo((items) => [...items, selected]); setConcepts((items) => items.map((item) => item.id === selected.id ? version : item)); }} className="w-32 shrink-0 rounded-lg border border-slate-300 bg-white p-2 text-left"><div className="flex h-20 items-center justify-center overflow-hidden bg-slate-100"><img src={imageSrc(version)} alt={`Version ${index + 1}`} className="h-full w-full object-contain" /></div><span className="mt-1 block text-xs font-semibold">Version {index + 1}</span></button>)}</div></div>}

            <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-bold text-[#0b1f3a]">Admin diagnostics <ChevronDown className="h-4 w-4" /></summary><dl className="grid grid-cols-1 gap-x-4 gap-y-2 pt-3 text-xs text-slate-600 sm:grid-cols-2"><div><dt className="font-bold">Generation ID</dt><dd className="break-all">{selected.generationId || generationId}</dd></div><div><dt className="font-bold">Version ID</dt><dd className="break-all">{selected.versionId}</dd></div><div><dt className="font-bold">Provider request ID</dt><dd className="break-all">{selected.diagnostics.providerRequestId || 'Not returned'}</dd></div><div><dt className="font-bold">Validation model</dt><dd>{selected.validation.vision.model}</dd></div></dl></details>

            <button type="button" onClick={apply} disabled={!selected.validation.passed || Boolean(stage) || Boolean(pendingEdit)} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-base font-black text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"><CheckCircle2 className="h-5 w-5" /> {pendingEdit ? 'Accept or reject the proposed edit first' : selected.validation.passed ? 'Approve and use in banner configurator' : 'Approval blocked until validation passes'}</button>
          </div>}
        </section>
      </div>

      {fullPreview && selected && <div role="dialog" aria-modal="true" aria-label="Full artwork preview" className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/85 p-4" onClick={() => setFullPreview(false)}><div className="w-full max-w-[95vw]" onClick={(event) => event.stopPropagation()}><div className="mb-3 flex justify-end"><button type="button" onClick={() => setFullPreview(false)} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-white px-4 text-sm font-bold text-slate-900"><XCircle className="h-4 w-4" /> Close</button></div><img src={imageSrc(selected)} alt="Full-size flat print artwork" className="max-h-[85vh] w-full object-contain" /></div></div>}
    </div>
  );
}
