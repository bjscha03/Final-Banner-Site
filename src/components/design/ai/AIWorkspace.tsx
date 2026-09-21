import React, { useEffect, useRef, useState } from 'react';
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
import { authenticatedJsonBody, authorizedHeaders } from '@/lib/serverAuth';
import { useAIDesignerAccess } from '@/hooks/useAIAdminAccess';
import { trackAIEvent } from '@/lib/aiAnalytics';
import { useAuth } from '@/lib/auth';
import { loadDraft, saveDraft } from './draftStore';
import { collectVersions } from './versions';
import { fetchAIRequest } from './jobRequest';
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

  const resumingJob = Boolean(start?.jobRef);
  if (!start?.jobRef) {
    const idempotencyKey = String(start?.idempotencyKey || requestId());
    // Persist request identity before sending: retrying a lost response must
    // not create a second paid generation.
    start = { startPath, payloadFingerprint, idempotencyKey, createdAt: Date.now(), dispatched: false };
    window.sessionStorage.setItem(pendingKey, JSON.stringify(start));
    const startResponse = await fetchAIRequest(startPath, {
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
  // The worker ignores completed or actively claimed jobs. Redispatch the
  // same reference on an explicit retry so an abandoned claim can recover;
  // never enqueue a second paid job merely because polling was interrupted.
  if (start.dispatched !== true || resumingJob) {
    const workerResponse = await fetchAIRequest(String(start.workerPath || '/.netlify/functions/ai-designer-worker-background'), {
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
    const pollResponse = await fetchAIRequest(pollPath, {
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

export default function AIWorkspace(props: Props) {
  const { user } = useAuth();
  const access = useAIDesignerAccess(true);
  const [brief, setBrief] = useState<CreativeBrief>(() => props.initialSession?.brief || makeBrief(props));
  const [referenceImage, setReferenceImage] = useState<string | null>(props.initialSession?.referenceImage || null);
  const [photoImages, setPhotoImages] = useState<string[]>(props.initialSession?.photoImages || []);
  const [logoImage, setLogoImage] = useState<string | null>(props.initialSession?.logoImage || null);
  const [briefReviewed, setBriefReviewed] = useState(Boolean(props.initialSession));
  const conceptCount = 1;
  const [concepts, setConcepts] = useState<AIConcept[]>(() => props.initialSession ? collectVersions(props.initialSession.versionHistory, [props.initialSession.selectedConcept]) : []);
  const [generationId, setGenerationId] = useState(props.initialSession?.generationId || '');
  // Track the exact artwork version, not only its concept family. Edits retain
  // the concept id, so selecting by id can resolve back to the pre-edit image.
  const [selectedId, setSelectedId] = useState(props.initialSession?.selectedConcept.versionId || props.initialSession?.selectedConcept.id || '');
  const [history, setHistory] = useState<AIConcept[]>([]);
  const [redo, setRedo] = useState<AIConcept[]>([]);
  const [recoveryReady, setRecoveryReady] = useState(false);
  const [saveNotice, setSaveNotice] = useState('');
  const [editInstruction, setEditInstruction] = useState('');
  const [promptBeforeImprovement, setPromptBeforeImprovement] = useState<CreativeBrief | null>(null);
  const [stage, setStage] = useState<string | null>(null);
  const [activeImageJob, setActiveImageJob] = useState(false);
  const [improvingPrompt, setImprovingPrompt] = useState(false);
  const [confirmNewDesign, setConfirmNewDesign] = useState(false);
  const [confirmValidationOverride, setConfirmValidationOverride] = useState(false);
  const [progressPreview, setProgressPreview] = useState<string | null>(null);
  useEffect(() => { if (!stage) setProgressPreview(null); }, [stage]);
  const [error, setError] = useState('');
  const [fullPreview, setFullPreview] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const restoringDraftRef = useRef(false);
  const previewRef = useRef<HTMLDivElement | null>(null);
  const [revealResult, setRevealResult] = useState(0);
  const latestDraftRef = useRef<{ key: string; value: unknown } | null>(null);

  // The id fallback keeps drafts saved by older builds recoverable.
  const selected = concepts.find((concept) => concept.versionId === selectedId)
    || concepts.find((concept) => concept.id === selectedId)
    || concepts[0]
    || null;
  const ratio = (Number(brief.widthIn) || 1) / (Number(brief.heightIn) || 1);
  const requirementsMet = brief.widthIn > 0 && brief.heightIn > 0 && Boolean(brief.material) && Boolean(brief.description.trim());
  const draftKey = `${user?.is_admin && user.id ? `admin:${user.id}` : `customer:${access.sessionKey || 'pending'}`}:${props.productType}:${props.widthIn}:${props.heightIn}`;
  const hasUnappliedChanges = Boolean(selected && (
    (selected.brief && JSON.stringify(selected.brief) !== JSON.stringify(brief)) ||
    ('logoImage' in selected && selected.logoImage !== logoImage) ||
    ('photoImages' in selected && JSON.stringify(selected.photoImages || []) !== JSON.stringify(photoImages))
  ));

  useEffect(() => {
    let active = true;
    if (!access.authorized || !access.sessionKey) return;
    loadDraft<{ versionGallery?: boolean; editInstruction?: string; brief: CreativeBrief; concepts: AIConcept[]; selectedId: string; history: AIConcept[]; redo: AIConcept[]; logoImage: string | null; referenceImage: string | null; photoImages?: string[] }>(draftKey).then(draft => {
      if (!active || !draft) return;
      // Reopening Edit with AI must recover newer work from this same artwork,
      // but never replace a different banner with an unrelated saved draft.
      if (props.initialSession && !draft.concepts.some(item => item.versionId === props.initialSession!.selectedConcept.versionId)) return;
      restoringDraftRef.current = draft.concepts.length > 0;
      setBrief(draft.brief); setBriefReviewed(draft.brief.structured);
      setConcepts(draft.versionGallery ? draft.concepts : collectVersions(draft.history || [], draft.concepts, draft.redo || [])); setSelectedId(draft.selectedId);
      setHistory(draft.history || []); setRedo(draft.redo || []);
      setEditInstruction(draft.editInstruction || '');
      setLogoImage(draft.logoImage); setReferenceImage(draft.referenceImage); setPhotoImages(draft.photoImages || []);
      setSaveNotice('Your previous draft has been restored.');
    }).catch(() => { if (active) setSaveNotice('Draft recovery is unavailable in this browser. Keep this window open while designing.'); })
      .finally(() => { if (active) setRecoveryReady(true); });
    return () => { active = false; };
  }, [draftKey, props.initialSession, access.authorized, access.sessionKey]);

  useEffect(() => {
    if (!recoveryReady || !access.authorized || !access.sessionKey) return;
    const value = { versionGallery: true, brief, concepts, selectedId, history, redo, logoImage, referenceImage, photoImages, editInstruction };
    latestDraftRef.current = { key: draftKey, value };
    const timer = window.setTimeout(() => {
      saveDraft(draftKey, value)
        .catch(() => setSaveNotice('This browser could not save your draft. Keep this window open while designing.'));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [recoveryReady, draftKey, brief, concepts, selectedId, history, redo, logoImage, referenceImage, photoImages, editInstruction, access.authorized, access.sessionKey]);

  // Flush the latest selection if the customer closes the studio before the
  // debounced save. Generated artwork should not disappear on a quick Back.
  useEffect(() => () => {
    const draft = latestDraftRef.current;
    if (draft) void saveDraft(draft.key, draft.value).catch(() => {});
  }, []);

  useEffect(() => {
    if (!revealResult) return;
    previewRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    previewRef.current?.focus({ preventScroll: true });
  }, [revealResult]);

  useEffect(() => {
    if (restoringDraftRef.current) { restoringDraftRef.current = false; return; }
    if (selected?.brief) setBrief(selected.brief);
    if (selected && 'photoImages' in selected) setPhotoImages(selected.photoImages || []);
    if (selected && 'logoImage' in selected) setLogoImage(selected.logoImage || null);
    if (selected && 'referenceImage' in selected) setReferenceImage(selected.referenceImage || null);
  }, [selected]);


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
  };

  const movePhotoToLogo = (index: number) => {
    const source = photoImages[index];
    if (!source) return;
    setLogoImage(source);
    setPhotoImages(current => current.filter((_, item) => item !== index));
    setBrief(current => ({ ...current, logoRendering: 'integrated', structured: false }));
    setBriefReviewed(false);
    setSaveNotice('Moved to the Logo slot. It will be blended into the next design.');
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
    setActiveImageJob(true);
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
      setConcepts((current) => collectVersions(current, nextConcepts));
      setSelectedId(nextConcepts[0].versionId);
      setRevealResult(value => value + 1);
      setSaveNotice('Your new design is selected. Use it below or choose another version.');
      setHistory([]);
      setRedo([]);
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
      setActiveImageJob(false);
    }
  };

  const edit = async (manual = false, logoOnly = false, removeLogo = false) => {
    if (!selected || (!manual && !editInstruction.trim()) || stage || controllerRef.current || !access.ready) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setError('');
    setProgressPreview(null);
    setActiveImageJob(true);
    setStage(removeLogo ? 'Removing your uploaded logo' : logoOnly ? 'Updating your logo' : 'Refining your design');
    trackAIEvent('ai_edit_started', { concept_id: selected.id, version_number: concepts.indexOf(selected) + 1, edit_round: concepts.filter(item => item.id === selected.id).length });
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
          logoImage: removeLogo ? selected.logoImage : logoImage,
          logoSourceChanged: !removeLogo && logoImage !== selected.logoImage,
          photoImages: editPhotos,
        },
        controller.signal,
        removeLogo ? integratedLogo ? 'Removing the logo from your design' : 'Removing only your uploaded logo and preserving the artwork underneath' : logoOnly ? 'Placing your original logo and checking the result' : 'Applying your changes to the existing artwork.',
        setStage,
        setProgressPreview,
      );
      if (!body?.usedOriginalImage || !body?.concept) throw new Error('The server did not confirm use of the current artwork.');
      const edited: AIConcept = {
        ...body.concept,
        brief: body.concept.brief || body.brief || briefForEdit,
        logoImage: body.logoRemoved ? null : logoImage,
        referenceImage,
        photoImages: editPhotos.filter((_, index) => !body.removedPhotos?.includes(index)),
      };
      setConcepts(items => collectVersions(items, [edited]));
      setHistory(items => [...items, selected].slice(-20));
      setRedo([]);
      setSelectedId(edited.versionId);
      setBrief(edited.brief!);
      setBriefReviewed(true);
      setEditInstruction('');
      setRevealResult(value => value + 1);
      setSaveNotice('Your updated design is selected. Keep editing, choose an earlier version, or use this banner.');
      trackAIEvent('ai_edit_succeeded', { validation_passed: edited.validation.passed, version_id: edited.versionId, version_number: concepts.length + 1 });
      if (!body.concept.validation.passed) trackAIEvent('ai_validation_failed', { count: 1 });
    } catch (reason) {
      trackAIEvent('ai_edit_failed', { category: (reason as Error)?.name === 'AbortError' ? 'stopped_waiting' : 'request_failed', version_number: concepts.indexOf(selected) + 1 });
      if ((reason as Error)?.name !== 'AbortError') setError(reason instanceof Error ? reason.message : 'The edit failed.');
    } finally {
      controllerRef.current = null;
      setStage(null);
      setActiveImageJob(false);
    }
  };

  const selectVersion = (version: AIConcept) => {
    if (stage || controllerRef.current || version.versionId === selected?.versionId) return;
    if (selected) setHistory(items => [...items, selected].slice(-20));
    setRedo([]);
    setSelectedId(version.versionId);
    setEditInstruction('');
    setError('');
    setConfirmValidationOverride(false);
    trackAIEvent('ai_concept_selected', { version_id: version.versionId, version_number: concepts.indexOf(version) + 1 });
  };

  const undo = () => {
    if (!selected || !history.length || stage || controllerRef.current) return;
    const previous = history[history.length - 1];
    setHistory((items) => items.slice(0, -1));
    setRedo((items) => [...items, selected].slice(-20));
    setSelectedId(previous.versionId);
  };

  const redoEdit = () => {
    if (!selected || !redo.length || stage || controllerRef.current) return;
    const next = redo[redo.length - 1];
    setRedo((items) => items.slice(0, -1));
    setHistory((items) => [...items, selected].slice(-20));
    setSelectedId(next.versionId);
  };

  const startNewDesign = async () => {
    setConfirmValidationOverride(false);
    if (stage || controllerRef.current) return;
    const fresh = makeBrief(props);
    const emptyDraft = { brief: fresh, concepts: [], selectedId: '', history: [], redo: [], logoImage: null, referenceImage: null, photoImages: [] };
    restoringDraftRef.current = false;
    setBrief(fresh); setBriefReviewed(false); setConcepts([]); setSelectedId('');
    setGenerationId(''); setHistory([]); setRedo([]);
    setLogoImage(null); setReferenceImage(null); setPhotoImages([]);
    setEditInstruction(''); setPromptBeforeImprovement(null); setProgressPreview(null);
    setFullPreview(false); setError(''); setConfirmNewDesign(false);
    setSaveNotice('Fresh start. Describe your new banner.');
    try { await saveDraft(draftKey, emptyDraft); }
    catch { setSaveNotice('The new draft could not be saved. Keep this window open.'); }
  };

  const apply = async (validationOverride = false) => {
    if (!selected || (!selected.validation.passed && !validationOverride) || hasUnappliedChanges || stage || controllerRef.current) return;
    setConfirmValidationOverride(false);
    setError('');
    setStage('Preparing your artwork for the banner designer');
    const session: AIDesignSession = {
      generationId: selected.generationId || generationId,
      brief,
      selectedConcept: selected,
      referenceImage,
      logoImage,
      versionHistory: concepts,
      photoImages,
    };
    trackAIEvent('ai_design_approved', { concept_id: selected.id, version_id: selected.versionId, validation_override: validationOverride, version_number: concepts.indexOf(selected) + 1 });
    try {
    let imageBase64 = selected.imageBase64;
    if (selected.artworkRef) {
      const response = await fetchAIRequest('/.netlify/functions/ai-designer-export', {
        method: 'POST', credentials: 'same-origin',
        headers: authorizedHeaders({ 'Content-Type': 'application/json' }),
        body: authenticatedJsonBody({ artworkRef: selected.artworkRef }),
      });
      const result = await response.json();
      if (!response.ok || !result.url) throw new Error('The production artwork could not be retrieved. Your preview is still available.');
      const file = await fetchAIRequest(result.url);
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
    trackAIEvent('ai_applied_to_configurator', { product_type: brief.productType, version_number: concepts.indexOf(selected) + 1 });
    props.onClose?.();
    } catch (reason) {
      trackAIEvent('ai_transfer_failed', { category: 'transfer_failed', version_number: concepts.indexOf(selected) + 1 });
      setError(reason instanceof Error ? reason.message : 'The artwork could not be transferred. Your design is still saved here.');
    }
    finally { setStage(null); }
  };

  const blockerCopy = access.loading
    ? 'Getting your artwork designer ready…'
    : !access.authorized
      ? 'Your design session could not connect. Retry to continue.'
      : !access.ready
        ? 'The artwork designer is temporarily unavailable. Your draft is saved; please try again shortly.'
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
              {access.ready ? 'Ready to create' : 'Connecting…'}
            </span>
            {props.onClose && <button type="button" onClick={props.onClose} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /> Back</button>}
          </div>
        </div>
        {blockerCopy && !access.loading && <div role="alert" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><p>{blockerCopy}</p><button type="button" onClick={access.refresh} className="mt-2 min-h-11 rounded-lg bg-[#0b1f3a] px-4 font-bold text-white">Retry connection</button></div>}
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
            <label className="mt-3 block rounded-xl border border-dashed border-slate-300 bg-white p-3 text-sm font-semibold">Add people or product photos (up to 3)<span className="mt-1 block text-xs font-normal text-slate-500">These become part of the design. Add school or business marks in the Logo box above.</span><input type="file" multiple accept="image/png,image/jpeg,image/webp" className="mt-2 block w-full text-sm" disabled={Boolean(stage)} onChange={async event => {
              const files = Array.from(event.target.files || []);
              if (files.length + photoImages.length > 3) { setError('Choose up to three photos.'); return; }
              try { const images = await Promise.all(files.map(file => readImage(file, 256 * 1024, 1600))); setPhotoImages(current => [...current, ...images]); }
              catch (reason) { setError(reason instanceof Error ? reason.message : 'The photos could not be added.'); }
              event.target.value = '';
            }} /></label>
            </details>
            {photoImages.length > 0 && <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">{photoImages.map((src, index) => <div key={index} className="flex min-w-0 items-center gap-3 rounded-lg border border-slate-200 bg-white p-2"><img src={src} alt={`Customer visual ${index + 1}`} className="h-16 w-20 shrink-0 rounded bg-slate-50 object-contain" /><div className="min-w-0"><p className="text-xs font-bold text-slate-700">Photo {index + 1}</p><div className="mt-1 flex flex-wrap gap-x-3"><button type="button" className="min-h-8 text-xs font-semibold text-orange-700 underline underline-offset-2" onClick={() => movePhotoToLogo(index)}>Use as logo</button><button type="button" className="min-h-8 text-xs text-slate-500 underline underline-offset-2" onClick={() => setPhotoImages(current => current.filter((_, item) => item !== index))}>Remove</button></div></div></div>)}</div>}
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
            {activeImageJob && <div className="mt-4 flex max-w-md items-start gap-2 rounded-lg border border-white/15 bg-white/10 px-4 py-3 text-left text-sm leading-relaxed text-slate-100"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-orange-300" /><span><strong className="font-bold text-white">This may take a few minutes.</strong> Hang tight and keep this page open—your design will appear here automatically.</span></div>}
            <button type="button" onClick={() => controllerRef.current?.abort()} className="mt-4 min-h-11 px-3 text-xs text-slate-300 underline underline-offset-4" title="Your draft stays saved. This stops waiting here; the current job may still finish.">Stop waiting</button>
          </div>}
          {error && <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><XCircle className="mt-0.5 h-5 w-5 shrink-0" /><span>{error}</span></div>}

          {!concepts.length && !stage && <div className="grid min-h-[420px] place-items-center rounded-xl bg-white p-8 text-center"><div><Sparkles className="mx-auto h-9 w-9 text-orange-500" /><h4 className="mt-3 text-lg font-black text-[#0b1f3a]">A little imagination. A big impression.</h4><p className="mt-1 max-w-md text-sm text-slate-600">Tell us what your banner should say and look like, then choose Create my banner.</p></div></div>}

          {selected && <div ref={previewRef} tabIndex={-1} className="scroll-mt-4 rounded-xl border border-slate-200 bg-white p-4 outline-none sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-3"><div><h4 className="text-lg font-black text-[#0b1f3a]">Version {concepts.findIndex(item => item.versionId === selected.versionId) + 1} — selected</h4><p className="text-sm text-slate-600">This is the artwork that will continue to your order.</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={undo} disabled={!history.length || Boolean(stage)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-40"><Undo2 className="h-4 w-4" /> Undo</button><button type="button" onClick={redoEdit} disabled={!redo.length || Boolean(stage)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold disabled:opacity-40"><Redo2 className="h-4 w-4" /> Redo</button><button type="button" onClick={() => setFullPreview(true)} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-slate-300 px-3 text-sm font-semibold"><Maximize2 className="h-4 w-4" /> Full preview</button></div></div>
            <div className="mt-4 flex h-[min(55vh,36rem)] w-full items-center justify-center overflow-hidden rounded-xl border border-slate-300 bg-slate-100"><img src={imageSrc(selected)} alt="Complete selected flat print artwork" className="h-full w-full object-contain" /></div>

            {concepts.length > 1 && <div className="mt-4" aria-label="Saved design versions">
              <h5 className="text-sm font-bold text-[#0b1f3a]">Choose your favorite version</h5>
              <p className="mt-1 text-sm text-slate-600">Every finished edit is saved here. Select any version to keep editing or continue.</p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">{concepts.map((concept, index) => (
                <button key={concept.versionId} type="button" disabled={Boolean(stage)} onClick={() => selectVersion(concept)} aria-label={`Select version ${index + 1}`} aria-pressed={selected.versionId === concept.versionId} className={`min-w-0 rounded-lg border-2 p-2 text-left disabled:cursor-wait disabled:opacity-60 ${selected.versionId === concept.versionId ? 'border-orange-600 bg-orange-50' : 'border-slate-200 bg-white hover:border-orange-300'}`}>
                  <img src={imageSrc(concept)} alt={`Saved banner version ${index + 1}`} className="h-20 w-full rounded object-contain" />
                  <span className="mt-2 flex flex-wrap items-center justify-between gap-1 text-sm font-bold"><span>Version {index + 1}</span>{selected.versionId === concept.versionId && <span className="inline-flex items-center gap-1 text-orange-700"><Check className="h-4 w-4" /> Selected</span>}</span>
                  {index === concepts.length - 1 && <span className="text-xs text-slate-500">Latest</span>}
                </button>
              ))}</div>
            </div>}

            {logoImage && selected.brief?.logoRendering !== 'integrated' && <fieldset disabled={Boolean(stage)} className="mt-4 rounded-xl border border-slate-200 bg-white p-4 disabled:opacity-50">
              <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="text-sm font-bold text-[#0b1f3a]">Your logo</h5><span className="text-xs text-slate-500">Original logo · no AI redraw</span></div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold">Logo size<input aria-label="Logo size" type="range" min="0.4" max="2" step="0.05" value={brief.layers?.logo?.scale || 1} onChange={event => setBrief(current => ({ ...current, layers: { ...current.layers, logo: { ...current.layers?.logo, scale: Number(event.target.value) } } }))} className="h-11 w-full" /></label>
                <label className="text-sm font-semibold">Place logo<select aria-label="Place logo" value={brief.logoPosition} onChange={event => setBrief(current => ({ ...current, logoPosition: event.target.value as CreativeBrief['logoPosition'], layers: { ...current.layers, logo: { scale: current.layers?.logo?.scale || 1 } } }))} className="mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3"><option value="upper-left">Top left</option><option value="upper-right">Top right</option><option value="lower-left">Bottom left</option><option value="lower-right">Bottom right</option></select></label>
              </div>
              <div className="mt-2 flex flex-wrap gap-2"><button type="button" onClick={() => void edit(true, true)} className="min-h-11 rounded-lg bg-[#0b1f3a] px-4 text-sm font-bold text-white">Apply logo changes</button><button type="button" onClick={() => removeImage('logo')} className="min-h-11 rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-700">Remove uploaded logo</button></div>
              <p className="mt-2 text-xs text-slate-500">Adjusts your logo without generating the artwork again. Review the selected version before continuing.</p>
            </fieldset>}
            {logoImage && selected.brief?.logoRendering === 'integrated' && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600"><span>Logo blended into this design · use Edit with AI to adjust it</span><button type="button" disabled={Boolean(stage)} onClick={() => removeImage('logo')} className="min-h-11 rounded-lg border border-slate-300 bg-white px-3 font-semibold disabled:opacity-40">Remove logo</button></div>}
            <LayerControls brief={brief} concept={selected} busy={Boolean(stage)} onChange={setBrief} onApply={() => void edit(true)} />
            {hasUnappliedChanges && !stage && <button type="button" onClick={() => { if (selected.brief) setBrief(selected.brief); setLogoImage(selected.logoImage || null); setPhotoImages(selected.photoImages || []); setReferenceImage(selected.referenceImage || null); }} className="mt-2 min-h-11 text-xs text-slate-500 underline underline-offset-4">Discard unapplied changes</button>}
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto]">
              <label className="text-sm font-bold text-slate-800">Edit with AI<textarea disabled={Boolean(stage)} value={editInstruction} onChange={(event) => setEditInstruction(event.target.value.slice(0, 700))} rows={3} className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-base" placeholder='Example: “Make the background lighter and keep everything else exactly the same.”' /></label>
              <button type="button" onClick={() => void edit()} disabled={!editInstruction.trim() || Boolean(stage) || !access.ready} className="inline-flex min-h-11 items-center justify-center gap-2 self-end rounded-lg bg-[#0b1f3a] px-5 py-3 text-sm font-black text-white disabled:opacity-50"><WandSparkles className="h-4 w-4" /> Edit current design</button>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">{['Make the background lighter', 'Use the colors from my logo', ...(logoImage ? ['Move the logo to the upper-left'] : []), 'Remove the people', 'Make it more professional', 'Keep everything else exactly the same'].map((value) => <button key={value} type="button" disabled={Boolean(stage)} onClick={() => setEditInstruction(value)} className="min-h-11 rounded-full border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-700 hover:border-orange-400">{value}</button>)}</div>

            <details className="mt-5 border-t border-slate-200 pt-3"><summary className="cursor-pointer py-2 text-sm text-slate-500">Print checks</summary><div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className={`rounded-xl border p-4 ${selected.validation.passed ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}><div className="flex items-center gap-2 font-black text-[#0b1f3a]">{selected.validation.passed ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <AlertCircle className="h-5 w-5 text-amber-700" />} Print-readiness validation</div><ul className="mt-2 space-y-1 text-sm text-slate-700"><li>Dimensions: {selected.validation.checks.dimensions.passed ? 'Exact' : 'Failed'}</li><li>Full edge coverage: {selected.validation.checks.edgeCoverage.passed ? 'Passed' : 'Failed'}</li><li>Flat artwork / no hardware: {selected.validation.checks.flatArtwork.passed ? 'Passed' : 'Failed'}</li><li>Wording check: {selected.validation.checks.exactText.passed ? 'Passed' : 'Failed'}</li><li>Output canvas resolution: {selected.validation.checks.resolution.effectivePpi} PPI ({selected.validation.checks.resolution.passed ? 'passed' : 'failed'})</li></ul>{selected.validation.reasons.length > 0 && <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-900">{selected.validation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}</div>
              {user?.is_admin && (<div className="rounded-xl border border-slate-200 bg-slate-50 p-4"><div className="flex items-center gap-2 font-black text-[#0b1f3a]"><Clock3 className="h-5 w-5 text-slate-500" /> Version and output</div><ul className="mt-2 space-y-1 text-sm text-slate-700"><li>Output: {selected.diagnostics.outputDimensions}px</li><li>Ratio method: {selected.diagnostics.ratioStrategy.replace(/-/g, ' ')}</li><li>Model: {selected.diagnostics.modelSnapshot || selected.diagnostics.model}</li><li>Artwork processing: {formatDuration(selected.diagnostics.durationMs)}</li>{selected.diagnostics.clientDurationMs != null && <li>Total wait: {formatDuration(selected.diagnostics.clientDurationMs)}</li>}<li>Estimated image API cost: {selected.diagnostics.estimatedCostUsd == null ? 'Unavailable' : `$${selected.diagnostics.estimatedCostUsd.toFixed(4)}`}</li><li>Auto-repaired: {selected.diagnostics.repaired ? 'Yes' : 'No'}</li></ul></div>)}
            </div>

            </details>

              {user?.is_admin && (<details className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3"><summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-bold text-[#0b1f3a]">Admin diagnostics <ChevronDown className="h-4 w-4" /></summary><dl className="grid grid-cols-1 gap-x-4 gap-y-2 pt-3 text-xs text-slate-600 sm:grid-cols-2"><div><dt className="font-bold">Generation ID</dt><dd className="break-all">{selected.generationId || generationId}</dd></div><div><dt className="font-bold">Version ID</dt><dd className="break-all">{selected.versionId}</dd></div><div><dt className="font-bold">Provider request ID</dt><dd className="break-all">{selected.diagnostics.providerRequestId || 'Not returned'}</dd></div><div><dt className="font-bold">Validation model</dt><dd>{selected.validation.vision.model}</dd></div>{selected.diagnostics.stageTimings?.map((timing, index) => <div key={index}><dt className="font-bold">{timing.stage}</dt><dd>{formatDuration(timing.durationMs)}</dd></div>)}</dl></details>)}

            {!selected.validation.passed && !hasUnappliedChanges && <p className="mt-4 text-center text-sm text-amber-800">The automated check flagged something. If the complete banner looks right to you, you can review the warning and continue.</p>}
          </div>}
        </section>
      </div>

      {selected && <div className="sticky bottom-0 z-10 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white p-4 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] sm:px-6" data-testid="ai-selection-footer">
        <div className="flex min-w-0 items-center gap-3"><img src={imageSrc(selected)} alt="Selected version to continue with" className="h-12 w-24 rounded border border-slate-200 object-contain" /><div><p className="text-sm font-bold text-[#0b1f3a]">Version {concepts.findIndex(item => item.versionId === selected.versionId) + 1} selected</p><p className="text-xs text-slate-600">{hasUnappliedChanges ? 'Apply or discard your changes first.' : 'Your selected artwork goes with you.'}</p></div></div>
        <button type="button" onClick={() => selected.validation.passed ? void apply() : setConfirmValidationOverride(true)} disabled={hasUnappliedChanges || Boolean(stage)} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-orange-600 px-5 text-base font-black text-white hover:bg-orange-700 disabled:cursor-not-allowed disabled:bg-slate-300 sm:w-auto"><CheckCircle2 className="h-5 w-5" /> {stage ? 'Please wait…' : hasUnappliedChanges ? 'Apply your changes before continuing' : selected.validation.passed ? 'Use selected version & continue' : 'Review warning & continue'}</button>
      </div>}

      <Dialog open={confirmValidationOverride} onOpenChange={setConfirmValidationOverride}>
        <DialogContent className="z-[10020] max-w-lg bg-white">
          <DialogTitle>Use this banner anyway?</DialogTitle>
          <DialogDescription>The automated print check found a possible issue. It can occasionally flag artwork that is actually acceptable.</DialogDescription>
          {selected?.validation.reasons?.length ? <ul className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{selected.validation.reasons.slice(0, 4).map(reason => <li key={reason}>• {reason}</li>)}</ul> : null}
          <p className="text-sm text-slate-700">Check the full preview for readable wording, complete edge-to-edge artwork, and nothing important cut off. If it looks right, you can continue.</p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><button type="button" onClick={() => setConfirmValidationOverride(false)} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-semibold">Go back</button><button type="button" onClick={() => void apply(true)} className="min-h-11 rounded-lg bg-orange-600 px-4 text-sm font-black text-white hover:bg-orange-700">Use this banner anyway</button></div>
        </DialogContent>
      </Dialog>

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
