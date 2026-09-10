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
import { useAuth } from '@/lib/auth';
import { loadDraft, saveDraft } from './draftStore';
import LayerControls from './LayerControls';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
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
const DIRECTION_FIELDS = new Set<keyof CreativeBrief>(['purpose', 'targetAudience', 'visualStyle', 'brandPersonality', 'colorPalette', 'subjectMatter', 'composition', 'focalPoint', 'viewingDistance', 'textPosition', 'textColor', 'accentColor']);
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
    colorPalette: 'Brand-appropriate colors from the request or uploaded logo',
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
    logoRendering: 'integrated',
    textColor: '#ffffff',
    accentColor: '#333333',
    copy: { ...EMPTY_COPY },
  };
}

function requestId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function fileToDataUrl(file: Blob) {
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('That image could not be read.'));
    reader.readAsDataURL(file);
  });
}

async function readImage(file: File, maxBytes: number, maxDimension: number, preserveTransparency = false) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
    const megabytes = maxBytes / 1024 / 1024;
    throw new Error(`Choose a PNG, JPEG, or WebP image. It will be optimized automatically to the ${Number.isInteger(megabytes) ? megabytes : megabytes.toFixed(2)}MB request limit.`);
  }
  if (file.size <= maxBytes) return fileToDataUrl(file);

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('That image could not be decoded.'));
      element.src = objectUrl;
    });
    let edgeLimit = maxDimension;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const scale = Math.min(1, edgeLimit / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
      const context = canvas.getContext('2d');
      if (!context) throw new Error('This browser could not prepare the image.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      const optimized = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, preserveTransparency ? 'image/png' : 'image/webp', Math.max(0.62, 0.9 - attempt * 0.06)));
      if (optimized && optimized.size <= maxBytes) return fileToDataUrl(optimized);
      edgeLimit = Math.max(640, Math.round(edgeLimit * 0.78));
    }
    throw new Error('That image could not be optimized safely. Choose a smaller source image.');
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function imageSrc(concept: AIConcept) {
  return `data:${concept.mimeType};base64,${concept.imageBase64}`;
}

function formatDuration(milliseconds: number) {
  if (!milliseconds) return '—';
  return `${(milliseconds / 1000).toFixed(1)}s`;
}

function waitFor(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      window.clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function runBackgroundJob(
  startPath: string,
  payload: Record<string, unknown>,
  signal: AbortSignal,
  waitingMessage: string,
  onStage: (message: string) => void,
  onPreview?: (source: string) => void,
) {
  const requestStartedAt = Date.now();
  const pendingKey = 'banners_ai_designer_pending_job';
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload)));
  const payloadFingerprint = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  let start: Record<string, unknown> | null = null;
  try {
    const pending = JSON.parse(window.sessionStorage.getItem(pendingKey) || 'null');
    if (
      pending?.startPath === startPath
      && pending?.payloadFingerprint === payloadFingerprint
      && Date.now() - Number(pending.createdAt || 0) < 2 * 60 * 60 * 1000
    ) start = pending;
  } catch {
    window.sessionStorage.removeItem(pendingKey);
  }

  if (!start?.jobRef) {
    const idempotencyKey = String(start?.idempotencyKey || requestId());
    // Persist request identity before sending: retrying a lost response must
    // not create a second paid generation.
    start = { startPath, payloadFingerprint, idempotencyKey, createdAt: Date.now(), dispatched: false };
    window.sessionStorage.setItem(pendingKey, JSON.stringify(start));
    const startResponse = await fetch(startPath, {
      method: 'POST',
      credentials: 'same-origin',
      signal,
      headers: authorizedHeaders({
        'Content-Type': 'application/json',
        'X-Idempotency-Key': idempotencyKey,
      }),
      body: authenticatedJsonBody({ ...payload, idempotencyKey }),
    });
    const started = await startResponse.json().catch(() => ({}));
    if (!startResponse.ok || !started?.jobRef) throw new Error(started?.message || 'The AI job could not be started safely.');
    start = { ...started, startPath, payloadFingerprint, idempotencyKey, createdAt: Date.now(), dispatched: false };
    window.sessionStorage.setItem(pendingKey, JSON.stringify(start));
  }

  onStage(waitingMessage);
  if (start.dispatched !== true) {
    const workerResponse = await fetch(String(start.workerPath || '/.netlify/functions/ai-designer-worker-background'), {
      method: 'POST',
      credentials: 'same-origin',
      signal,
      headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
      body: authenticatedJsonBody({ jobRef: start.jobRef }),
    });
    if (!workerResponse.ok) throw new Error('The secure AI worker could not be started. Please retry.');
    start.dispatched = true;
    window.sessionStorage.setItem(pendingKey, JSON.stringify(start));
  }

  const deadline = Date.now() + 7 * 60 * 1000;
  let previewVersion = "";
  const pollPath = String(start.pollPath || '/.netlify/functions/ai-designer-job');
  while (Date.now() < deadline) {
    await waitFor(Math.max(1000, Number(start.pollAfterMs) || 2000), signal);
    const pollResponse = await fetch(pollPath, {
      method: 'POST',
      credentials: 'same-origin',
      signal,
      headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
      body: authenticatedJsonBody({ jobRef: start.jobRef, previewVersion }),
    });
    const job = await pollResponse.json().catch(() => ({}));
    if (!pollResponse.ok) throw new Error(job?.message || 'The AI job status could not be checked.');
    if (job?.preview?.mimeType === 'image/jpeg' && job.preview.imageBase64) {
      previewVersion = job.previewVersion;
      onPreview?.(`data:image/jpeg;base64,${job.preview.imageBase64}`);
    }
    if (job?.status === 'completed') {
      window.sessionStorage.removeItem(pendingKey);
      for (const concept of [...(job.concepts || []), ...(job.concept ? [job.concept] : [])]) {
        concept.diagnostics = { ...concept.diagnostics, clientDurationMs: Date.now() - requestStartedAt };
      }
      return job;
    }
    if (job?.status === 'failed') {
      window.sessionStorage.removeItem(pendingKey);
      const stage = job?.stage ? ` Stage: ${String(job.stage)}.` : '';
      const category = job?.error ? ` Category: ${String(job.error)}.` : '';
      const reference = job?.diagnosticId ? ` Reference: ${job.diagnosticId}.` : '';
      throw new Error(`${job?.message || 'The AI job could not be completed safely.'}${stage}${category}${reference}`);
    }
    onStage(job?.stage === 'Preparing the AI request' ? waitingMessage : (job?.stage || waitingMessage));
  }
  throw new Error('The AI job took too long to finish. Your draft is saved. Retry the same request to check its existing result.');
}

function StatusBadge({ concept }: { concept: AIConcept }) {
  if (concept.validation.passed) {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-bold text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Print ready</span>;
  }
  return <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-800"><AlertCircle className="h-3.5 w-3.5" /> Needs correction</span>;
}

export default function AIWorkspace(props: Props) {
  const { user } = useAuth();
  const access = useAIAdminAccess(true);
  const [brief, setBrief] = useState<CreativeBrief>(() => props.initialSession?.brief || makeBrief(props));
  const [referenceImage, setReferenceImage] = useState<string | null>(props.initialSession?.referenceImage || null);
  const [photoImages, setPhotoImages] = useState<string[]>(props.initialSession?.photoImages || []);
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
  const [pendingLogoRemoved, setPendingLogoRemoved] = useState(false);
  const [pendingLogoOnly, setPendingLogoOnly] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const [editInstruction, setEditInstruction] = useState('');
  const [promptBeforeImprovement, setPromptBeforeImprovement] = useState<CreativeBrief | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [improvingPrompt, setImprovingPrompt] = useState(false);
  const [confirmNewDesign, setConfirmNewDesign] = useState(false);
  const [progressPreview, setProgressPreview] = useState<string | null>(null);
  useEffect(() => { if (!stage) setProgressPreview(null); }, [stage]);
  const [error, setError] = useState('');
  const [fullPreview, setFullPreview] = useState(false);
  const [adminPassword, setAdminPassword] = useState('');
  const [reconnecting, setReconnecting] = useState(false);
  const [reconnectError, setReconnectError] = useState('');
  const controllerRef = useRef<AbortController | null>(null);
  const restoringDraftRef = useRef(false);

  const selected = concepts.find((concept) => concept.id === selectedId) || concepts[0] || null;
  const ratio = (Number(brief.widthIn) || 1) / (Number(brief.heightIn) || 1);
  const requirementsMet = brief.widthIn > 0 && brief.heightIn > 0 && Boolean(brief.material) && Boolean(brief.description.trim());
  const draftKey = `admin:${user?.id || 'session'}:${props.productType}:${props.widthIn}:${props.heightIn}`;
  const hasUnappliedChanges = Boolean(selected && (
    (selected.brief && JSON.stringify(selected.brief) !== JSON.stringify(brief)) ||
    ('logoImage' in selected && selected.logoImage !== logoImage) ||
    ('photoImages' in selected && JSON.stringify(selected.photoImages || []) !== JSON.stringify(photoImages))
  ));

  useEffect(() => {
    let active = true;
    if (!user?.id || !user.is_admin) return;
    if (props.initialSession) { setRecoveryReady(true); return; }
    loadDraft<{ brief: CreativeBrief; concepts: AIConcept[]; selectedId: string; history: AIConcept[]; redo: AIConcept[]; logoImage: string | null; referenceImage: string | null; photoImages?: string[] }>(draftKey).then(draft => {
      if (!active || !draft) return;
      restoringDraftRef.current = draft.concepts.length > 0;
      setBrief(draft.brief); setBriefReviewed(draft.brief.structured);
      setConcepts(draft.concepts); setSelectedId(draft.selectedId);
      setHistory(draft.history); setRedo(draft.redo);
      setLogoImage(draft.logoImage); setReferenceImage(draft.referenceImage); setPhotoImages(draft.photoImages || []);
      setSaveNotice('Your previous draft has been restored.');
    }).catch(() => { if (active) setSaveNotice('Draft recovery is unavailable in this browser. Keep this window open while designing.'); })
      .finally(() => { if (active) setRecoveryReady(true); });
    return () => { active = false; };
  }, [draftKey, props.initialSession, user?.id, user?.is_admin]);

  useEffect(() => {
    if (!recoveryReady || !user?.id || !user.is_admin) return;
    const timer = window.setTimeout(() => {
      saveDraft(draftKey, { brief, concepts, selectedId, history, redo, logoImage, referenceImage, photoImages })
        .catch(() => setSaveNotice('This browser could not save your draft. Keep this window open while designing.'));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [recoveryReady, draftKey, brief, concepts, selectedId, history, redo, logoImage, referenceImage, photoImages, user?.id, user?.is_admin]);

  useEffect(() => {
    if (restoringDraftRef.current) { restoringDraftRef.current = false; return; }
    if (selected?.brief) setBrief(selected.brief);
    if (selected && 'photoImages' in selected) setPhotoImages(selected.photoImages || []);
    if (selected && 'logoImage' in selected) setLogoImage(selected.logoImage || null);
    if (selected && 'referenceImage' in selected) setReferenceImage(selected.referenceImage || null);
  }, [selected]);

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
    setBrief((current) => ({ ...current, [key]: value, ...(DIRECTION_FIELDS.has(key) ? { directionOverrides: { ...current.directionOverrides, [key]: value } } : {}), ...(key === 'description' ? { copy: { ...EMPTY_COPY, ...current.copyOverrides } } : {}), structured: false }));
    setBriefReviewed(false);
  };

  const updateCopy = (key: keyof ExactCopy, value: string) => {
    setBrief((current) => ({ ...current, structured: false, copy: { ...current.copy, [key]: value }, copyOverrides: { ...current.copyOverrides, [key]: value } }));
    setBriefReviewed(false);
  };

  const setImage = async (kind: 'reference' | 'logo', file?: File) => {
    if (!file) return;
    setError('');
    try {
      // Keep the combined JSON request below Netlify's fixed buffered payload
      // limit after Base64 expansion.
      const data = await readImage(file, kind === 'logo' ? 768 * 1024 : 1536 * 1024, kind === 'logo' ? 2400 : 2048, kind === 'logo');
      if (kind === 'logo') setLogoImage(data);
      else setReferenceImage(data);
      setBriefReviewed(false);
      setPendingEdit(null);
      setPendingBrief(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The image could not be added.');
    }
  };

  const removeImage = (kind: 'reference' | 'logo') => {
    if (kind === 'logo' && selected?.logoImage) {
      void edit(true, true, true);
      return;
    }
    if (kind === 'logo') setLogoImage(null);
    else setReferenceImage(null);
    setBriefReviewed(false);
    setPendingEdit(null);
    setPendingBrief(null);
  };

  const reviewBrief = async () => {
    if (!requirementsMet) {
      setError('Select dimensions and material, then describe the design you want.');
      return;
    }
    if (!access.ready || stage || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setError('');
    setStage('Organizing your wording');
    try {
      const body = await runBackgroundJob(
        '/.netlify/functions/ai-designer-brief',
        { brief: { ...brief, logoRendering: brief.logoRendering || 'integrated' }, logoImage },
        controller.signal,
        'Organizing your wording',
        setStage,
        setProgressPreview,
      );
      if (!body?.brief?.structured) throw new Error('The production brief could not be interpreted safely.');
      setBrief((current) => ({
        ...current,
        ...body.brief,
        structured: true,
        copy: body.brief.copy || current.copy,
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

  const improvePrompt = async () => {
    if (!access.ready || !requirementsMet || stage || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    const original = brief;
    setError('');
    setImprovingPrompt(true);
    setStage('Improving your prompt');
    try {
      const body = await runBackgroundJob('/.netlify/functions/ai-designer-brief', { brief: { ...original, logoRendering: original.logoRendering || 'integrated' }, logoImage, improvePrompt: true }, controller.signal, 'Polishing your prompt while keeping your wording and details', setStage);
      if (!body.improvedPrompt) throw new Error('Your prompt could not be improved. Your original is unchanged.');
      setPromptBeforeImprovement(original);
      setBrief({ ...body.brief, logoPosition: original.logoPosition, description: body.improvedPrompt, structured: true });
      setBriefReviewed(true);
      setSaveNotice('Prompt updated. Review it or undo below.');
    } catch (reason) {
      if ((reason as Error)?.name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'Your original prompt is unchanged.');
    } finally { controllerRef.current = null; setStage(null); setImprovingPrompt(false); }
  };

  const generate = async () => {
    if (!access.ready || !recoveryReady || !requirementsMet || stage || controllerRef.current) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setError('');
    setProgressPreview(null);
    setStage('Planning your design');
    trackAIEvent('ai_prompt_entered', { product_type: brief.productType });
    trackAIEvent('ai_generation_started', { concept_count: conceptCount, product_type: brief.productType });
    try {
      // Plan and generate in one worker, so customers do not wait for a second
      // round of queue creation, worker startup and result polling.
      const readyBrief = { ...brief, logoRendering: brief.logoRendering || 'integrated' as const, structured: briefReviewed && brief.structured && brief.directionOverrides !== undefined && (!logoImage || Array.isArray(brief.logoWording)) };
      setStage('Creating your banner');
      const body = await runBackgroundJob(
        '/.netlify/functions/ai-designer-generate',
        { brief: readyBrief, conceptCount, referenceImage, logoImage, photoImages },
        controller.signal,
        'Creating your artwork. Your preview will appear as soon as it is ready.',
        setStage,
        setProgressPreview,
      );
      const nextConcepts = Array.isArray(body.concepts) ? body.concepts.map((concept: AIConcept) => ({ ...concept, logoImage, referenceImage, photoImages })) : [];
      if (!nextConcepts.length) throw new Error('No artwork was returned.');
      setBrief(nextConcepts[0].brief || body.brief || readyBrief);
      setBriefReviewed(true);
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

  const edit = async (manual = false, logoOnly = false, removeLogo = false) => {
    if (!selected || (!manual && !editInstruction.trim()) || stage || controllerRef.current || !access.ready) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setError('');
    setProgressPreview(null);
    setStage(removeLogo ? 'Removing your uploaded logo' : logoOnly ? 'Updating your logo' : 'Refining your design');
    trackAIEvent('ai_edit_started', { concept_id: selected.id });
    try {
      const integratedLogo = selected.brief?.logoRendering === 'integrated';
      const normalizedInstruction = editInstruction.toLowerCase();
      const requestedLogoPosition: CreativeBrief['logoPosition'] | null = manual || !logoImage || integratedLogo ? null
        : /logo.{0,24}(upper|top)[ -]?left|(?:upper|top)[ -]?left.{0,24}logo/.test(normalizedInstruction) ? 'upper-left'
          : /logo.{0,24}(upper|top)[ -]?right|(?:upper|top)[ -]?right.{0,24}logo/.test(normalizedInstruction) ? 'upper-right'
            : /logo.{0,24}(lower|bottom)[ -]?left|(?:lower|bottom)[ -]?left.{0,24}logo/.test(normalizedInstruction) ? 'lower-left'
              : /logo.{0,24}(lower|bottom)[ -]?right|(?:lower|bottom)[ -]?right.{0,24}logo/.test(normalizedInstruction) ? 'lower-right'
                : null;
      const briefForEdit = removeLogo && selected.brief ? selected.brief : { ...(logoOnly && selected.brief ? { ...selected.brief, logoPosition: brief.logoPosition, layers: { ...selected.brief.layers, logo: brief.layers?.logo } } : brief), ...(requestedLogoPosition ? { logoPosition: requestedLogoPosition } : {}), typographyMode: manual ? brief.typographyMode : 'ai' as const };
      const editPhotos = removeLogo ? selected.photoImages || [] : photoImages;
      const body = await runBackgroundJob(
        '/.netlify/functions/ai-designer-edit',
        {
          brief: { ...briefForEdit, logoRendering: selected.brief?.logoRendering || 'original', logoWording: selected.brief?.logoWording, structured: true },
          editMode: removeLogo ? 'remove-logo' : logoOnly ? 'logo' : manual ? 'layers' : 'ai',
          conceptId: selected.id,
          generationId: selected.generationId,
          currentBackgroundRef: selected.backgroundRef,
          previousCopy: selected.brief?.copy,
          previousValidation: selected.validation,
          editInstruction: removeLogo ? 'Remove the uploaded logo.' : manual ? 'Apply the updated wording and element settings to this design.' : editInstruction.trim(),
          referenceImage,
          logoImage,
          photoImages: editPhotos,
        },
        controller.signal,
        removeLogo ? integratedLogo ? 'Removing the logo from your design' : 'Removing only your uploaded logo and preserving the artwork underneath' : logoOnly ? 'Placing your original logo and checking the result' : 'Applying your changes to the existing artwork.',
        setStage,
        setProgressPreview,
      );
      if (!body?.usedOriginalImage || !body?.concept) throw new Error('The server did not confirm use of the current artwork.');
      setPendingEdit({ ...body.concept, logoImage: body.logoRemoved ? null : logoImage, referenceImage, photoImages: editPhotos.filter((_, index) => !body.removedPhotos?.includes(index)) });
      setPendingBrief(body.brief || briefForEdit);
      setPendingLogoRemoved(body.logoRemoved === true);
      setPendingLogoOnly(body.backgroundUnchanged === true && (logoOnly || body.logoRemoved === true));
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
    if (pendingLogoRemoved) setLogoImage(null);
    setPendingLogoRemoved(false);
    setPendingLogoOnly(false);
    setPendingEdit(null);
    setPendingBrief(null);
    setEditInstruction('');
    trackAIEvent('ai_edit_succeeded', { validation_passed: pendingEdit.validation.passed });
  };

  const rejectPendingEdit = () => {
    if (!pendingEdit) return;
    if (selected?.brief) setBrief(selected.brief);
    if (selected && 'logoImage' in selected) setLogoImage(selected.logoImage || null);
    if (selected && 'photoImages' in selected) setPhotoImages(selected.photoImages || []);
    if (selected && 'referenceImage' in selected) setReferenceImage(selected.referenceImage || null);
    setPendingLogoRemoved(false);
    setPendingLogoOnly(false);
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

  const startNewDesign = async () => {
    if (stage || controllerRef.current) return;
    const fresh = makeBrief(props);
    const emptyDraft = { brief: fresh, concepts: [], selectedId: '', history: [], redo: [], logoImage: null, referenceImage: null, photoImages: [] };
    restoringDraftRef.current = false;
    setBrief(fresh); setBriefReviewed(false); setConcepts([]); setSelectedId('');
    setGenerationId(''); setHistory([]); setRedo([]);
    setLogoImage(null); setReferenceImage(null); setPhotoImages([]);
    setPendingEdit(null); setPendingBrief(null); setPendingLogoRemoved(false);
    setEditInstruction(''); setPromptBeforeImprovement(null); setProgressPreview(null);
    setFullPreview(false); setError(''); setConfirmNewDesign(false);
    setSaveNotice('Fresh start. Describe your new banner.');
    try { await saveDraft(draftKey, emptyDraft); }
    catch { setSaveNotice('The new draft could not be saved. Keep this window open.'); }
  };

  const removeConcept = (conceptId: string) => {
    const next = concepts.filter((concept) => concept.id !== conceptId);
    setConcepts(next);
    if (selectedId === conceptId) setSelectedId(next[0]?.id || '');
  };

  const apply = async () => {
    if (!selected?.validation.passed || hasUnappliedChanges) return;
    setError('');
    setStage('Preparing your artwork for the banner designer');
    const session: AIDesignSession = {
      generationId: selected.generationId || generationId,
      brief,
      selectedConcept: selected,
      referenceImage,
      logoImage,
      versionHistory: history,
      photoImages,
    };
    trackAIEvent('ai_design_approved', { concept_id: selected.id, version_id: selected.versionId });
    try {
    let imageBase64 = selected.imageBase64;
    if (selected.artworkRef) {
      const response = await fetch('/.netlify/functions/ai-designer-export', {
        method: 'POST', credentials: 'same-origin',
        headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
        body: authenticatedJsonBody({ artworkRef: selected.artworkRef }),
      });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error('The production artwork could not be retrieved. Your preview is still available.');
      const file = await fetch(result.url);
      if (!file.ok) throw new Error('The production artwork download failed. Please try again.');
      imageBase64 = (await fileToDataUrl(await file.blob())).split(',')[1];
    }
    await props.onGenerated({
      imageBase64,
      mimeType: selected.mimeType,
      width: brief.widthIn,
      height: brief.heightIn,
      fileName: `ai-${brief.productType}-${brief.widthIn}x${brief.heightIn}-${selected.versionId}.jpg`,
      prompt: brief.description,
      session,
    });
    trackAIEvent('ai_applied_to_configurator', { product_type: brief.productType });
    props.onClose?.();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'The artwork could not be transferred. Your design is still saved here.'); }
    finally { setStage(null); }
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
            : !access.validationModelAvailable
              ? 'The configured validation model is not available to the OpenAI project.'
            : null;

  return (
    <div className="min-h-0 bg-white text-slate-900" data-testid="ai-workspace">
      <div className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.16em] text-orange-600"><WandSparkles className="h-4 w-4" /> Banners On The Fly</div>
            <h2 className="mt-1 text-2xl font-black tracking-tight text-[#0b1f3a] sm:text-3xl">Your banner studio</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-600">One idea. A banner made for you.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${access.ready ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
              {access.loading ? <Loader2 className="h-4 w-4 animate-spin" /> : access.ready ? <ShieldCheck className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {access.ready ? 'Admin preview' : 'Configuration check'}
            </span>
            {props.onClose && <button type="button" onClick={props.onClose} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /> Back</button>}
          </div>
        </div>
        {blockerCopy && !access.loading && <div role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {blockerCopy}</div>{!access.authorized && <div className="mt-3 flex flex-col gap-2 sm:flex-row"><input aria-label="Admin password" type="password" autoComplete="current-password" value={adminPassword} onChange={(event) => setAdminPassword(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void reconnectAdmin(); }} placeholder="Enter admin password" className="min-h-11 flex-1 rounded-lg border border-amber-300 bg-white px-3 text-base text-slate-900" /><button type="button" onClick={() => void reconnectAdmin()} disabled={!adminPassword || reconnecting} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-[#0b1f3a] px-4 font-bold text-white disabled:opacity-50">{reconnecting && <Loader2 className="h-4 w-4 animate-spin" />} Reconnect admin</button></div>}{reconnectError && <div className="mt-2 text-sm font-semibold text-red-700">{reconnectError}</div>}</div>}
      </div>

      {saveNotice && <p className="px-4 pt-3 text-xs text-slate-500" role="status">{saveNotice}</p>}
      <div className="grid min-h-0 grid-cols-1 lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
        <section className="space-y-5 border-b border-slate-200 bg-white p-4 sm:p-6 lg:border-b-0 lg:border-r">
          <div>
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-black text-[#0b1f3a]">Describe your banner</h3>
              <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{brief.widthIn}&quot; × {brief.heightIn}&quot; · {props.materialLabel || brief.material}</span>
            </div>
            <label htmlFor="ai-description" className="mt-4 block text-sm font-bold text-slate-800">Describe the design you want</label>
            <textarea id="ai-description" value={brief.description} disabled={Boolean(stage)} onChange={(event) => updateBrief('description', event.target.value.slice(0, 1200))} rows={5} className="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-base shadow-sm outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-200" placeholder="Example: A polished grand-opening design for a family restaurant, with warm food photography, strong contrast, and space for a headline and offer." />
            <div className="mt-1 flex flex-wrap items-center gap-x-4">
              <button type="button" onClick={() => void improvePrompt()} disabled={!access.ready || !recoveryReady || !requirementsMet || Boolean(stage)} className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0b1f3a] hover:text-orange-600 disabled:opacity-40">{improvingPrompt ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <WandSparkles className="h-4 w-4" />} {improvingPrompt ? 'Improving your prompt…' : 'Improve prompt with AI'}</button>
              {improvingPrompt && <p role="status" className="text-xs text-slate-600">Rewriting your text. Your artwork stays unchanged. <button type="button" onClick={() => controllerRef.current?.abort()} className="min-h-11 underline">Cancel</button></p>}
              {promptBeforeImprovement && <button type="button" disabled={Boolean(stage)} onClick={() => { setBrief(promptBeforeImprovement); setBriefReviewed(promptBeforeImprovement.structured); setPromptBeforeImprovement(null); setSaveNotice('Original prompt restored.'); }} className="min-h-11 text-xs text-slate-500 underline underline-offset-4">Undo prompt update</button>}
            </div>
            <details className="mt-3"><summary className="cursor-pointer py-2 text-sm font-semibold text-slate-600">Style & layout (optional)</summary>
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
            </details>
          </div>

          <details>
            <summary className="cursor-pointer py-2 text-sm font-semibold text-slate-600">Exact wording & colors (optional)</summary>
            <p className="mt-1 text-sm text-slate-600">We extract wording from your description automatically. Use these fields if you want to supply specific wording.</p>
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
          </details>

          <div>
            <details><summary className="cursor-pointer py-2 text-sm font-semibold text-slate-600">Logo & photos (optional)</summary>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-3 text-center hover:border-orange-400"><ImagePlus className="h-5 w-5 text-orange-600" /><span className="mt-1 text-sm font-bold">Reference image</span><span className="text-xs text-slate-500">Photo, artwork or style reference</span><input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImage('reference', event.target.files?.[0])} /></label>
              <label className="flex min-h-28 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-white p-3 text-center hover:border-orange-400"><ImagePlus className="h-5 w-5 text-orange-600" /><span className="mt-1 text-sm font-bold">Logo</span><span className="text-xs text-slate-500">Use your logo and brand colors</span><input type="file" className="sr-only" accept="image/png,image/jpeg,image/webp" onChange={(event) => setImage('logo', event.target.files?.[0])} /></label>
            </div>
            <label className="mt-3 block rounded-xl border border-dashed border-slate-300 bg-white p-3 text-sm font-semibold">Add photos to the banner (up to 3)<input type="file" multiple accept="image/png,image/jpeg,image/webp" className="mt-2 block w-full text-sm" disabled={Boolean(stage)} onChange={async event => {
              const files = Array.from(event.target.files || []);
              if (files.length + photoImages.length > 3) { setError('Choose up to three photos.'); return; }
              try { const images = await Promise.all(files.map(file => readImage(file, 256 * 1024, 1600))); setPhotoImages(current => [...current, ...images]); }
              catch (reason) { setError(reason instanceof Error ? reason.message : 'The photos could not be added.'); }
              event.target.value = '';
            }} /></label>
            </details>
            {photoImages.length > 0 && <div className="mt-2 flex flex-wrap gap-2">{photoImages.map((src, index) => <div key={index} className="w-24"><img src={src} alt={`Uploaded photo ${index + 1}`} className="h-16 w-24 rounded object-contain" /><button type="button" className="min-h-11 text-xs underline" onClick={() => setPhotoImages(current => current.filter((_, item) => item !== index))}>Remove photo {index + 1}</button></div>)}</div>}
            {(referenceImage || logoImage) && <div className="mt-3 grid grid-cols-2 gap-3">{[['Reference', referenceImage], ['Logo included on banner', logoImage]].map(([label, src]) => src && <figure key={label} className="min-w-0 rounded-lg border border-slate-200 bg-white p-2"><img src={src} alt={label || 'Attached image'} className="h-20 w-full object-contain" /><figcaption className="mt-1 text-xs text-slate-500">{label}</figcaption></figure>)}</div>}
            {(referenceImage || logoImage) && <div className="mt-2 flex flex-wrap items-center gap-2">{referenceImage && <button type="button" onClick={() => removeImage('reference')} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold">Remove reference</button>}{logoImage && <><label className="text-sm font-semibold text-slate-700">Logo treatment<select aria-label="Logo treatment" value={brief.logoRendering || 'integrated'} onChange={event => updateBrief('logoRendering', event.target.value as CreativeBrief['logoRendering'])} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"><option value="integrated">Blend into design</option><option value="original">Keep original logo</option></select></label>{brief.logoRendering === 'original' && <label className="text-sm font-semibold text-slate-700">Logo position<select value={brief.logoPosition} onChange={(event) => updateBrief('logoPosition', event.target.value as CreativeBrief['logoPosition'])} className="ml-2 min-h-11 rounded-lg border border-slate-300 bg-white px-3"><option value="upper-left">Upper left</option><option value="upper-right">Upper right</option><option value="lower-left">Lower left</option><option value="lower-right">Lower right</option></select></label>}<p className="w-full text-xs text-slate-500">{brief.logoRendering !== 'original' ? 'AI recreates your logo as part of the artwork. Check its lettering and details before ordering. Your original file stays saved.' : 'Places your original logo unchanged, including its background.'}{selected && ' Treatment applies to your next new design.'}</p><button type="button" onClick={() => removeImage('logo')} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold">Remove uploaded logo</button></>}</div>}
          </div>

          <button type="button" onClick={() => void generate()} disabled={!access.ready || !recoveryReady || !requirementsMet || Boolean(stage)} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-base font-bold text-white hover:bg-orange-700 disabled:opacity-50"><Sparkles className="h-5 w-5" />{concepts.length ? 'Create another design' : 'Create my banner'}</button>
          <details className="text-sm text-slate-600"><summary className="cursor-pointer py-2">Review wording before creating (optional)</summary><button type="button" onClick={() => void reviewBrief()} disabled={!requirementsMet || !access.ready || Boolean(stage)} className="min-h-11 underline">Extract wording from my description</button></details>
        </section>

        <section className="min-w-0 space-y-5 bg-slate-50 p-4 sm:p-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div><h3 className="text-lg font-black text-[#0b1f3a]">Your banner</h3><p className="text-sm text-slate-600">Preview your banner, make changes, then use it in your order.</p></div>
            <button type="button" onClick={() => setConfirmNewDesign(true)} disabled={Boolean(stage) || !recoveryReady} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-40"><Trash2 className="h-4 w-4" /> Delete &amp; start new</button>

          </div>

          {confirmNewDesign && <div className="rounded-xl border border-slate-300 bg-white p-4">
            <p className="font-semibold text-[#0b1f3a]">Start with a blank design?</p>
            <p className="mt-1 text-sm text-slate-600">This clears this draft’s artwork, prompt, uploads and edit history. Your banner size stays the same.</p>
            <div className="mt-3 flex flex-wrap gap-2"><button type="button" onClick={() => void startNewDesign()} disabled={Boolean(stage)} className="min-h-11 rounded-lg bg-[#0b1f3a] px-4 text-sm font-bold text-white disabled:opacity-40">Delete draft &amp; start new</button><button type="button" onClick={() => setConfirmNewDesign(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold">Keep this design</button></div>
          </div>}
          {stage && !improvingPrompt && <div role="status" aria-live="polite" className="flex min-h-52 flex-col items-center justify-center rounded-xl bg-[#0b1f3a] px-6 py-8 text-center text-white">
            {progressPreview && <img src={progressPreview} alt="New artwork — print checks in progress" className="mb-5 max-h-[420px] w-full rounded-lg object-contain" />}
            <Loader2 className="h-7 w-7 animate-spin text-orange-400 motion-reduce:animate-none" />
            <h4 className="mt-4 text-xl font-semibold tracking-tight">{progressPreview ? 'Your first look' : selected ? 'Making your changes' : 'Bringing your idea to life'}</h4>
            <p className="mt-2 max-w-md text-sm leading-relaxed text-slate-300">{stage}</p>
            <button type="button" onClick={() => controllerRef.current?.abort()} className="mt-4 min-h-11 px-3 text-xs text-slate-300 underline underline-offset-4" title="Your draft stays saved. This stops waiting here; the current job may still finish.">Stop waiting</button>
          </div>}
          {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><XCircle className="mt-0.5 h-5 w-5 shrink-0" /><span>{error}</span></div>}

          {!concepts.length && !stage && <div className="grid min-h-[420px] place-items-center rounded-xl bg-white p-8 text-center"><div><Sparkles className="mx-auto h-9 w-9 text-orange-500" /><h4 className="mt-3 text-lg font-black text-[#0b1f3a]">A little imagination. A big impression.</h4><p className="mt-1 max-w-md text-sm text-slate-600">Tell us what your banner should say and look like, then choose Create my banner.</p></div></div>}

          {concepts.length > 1 && <div className="flex gap-3 overflow-x-auto pb-2">{concepts.map((concept, index) => (
            <article key={concept.versionId} className={`w-40 shrink-0 rounded-lg border bg-white p-2 transition ${selected?.versionId === concept.versionId ? 'border-[#0b1f3a] ring-1 ring-[#0b1f3a]' : 'border-slate-200 hover:border-slate-300'}`}>
              <button type="button" disabled={Boolean(pendingEdit)} onClick={() => { setSelectedId(concept.id); trackAIEvent('ai_concept_selected', { concept_index: index }); }} className="block w-full text-left disabled:cursor-not-allowed disabled:opacity-70" aria-pressed={selected?.versionId === concept.versionId}>
                <div className="flex h-20 w-full items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-slate-100"><img src={imageSrc(concept)} alt={`Complete AI concept ${index + 1}`} className="h-full w-full object-contain" /></div>
                <div className="mt-3 flex flex-wrap items-center justify-between gap-2"><div><div className="text-sm font-black text-[#0b1f3a]">Concept {index + 1}</div><div className="text-xs text-slate-500">{concept.widthIn}&quot; × {concept.heightIn}&quot; · {concept.aspectRatio.toFixed(4)}:1</div></div><StatusBadge concept={concept} /></div>
              </button>
              <div className="mt-3 flex gap-2"><button type="button" disabled={Boolean(pendingEdit)} onClick={() => setSelectedId(concept.id)} className="min-h-11 flex-1 rounded-lg bg-[#0b1f3a] px-3 text-sm font-bold text-white disabled:opacity-50">Select</button><button type="button" disabled={Boolean(pendingEdit)} onClick={() => removeConcept(concept.id)} aria-label={`Delete concept ${index + 1}`} className="min-h-11 min-w-11 rounded-lg border border-slate-300 text-slate-600 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"><Trash2 className="mx-auto h-4 w-4" /></button></div>
            </article>
          ))}</div>}

          {selected && <div className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-lg font-black text-[#0b1f3a]">Your design</h4><p className="text-sm text-slate-600">Tell us what to change. Keep the version you love.</p></div><div className="flex gap-2"><button type="button" onClick={undo} disabled={!history.length || Boolean(stage) || Boolean(pendingEdit)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-40"><Undo2 className="h-4 w-4" /> Undo</button><button type="button" onClick={redoEdit} disabled={!redo.length || Boolean(stage) || Boolean(pendingEdit)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-40"><Redo2 className="h-4 w-4" /> Redo</button><button type="button" onClick={() => setFullPreview(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold"><Maximize2 className="h-4 w-4" /> Full preview</button></div></div>
            <div className="mt-4 flex h-[min(55vh,36rem)] w-full items-center justify-center overflow-hidden rounded-xl border border-slate-300 bg-slate-100"><img src={imageSrc(selected)} alt="Complete selected flat print artwork" className="h-full w-full object-contain" /></div>

            {pendingEdit && <div className="mt-4 rounded-xl border-2 border-orange-300 bg-orange-50 p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><h5 className="font-black text-[#0b1f3a]">Review the proposed edit</h5><p className="mt-1 max-w-3xl text-sm text-slate-700">{pendingLogoOnly ? pendingLogoRemoved ? 'Only your uploaded logo was removed; the AI-created artwork underneath stayed unchanged.' : 'Only your original logo was resized or moved; the generated artwork was not changed.' : 'Image editing preserves unrelated details when technically possible, but cannot guarantee pixel-identical regions. Compare the complete canvases before accepting.'}</p></div><StatusBadge concept={pendingEdit} /></div><div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2"><figure><figcaption className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-600">Before</figcaption><div className="flex h-56 items-center justify-center overflow-hidden rounded-lg border border-slate-300 bg-slate-100"><img src={imageSrc(selected)} alt="Artwork before proposed edit" className="h-full w-full object-contain" /></div></figure><figure><figcaption className="mb-1 text-xs font-bold uppercase tracking-wide text-slate-600">Proposed edit</figcaption><div className="flex h-56 items-center justify-center overflow-hidden rounded-lg border border-orange-300 bg-slate-100"><img src={imageSrc(pendingEdit)} alt="Artwork after proposed edit" className="h-full w-full object-contain" /></div></figure></div><div className="mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={rejectPendingEdit} className="min-h-11 rounded-lg border border-slate-400 bg-white px-5 text-sm font-bold text-slate-800">Reject edit</button><button type="button" onClick={acceptPendingEdit} className="min-h-11 rounded-lg bg-orange-600 px-5 text-sm font-black text-white hover:bg-orange-700">Accept edit</button></div></div>}

            {logoImage && selected.brief?.logoRendering !== 'integrated' && <fieldset disabled={Boolean(stage || pendingEdit)} className="mt-4 rounded-xl border border-slate-200 bg-white p-4 disabled:opacity-50">
              <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="text-sm font-bold text-[#0b1f3a]">Your logo</h5><span className="text-xs text-slate-500">Original logo · no AI redraw</span></div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold">Logo size<input aria-label="Logo size" type="range" min="0.4" max="2" step="0.05" value={brief.layers?.logo?.scale || 1} onChange={event => setBrief(current => ({ ...current, layers: { ...current.layers, logo: { ...current.layers?.logo, scale: Number(event.target.value) } } }))} className="h-11 w-full" /></label>
                <label className="text-sm font-semibold">Place logo<select aria-label="Place logo" value={brief.logoPosition} onChange={event => setBrief(current => ({ ...current, logoPosition: event.target.value as CreativeBrief['logoPosition'], layers: { ...current.layers, logo: { scale: current.layers?.logo?.scale || 1 } } }))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"><option value="upper-left">Top left</option><option value="upper-right">Top right</option><option value="lower-left">Bottom left</option><option value="lower-right">Bottom right</option></select></label>
              </div>
              <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => void edit(true, true)} className="min-h-11 rounded-lg bg-[#0b1f3a] px-4 text-sm font-bold text-white">Apply logo changes</button><button type="button" onClick={() => removeImage('logo')} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700">Remove uploaded logo</button></div>
              <p className="mt-2 text-xs text-slate-500">Adjusts your logo without generating the artwork again. Review the placement before accepting.</p>
            </fieldset>}
            {logoImage && selected.brief?.logoRendering === 'integrated' && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600"><span>Logo blended into this design · use Edit with AI to adjust it</span><button type="button" disabled={Boolean(stage || pendingEdit)} onClick={() => removeImage('logo')} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-semibold disabled:opacity-40">Remove logo</button></div>}
            <LayerControls brief={brief} concept={selected} photoCount={photoImages.length} busy={Boolean(stage || pendingEdit)} onChange={setBrief} onApply={() => void edit(true)} />
            {hasUnappliedChanges && !stage && !pendingEdit && <button type="button" onClick={() => { if (selected.brief) setBrief(selected.brief); setLogoImage(selected.logoImage || null); setPhotoImages(selected.photoImages || []); setReferenceImage(selected.referenceImage || null); }} className="mt-2 min-h-11 text-xs text-slate-500 underline underline-offset-4">Discard unapplied changes</button>}
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
              <label className="text-sm font-bold text-slate-800">Edit with AI<textarea value={editInstruction} onChange={(event) => setEditInstruction(event.target.value.slice(0, 700))} rows={3} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-base" placeholder='Example: “Make the background lighter and keep everything else exactly the same.”' /></label>
              <button type="button" onClick={() => void edit()} disabled={!editInstruction.trim() || Boolean(stage) || !access.ready || Boolean(pendingEdit)} className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-[#0b1f3a] px-5 py-3 text-sm font-black text-white disabled:opacity-50"><WandSparkles className="h-4 w-4" /> Edit current design</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">{['Make the background lighter', 'Use the colors from my logo', ...(logoImage ? ['Move the logo to the upper-left'] : []), 'Remove the people', 'Make it more professional', 'Keep everything else exactly the same'].map((value) => <button key={value} type="button" onClick={() => setEditInstruction(value)} className="min-h-11 rounded-full border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:border-orange-400">{value}</button>)}</div>

            <details className="mt-5 border-t border-slate-200 pt-3"><summary className="cursor-pointer py-2 text-sm text-slate-500">Print checks & generation details</summary><div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className={`rounded-xl border p-4 ${selected.validation.passed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-center gap-2 font-black text-[#0b1f3a]">{selected.validation.passed ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-amber-700" />} Print-readiness validation</div><ul className="mt-2 space-y-1 text-sm text-slate-700"><li>Dimensions: {selected.validation.checks.dimensions.passed ? 'Exact' : 'Failed'}</li><li>Full edge coverage: {selected.validation.checks.edgeCoverage.passed ? 'Passed' : 'Failed'}</li><li>Flat artwork / no hardware: {selected.validation.checks.flatArtwork.passed ? 'Passed' : 'Failed'}</li><li>Wording check: {selected.validation.checks.exactText.passed ? 'Passed' : 'Failed'}</li><li>Output canvas resolution: {selected.validation.checks.resolution.effectivePpi} PPI ({selected.validation.checks.resolution.passed ? 'passed' : 'failed'})</li></ul>{selected.validation.reasons.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">{selected.validation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}</div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 font-black text-[#0b1f3a]"><Clock3 className="h-5 w-5 text-slate-500" /> Version and output</div><ul className="mt-2 space-y-1 text-sm text-slate-700"><li>Output: {selected.diagnostics.outputDimensions}px</li><li>Ratio method: {selected.diagnostics.ratioStrategy.replace(/-/g, ' ')}</li><li>Model: {selected.diagnostics.modelSnapshot || selected.diagnostics.model}</li><li>Artwork processing: {formatDuration(selected.diagnostics.durationMs)}</li>{selected.diagnostics.clientDurationMs != null && <li>Total wait: {formatDuration(selected.diagnostics.clientDurationMs)}</li>}<li>Estimated image API cost: {selected.diagnostics.estimatedCostUsd == null ? 'Unavailable' : `$${selected.diagnostics.estimatedCostUsd.toFixed(4)}`}</li><li>Auto-repaired: {selected.diagnostics.repaired ? 'Yes' : 'No'}</li></ul></div>
            </div>

            </details>

            {history.length > 0 && <div className="mt-4"><h5 className="text-sm font-black text-[#0b1f3a]">Version history</h5><div className="mt-2 flex gap-2 overflow-x-auto pb-2">{history.map((version, index) => <button key={version.versionId} type="button" onClick={() => { if (!selected) return; setRedo((items) => [...items, selected]); setConcepts((items) => items.map((item) => item.id === selected.id ? version : item)); }} className="w-32 shrink-0 rounded-lg border border-slate-300 bg-white p-2 text-left"><div className="flex h-20 items-center justify-center overflow-hidden bg-slate-100"><img src={imageSrc(version)} alt={`Version ${index + 1}`} className="h-full w-full object-contain" /></div><span className="mt-1 block text-xs font-semibold">Version {index + 1}</span></button>)}</div></div>}

            <details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-bold text-[#0b1f3a]">Admin diagnostics <ChevronDown className="h-4 w-4" /></summary><dl className="grid grid-cols-1 gap-x-4 gap-y-2 pt-3 text-xs text-slate-600 sm:grid-cols-2"><div><dt className="font-bold">Generation ID</dt><dd className="break-all">{selected.generationId || generationId}</dd></div><div><dt className="font-bold">Version ID</dt><dd className="break-all">{selected.versionId}</dd></div><div><dt className="font-bold">Provider request ID</dt><dd className="break-all">{selected.diagnostics.providerRequestId || 'Not returned'}</dd></div><div><dt className="font-bold">Validation model</dt><dd>{selected.validation.vision.model}</dd></div>{selected.diagnostics.stageTimings?.map((timing, index) => <div key={index}><dt className="font-bold">{timing.stage}</dt><dd>{formatDuration(timing.durationMs)}</dd></div>)}</dl></details>

            <button type="button" onClick={apply} disabled={!selected.validation.passed || hasUnappliedChanges || Boolean(stage) || Boolean(pendingEdit)} className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-base font-black text-white shadow-sm hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300"><CheckCircle2 className="h-5 w-5" /> {pendingEdit ? 'Accept or reject the proposed edit first' : hasUnappliedChanges ? 'Apply your changes before continuing' : selected.validation.passed ? 'Use this banner' : 'Correct the design before continuing'}</button>
          </div>}
        </section>
      </div>

      <Dialog open={fullPreview && Boolean(selected)} onOpenChange={setFullPreview}>
        <DialogContent className="z-[10020] w-[96vw] max-w-[96vw] border-0 bg-slate-950 p-4 pt-12 text-white [&>button]:text-white">
          <DialogTitle className="sr-only">Full artwork preview</DialogTitle>
          <DialogDescription className="sr-only">Complete banner artwork at the selected proportions.</DialogDescription>
          {selected && <img src={imageSrc(selected)} alt="Full-size flat print artwork" className="max-h-[82dvh] w-full object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}
