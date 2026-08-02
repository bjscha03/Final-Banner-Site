import fs from 'node:fs/promises';

function replaceOne(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: target not found`);
  if (source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${label}: target is not unique`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function replaceRegexOne(source, pattern, replacement, label) {
  const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
  const matches = [...source.matchAll(new RegExp(pattern.source, flags))];
  if (matches.length !== 1) {
    throw new Error(`${label}: expected one match, found ${matches.length}`);
  }
  return source.replace(pattern, replacement);
}

async function update(path, transform) {
  const current = await fs.readFile(path, 'utf8');
  const next = transform(current);
  if (next === current) throw new Error(`${path}: patch produced no change`);
  await fs.writeFile(path, next, 'utf8');
  console.log(`[preview-lifecycle] updated ${path}`);
}

await update('src/components/design/ArtworkPreviewEditor.tsx', (source) => {
  let next = replaceOne(
    source,
    "import { getPreviewCrossOrigin, resolveArtworkPreviewImageSrc } from './artworkPreviewSource';",
    "import { getPreviewCrossOrigin, resolveArtworkPreviewImageSrc } from './artworkPreviewSource';\nimport type { NormalizedArtworkTransform } from '@/lib/previewLifecycle';",
    'ArtworkPreviewEditor lifecycle import',
  );

  next = replaceOne(
    next,
    `  imageCrossOrigin?: '' | 'anonymous' | 'use-credentials';
  onRetryPreview?: () => void | Promise<void>;
}`,
    `  imageCrossOrigin?: '' | 'anonymous' | 'use-credentials';
  onRetryPreview?: () => void | Promise<void>;
  onNormalizedTransformChange?: (
    next: NormalizedArtworkTransform,
    meta: { canvasWidth: number; canvasHeight: number; artworkKey: string },
  ) => void;
}`,
    'ArtworkPreviewEditor normalized callback type',
  );

  next = replaceOne(
    next,
    `  imageCrossOrigin,
  onRetryPreview,
}) => {`,
    `  imageCrossOrigin,
  onRetryPreview,
  onNormalizedTransformChange,
}) => {`,
    'ArtworkPreviewEditor normalized callback prop',
  );

  next = replaceOne(
    next,
    `  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const constrainRef = useRef(constrain);`,
    `  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onNormalizedTransformChangeRef = useRef(onNormalizedTransformChange);
  onNormalizedTransformChangeRef.current = onNormalizedTransformChange;
  const constrainRef = useRef(constrain);`,
    'ArtworkPreviewEditor normalized callback ref',
  );

  next = replaceRegexOne(
    next,
    /  const commitTransform = useCallback\(\(next: ArtworkTransform, updateNormalized = true\) => \{[\s\S]*?\n  \}, \[artworkKey\]\);/,
    `  const emitNormalizedTransform = useCallback((
    next: ArtworkTransform,
    size: Size | null,
    normalizedOverride?: NormalizedPosition,
  ) => {
    if (!size?.w || !size?.h) return;
    const normalized = normalizedOverride || {
      xPct: next.x / size.w,
      yPct: next.y / size.h,
    };
    onNormalizedTransformChangeRef.current?.({
      xPct: normalized.xPct * 100,
      yPct: normalized.yPct * 100,
      scaleX: next.scaleX,
      scaleY: next.scaleY,
    }, {
      canvasWidth: size.w,
      canvasHeight: size.h,
      artworkKey,
    });
  }, [artworkKey]);

  const commitTransform = useCallback((next: ArtworkTransform, updateNormalized = true) => {
    const size = canvasSizeRef.current;
    let normalized = size?.w && size?.h
      ? { xPct: next.x / size.w, yPct: next.y / size.h }
      : undefined;
    if (updateNormalized && normalized) {
      normalizedPositionByArtwork.set(artworkKey, normalized);
    } else if (!updateNormalized) {
      normalized = normalizedPositionByArtwork.get(artworkKey) || normalized;
    }
    valueRef.current = next;
    onChangeRef.current(next);
    emitNormalizedTransform(next, size, normalized);
  }, [artworkKey, emitNormalizedTransform]);`,
    'ArtworkPreviewEditor canonical transform emission',
  );

  next = replaceOne(
    next,
    `        normalizedPositionByArtwork.set(artworkKey, normalized);
      }

      const resized = previous`,
    `        normalizedPositionByArtwork.set(artworkKey, normalized);
      }

      emitNormalizedTransform(valueRef.current, next, normalized);

      const resized = previous`,
    'ArtworkPreviewEditor initial geometry emission',
  );

  next = next.replace(
    `  }, [artworkKey, paddingPct, commitTransform, containerRef]);`,
    `  }, [artworkKey, paddingPct, commitTransform, containerRef, emitNormalizedTransform]);`,
  );

  return next;
});

await update('src/pages/Design.tsx', (source) => {
  let next = source;

  next = replaceOne(
    next,
    "import { isVisuallyBlankPreviewResult, preloadPreviewImage } from '@/lib/previewImageCache';",
    `import { isVisuallyBlankPreviewResult, preloadPreviewImage } from '@/lib/previewImageCache';
import { createPermanentPlacementPreview } from '@/lib/previewArtifactCoordinator';
import {
  PREVIEW_ARTIFACT_VERSION,
  PreviewLifecycleError,
  type ArtworkCompositionSpec,
  type NormalizedArtworkTransform,
  type ReadyPlacementPreviewManifest,
  buildCompositionSignature,
  explainPreviewLifecycleError,
  placementPreviewMatches,
  toCheckoutTransform,
} from '@/lib/previewLifecycle';`,
    'Design lifecycle imports',
  );

  next = replaceRegexOne(
    next,
    /type PreparedCompositionPreview = \{[\s\S]*?\n\};\n\nfunction buildCompositionSignature\([\s\S]*?\n\}\n\nfunction preloadPermanentArtwork/,
    `type PreparedCompositionPreview = ReadyPlacementPreviewManifest;

function preloadPermanentArtwork`,
    'Design remove duplicate signature implementation',
  );

  next = replaceOne(
    next,
    `  const [pendingUpsellThumbnailUrl, setPendingUpsellThumbnailUrl] = useState<string | null>(null);
  const pendingApprovedThumbnailRef = useRef<PreparedCompositionPreview | null>(null);`,
    `  const [pendingUpsellThumbnailUrl, setPendingUpsellThumbnailUrl] = useState<string | null>(null);
  const pendingApprovedThumbnailRef = useRef<PreparedCompositionPreview | null>(null);
  const canonicalCompositionRef = useRef<NormalizedArtworkTransform>({
    xPct: 0,
    yPct: 0,
    scaleX: 1,
    scaleY: 1,
  });
  const compositionReadyRef = useRef(false);
  const compositionRevisionRef = useRef(0);`,
    'Design canonical composition refs',
  );

  next = replaceOne(
    next,
    `  useEffect(() => {
    setImgPos({ x: 0, y: 0 });
    setImgScale(1);
    setImgScaleY(1);
    setPendingUpsellThumbnailUrl(null);
    pendingApprovedThumbnailRef.current = null;
  }, [widthIn, heightIn]);`,
    `  useEffect(() => {
    setImgPos({ x: 0, y: 0 });
    setImgScale(1);
    setImgScaleY(1);
    canonicalCompositionRef.current = { xPct: 0, yPct: 0, scaleX: 1, scaleY: 1 };
    compositionReadyRef.current = false;
    compositionRevisionRef.current += 1;
    setPendingUpsellThumbnailUrl(null);
    pendingApprovedThumbnailRef.current = null;
  }, [widthIn, heightIn]);`,
    'Design dimension reset canonical composition',
  );

  next = replaceOne(
    next,
    `  const prepareExactCompositionPreview = useCallback(async (
    checkoutData: { pos: { x: number; y: number }; scale: number; scaleY?: number },
  ): Promise<PreparedCompositionPreview> => {`,
    `  const handleNormalizedCompositionChange = useCallback((
    nextTransform: NormalizedArtworkTransform,
  ) => {
    const previous = canonicalCompositionRef.current;
    const changed = Math.abs(previous.xPct - nextTransform.xPct) > 0.0001
      || Math.abs(previous.yPct - nextTransform.yPct) > 0.0001
      || Math.abs(previous.scaleX - nextTransform.scaleX) > 0.0001
      || Math.abs(previous.scaleY - nextTransform.scaleY) > 0.0001;
    canonicalCompositionRef.current = nextTransform;
    compositionReadyRef.current = true;
    if (changed) {
      compositionRevisionRef.current += 1;
      pendingApprovedThumbnailRef.current = null;
      setPendingUpsellThumbnailUrl(null);
    }
  }, []);

  const getCanonicalCheckoutData = useCallback(() => {
    if (!compositionReadyRef.current) {
      throw new PreviewLifecycleError(
        'PREVIEW_GEOMETRY_NOT_READY',
        'The visible artwork editor has not reported valid canvas geometry.',
      );
    }
    return {
      pos: {
        x: canonicalCompositionRef.current.xPct,
        y: canonicalCompositionRef.current.yPct,
      },
      scale: canonicalCompositionRef.current.scaleX,
      scaleY: canonicalCompositionRef.current.scaleY,
    };
  }, []);

  const buildCurrentCompositionSpec = useCallback((
    artwork: UploadedArtworkFile,
  ): ArtworkCompositionSpec => {
    if (!compositionReadyRef.current) {
      throw new PreviewLifecycleError(
        'PREVIEW_GEOMETRY_NOT_READY',
        'The visible artwork editor has not reported valid canvas geometry.',
      );
    }

    const sourceCandidates = [
      artwork.previewUrl,
      artwork.thumbnailUrl,
      artwork.artworkManifest?.originalUrl,
      artwork.url,
    ].filter((value): value is string => Boolean(value && /^https?:\\/\\//i.test(value)));
    let sourceUrl = sourceCandidates[0] || '';
    if (artwork.isPdf && sourceUrl.toLowerCase().includes('.pdf')) {
      sourceUrl = getPdfThumbnailUrl(sourceUrl);
    }
    const sourceIdentity = artwork.productionPublicId
      || artwork.fileKey
      || artwork.artworkManifest?.publicId
      || '';

    return {
      version: PREVIEW_ARTIFACT_VERSION,
      sourceUrl,
      sourceIdentity,
      widthIn,
      heightIn,
      fitMode: fitMode || 'fill',
      transform: canonicalCompositionRef.current,
      revision: compositionRevisionRef.current,
    };
  }, [widthIn, heightIn, fitMode]);

  const prepareExactCompositionPreview = useCallback(async (
    _checkoutData?: { pos: { x: number; y: number }; scale: number; scaleY?: number },
  ): Promise<PreparedCompositionPreview> => {`,
    'Design canonical composition helpers',
  );

  next = replaceRegexOne(
    next,
    /  const prepareExactCompositionPreview = useCallback\(async \([\s\S]*?\n  \}, \[widthIn, heightIn\]\);/,
    `  const prepareExactCompositionPreview = useCallback(async (
    _checkoutData?: { pos: { x: number; y: number }; scale: number; scaleY?: number },
  ): Promise<PreparedCompositionPreview> => {
    for (let statePass = 0; statePass < 3; statePass += 1) {
      const artwork = await ensurePermanentArtworkUploaded();
      if (!artwork) {
        throw new PreviewLifecycleError(
          'ORIGINAL_UPLOAD_INCOMPLETE',
          'The original artwork upload did not complete.',
        );
      }

      const spec = buildCurrentCompositionSpec(artwork);
      const signature = buildCompositionSignature(spec);
      const cached = pendingApprovedThumbnailRef.current;
      if (placementPreviewMatches(cached, spec)) {
        setPendingUpsellThumbnailUrl(cached.url);
        return cached;
      }

      const startedRevision = compositionRevisionRef.current;
      const artifact = await createPermanentPlacementPreview(spec);
      const currentArtwork = uploadedFileRef.current;
      if (!currentArtwork) {
        throw new PreviewLifecycleError('ARTWORK_NOT_SELECTED', 'Artwork was removed while preparing the preview.');
      }
      const currentSpec = buildCurrentCompositionSpec(currentArtwork);
      const currentSignature = buildCompositionSignature(currentSpec);

      if (startedRevision !== compositionRevisionRef.current || signature !== currentSignature) {
        // The customer changed size, position, scale, or artwork while the
        // asynchronous canvas/upload work was running. Discard the stale
        // artifact and deterministically finalize the latest state; never ask
        // the customer to tap repeatedly and never store the stale image.
        continue;
      }

      pendingApprovedThumbnailRef.current = artifact;
      setPendingUpsellThumbnailUrl(artifact.url);
      return artifact;
    }

    throw new PreviewLifecycleError(
      'PREVIEW_STATE_CHANGED',
      'The artwork composition kept changing while its permanent preview was being finalized.',
    );
  }, [ensurePermanentArtworkUploaded, buildCurrentCompositionSpec]);`,
    'Design permanent exact artifact generation',
  );

  next = replaceRegexOne(
    next,
    /  const openUpsellWithExactComposition = useCallback\(async \([\s\S]*?\n  \}, \[isProcessingUpsell, prepareExactCompositionPreview, toast\]\);/,
    `  const openUpsellWithExactComposition = useCallback(async (
    actionType: 'checkout' | 'cart',
    _checkoutData?: { pos: { x: number; y: number }; scale: number; scaleY?: number },
  ) => {
    if (isProcessingUpsell) return;

    let checkoutData;
    try {
      checkoutData = getCanonicalCheckoutData();
    } catch (error) {
      const explained = explainPreviewLifecycleError(error);
      toast({
        title: explained.title,
        description: \`${'${explained.description}'} (${ '${explained.code}' })\`,
        variant: 'destructive',
      });
      return;
    }

    setPendingCheckoutData(checkoutData);
    setPendingActionType(actionType);
    setIsProcessingUpsell(true);
    try {
      await prepareExactCompositionPreview(checkoutData);
      setShowUpsellModal(true);
    } catch (error) {
      const explained = explainPreviewLifecycleError(error);
      console.error('[DESIGN_UPSELL] exact composition preparation failed', {
        code: explained.code,
        error,
      });
      toast({
        title: explained.title,
        description: \`${'${explained.description}'} (${ '${explained.code}' })\`,
        variant: 'destructive',
      });
    } finally {
      setIsProcessingUpsell(false);
    }
  }, [isProcessingUpsell, getCanonicalCheckoutData, prepareExactCompositionPreview, toast]);`,
    'Design deterministic Upsell preparation',
  );

  // Replace every action-time DOM measurement with the canonical normalized
  // transform emitted by the actual editor. This is the central stale-ref fix.
  next = next.replace(
    /    const container = previewContainerRef\.current;\n    const containerWidth = container\?\.offsetWidth \|\| 1;\n    const containerHeight = container\?\.offsetHeight \|\| 1;\n    const posPercent = \{\n      x: \((?:imgPos|pos)\.x \/ containerWidth\) \* 100,\n      y: \((?:imgPos|pos)\.y \/ containerHeight\) \* 100,?\n    \};/g,
    `    let canonicalCheckoutData;
    try {
      canonicalCheckoutData = getCanonicalCheckoutData();
    } catch (error) {
      const explained = explainPreviewLifecycleError(error);
      toast({ title: explained.title, description: \`${'${explained.description}'} (${ '${explained.code}' })\`, variant: 'destructive' });
      return;
    }
    const posPercent = canonicalCheckoutData.pos;`,
  );

  // All direct calls must use the same canonical scale pair as the position.
  next = next.replace(/scale: imgScale, scaleY: imgScaleY/g, 'scale: canonicalCheckoutData.scale, scaleY: canonicalCheckoutData.scaleY');
  next = next.replace(/scale, scaleY: scaleY \?\? scale/g, 'scale: canonicalCheckoutData.scale, scaleY: canonicalCheckoutData.scaleY');

  const editorContainerAnchor = 'containerRef={previewContainerRef}';
  const editorOccurrences = next.split(editorContainerAnchor).length - 1;
  if (editorOccurrences !== 2) {
    throw new Error(`Design editor callback insertion: expected 2 container refs, found ${editorOccurrences}`);
  }
  next = next.split(editorContainerAnchor).join(
    `${editorContainerAnchor}\n                          onNormalizedTransformChange={handleNormalizedCompositionChange}`,
  );

  // Insert the permanent placement artifact at the start of performCheckout.
  next = replaceOne(
    next,
    `    const checkoutData = directData || pendingCheckoutData;`,
    `    const checkoutData = directData || pendingCheckoutData;
    if (!checkoutData) {
      throw new PreviewLifecycleError('PREVIEW_GEOMETRY_NOT_READY', 'No canonical artwork composition is available.');
    }
    const placementPreview = await prepareExactCompositionPreview(checkoutData);
    const approvedThumbnailUrl = placementPreview.url;`,
    'Design performCheckout placement artifact',
  );

  // Remove legacy immediate data-URL generation blocks. There are two product
  // branches (car magnet and banner); both must use the already-uploaded exact
  // placement artifact above.
  next = next.replace(
    /      \/\/ Render an immediate dataUrl thumbnail synchronously[\s\S]*?      \}\n\n      quoteStore\.set\(\{/,
    `      quoteStore.set({`,
  );
  next = next.replace(
    /    \/\/ user's position\/scale onto a canvas[\s\S]*?    if \(approvedThumbnailUrl === baseImageUrl\) \{[\s\S]*?    \}\n\n    quoteStore\.set\(\{/,
    `    quoteStore.set({`,
  );

  // The exact placement preview is already permanent before cart insertion.
  next = next.replace(/placementPreview: \{ uploadStatus: 'pending' \}/g, 'placementPreview');

  // Remove the two obsolete background thumbnail writers that could overwrite
  // the correct per-item artifact after cart serialization.
  next = next.replace(
    /\n      \/\/ Kick off background Cloudinary upload \+ thumbnail patch\.[\s\S]*?      \}\);\n/,
    '\n',
  );
  next = next.replace(
    /\n    \/\/ Kick off background Cloudinary upload of positioned thumbnail\.[\s\S]*?    \}\);\n/,
    '\n',
  );

  // Ensure the normalized callback is included in hook dependency lists where
  // handlers now call getCanonicalCheckoutData.
  next = next.replace(/openUpsellWithExactComposition\]\);/g, 'openUpsellWithExactComposition, getCanonicalCheckoutData]);');

  return next;
});

console.log('[preview-lifecycle] source refactor applied');
