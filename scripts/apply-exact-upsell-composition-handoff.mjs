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
  console.log(`[exact-upsell-composition] updated ${path}`);
}

await update('src/pages/Design.tsx', (source) => {
  let next = source;

  next = replaceOne(
    next,
    "import { generatePositionedThumbnail, generatePositionedWebPreview, renderPositionedThumbnailDataUrl } from '@/utils/generatePositionedThumbnail';",
    "import { generatePositionedThumbnail, generatePositionedWebPreview, renderPositionedThumbnailDataUrl } from '@/utils/generatePositionedThumbnail';\nimport { uploadCanvasImageToCloudinary } from '@/utils/uploadCanvasImage';\nimport { isVisuallyBlankPreviewResult, preloadPreviewImage } from '@/lib/previewImageCache';",
    'Design exact-preview imports',
  );

  next = replaceOne(
    next,
    'function preloadPermanentArtwork(url: string, timeoutMs = 20_000): Promise<boolean> {',
    `type PreparedCompositionPreview = {
  signature: string;
  dataUrl: string;
  widthPx: number;
  heightPx: number;
};

function buildCompositionSignature(
  imageUrl: string,
  widthIn: number,
  heightIn: number,
  transform: { pos: { x: number; y: number }; scale: number; scaleY?: number },
): string {
  const numberKey = (value: number | undefined) => Number.isFinite(value)
    ? Number(value).toFixed(6)
    : '0.000000';
  return [
    imageUrl,
    numberKey(widthIn),
    numberKey(heightIn),
    numberKey(transform.pos.x),
    numberKey(transform.pos.y),
    numberKey(transform.scale),
    numberKey(transform.scaleY ?? transform.scale),
  ].join('|');
}

function preloadPermanentArtwork(url: string, timeoutMs = 20_000): Promise<boolean> {`,
    'Design composition signature helper',
  );

  next = replaceOne(
    next,
    "  const [pendingActionType, setPendingActionType] = useState<'checkout' | 'cart'>('checkout');",
    `  const [pendingActionType, setPendingActionType] = useState<'checkout' | 'cart'>('checkout');
  const [pendingUpsellThumbnailUrl, setPendingUpsellThumbnailUrl] = useState<string | null>(null);
  const pendingApprovedThumbnailRef = useRef<PreparedCompositionPreview | null>(null);`,
    'Design pending exact thumbnail state',
  );

  next = replaceOne(
    next,
    `  useEffect(() => {
    setImgPos({ x: 0, y: 0 });
    setImgScale(1);
    setImgScaleY(1);
  }, [widthIn, heightIn]);`,
    `  useEffect(() => {
    setImgPos({ x: 0, y: 0 });
    setImgScale(1);
    setImgScaleY(1);
    setPendingUpsellThumbnailUrl(null);
    pendingApprovedThumbnailRef.current = null;
  }, [widthIn, heightIn]);`,
    'Design dimension-change exact preview reset',
  );

  next = replaceOne(
    next,
    `    setAiPrompt(null);
    setAiEditPrompt(null);
    setHasJustAddedToCart(false);`,
    `    setAiPrompt(null);
    setAiEditPrompt(null);
    setPendingUpsellThumbnailUrl(null);
    pendingApprovedThumbnailRef.current = null;
    setHasJustAddedToCart(false);`,
    'Design reset exact preview state',
  );

  next = replaceOne(
    next,
    `      imgScale: number;
      imgScaleY?: number;
    },`,
    `      imgScale: number;
      imgScaleY?: number;
      preparedDataUrl?: string;
    },`,
    'Design thumbnail scheduler prepared source type',
  );

  next = replaceOne(
    next,
    `      try {
        const positioned = await generatePositionedThumbnail({
          ...input,
          backgroundColor: '#fafafa',
        });
        if (positioned?.url) {
          cartStore.updateItemThumbnail(itemId, positioned.url);
        }
      } catch (err) {`,
    `      try {
        if (input.preparedDataUrl) {
          const uploaded = await uploadCanvasImageToCloudinary(
            input.preparedDataUrl,
            \`approved-composition-\${Date.now()}.jpg\`,
          );
          cartStore.updateItemThumbnail(itemId, uploaded.secureUrl);
          return;
        }

        const positioned = await generatePositionedThumbnail({
          ...input,
          backgroundColor: '#ffffff',
        });
        if (positioned?.url) {
          cartStore.updateItemThumbnail(itemId, positioned.url);
        }
      } catch (err) {`,
    'Design upload the exact prepared snapshot',
  );

  next = replaceOne(
    next,
    '  // CRITICAL: Generate final_render before adding to cart - orders without it cannot be printed',
    `  const prepareExactCompositionPreview = useCallback(async (
    checkoutData: { pos: { x: number; y: number }; scale: number; scaleY?: number },
  ): Promise<PreparedCompositionPreview> => {
    const artwork = uploadedFileRef.current;
    if (!artwork) throw new Error('Artwork is not available');

    const imageUrl = artwork.previewUrl || artwork.thumbnailUrl || artwork.url;
    if (!imageUrl) throw new Error('Artwork preview source is not available');

    const signature = buildCompositionSignature(imageUrl, widthIn, heightIn, checkoutData);
    const cached = pendingApprovedThumbnailRef.current;
    if (cached?.signature === signature) {
      setPendingUpsellThumbnailUrl(cached.dataUrl);
      return cached;
    }

    const rendered = await renderPositionedThumbnailDataUrl({
      imageUrl,
      widthIn,
      heightIn,
      imgPosPercent: checkoutData.pos,
      imgScale: checkoutData.scale,
      imgScaleY: checkoutData.scaleY ?? checkoutData.scale,
      backgroundColor: '#ffffff',
      maxOutputPx: 1400,
      maxOutputPixels: 1_500_000,
    });

    const decoded = await preloadPreviewImage(rendered.dataUrl, {
      timeoutMs: 12_000,
      fetchPriority: 'high',
    });
    if (isVisuallyBlankPreviewResult(decoded)) {
      throw new Error('The positioned preview rendered without visible artwork');
    }

    const prepared: PreparedCompositionPreview = {
      signature,
      dataUrl: rendered.dataUrl,
      widthPx: rendered.widthPx,
      heightPx: rendered.heightPx,
    };
    pendingApprovedThumbnailRef.current = prepared;
    setPendingUpsellThumbnailUrl(prepared.dataUrl);
    return prepared;
  }, [widthIn, heightIn]);

  const openUpsellWithExactComposition = useCallback(async (
    actionType: 'checkout' | 'cart',
    checkoutData: { pos: { x: number; y: number }; scale: number; scaleY?: number },
  ) => {
    if (isProcessingUpsell) return;

    setPendingCheckoutData(checkoutData);
    setPendingActionType(actionType);
    setIsProcessingUpsell(true);
    try {
      await prepareExactCompositionPreview(checkoutData);
      setShowUpsellModal(true);
    } catch (error) {
      console.error('[DESIGN_UPSELL] exact composition preparation failed', error);
      toast({
        title: 'Could not prepare your exact preview',
        description: 'Your artwork is still selected. Tap the button again to retry before continuing.',
        variant: 'destructive',
      });
    } finally {
      setIsProcessingUpsell(false);
    }
  }, [isProcessingUpsell, prepareExactCompositionPreview, toast]);

  // CRITICAL: Generate final_render before adding to cart - orders without it cannot be printed`,
    'Design prepare exact Upsell composition before opening',
  );

  const oldApprovedBlock = `    const baseImageUrl = checkoutArtwork.previewUrl || checkoutArtwork.thumbnailUrl || checkoutArtwork.url;
    let approvedThumbnailUrl = baseImageUrl;
    try {
      const rendered = await renderPositionedThumbnailDataUrl({
        imageUrl: baseImageUrl,
        widthIn,
        heightIn,
        imgPosPercent: checkoutData.pos,
        imgScale: checkoutData.scale,
        backgroundColor: '#fafafa',
      });
      approvedThumbnailUrl = rendered.dataUrl;
    } catch (err) {
      console.warn('[DESIGN_CHECKOUT] dataUrl thumbnail render failed (non-blocking):', err);
    }`;

  const newApprovedBlock = `    const baseImageUrl = checkoutArtwork.previewUrl || checkoutArtwork.thumbnailUrl || checkoutArtwork.url;
    const compositionSignature = buildCompositionSignature(
      baseImageUrl,
      widthIn,
      heightIn,
      checkoutData,
    );
    const preparedComposition = pendingApprovedThumbnailRef.current;
    let approvedThumbnailUrl = preparedComposition?.signature === compositionSignature
      ? preparedComposition.dataUrl
      : baseImageUrl;

    if (approvedThumbnailUrl === baseImageUrl) {
      try {
        const rendered = await renderPositionedThumbnailDataUrl({
          imageUrl: baseImageUrl,
          widthIn,
          heightIn,
          imgPosPercent: checkoutData.pos,
          imgScale: checkoutData.scale,
          imgScaleY: checkoutData.scaleY ?? checkoutData.scale,
          backgroundColor: '#ffffff',
          maxOutputPx: 1400,
          maxOutputPixels: 1_500_000,
        });
        const decoded = await preloadPreviewImage(rendered.dataUrl, {
          timeoutMs: 12_000,
          fetchPriority: 'high',
        });
        if (isVisuallyBlankPreviewResult(decoded)) {
          throw new Error('The approved checkout composition contained no visible artwork');
        }
        approvedThumbnailUrl = rendered.dataUrl;
        pendingApprovedThumbnailRef.current = {
          signature: compositionSignature,
          dataUrl: rendered.dataUrl,
          widthPx: rendered.widthPx,
          heightPx: rendered.heightPx,
        };
      } catch (err) {
        console.warn('[DESIGN_CHECKOUT] exact thumbnail render failed; original fallback retained:', err);
      }
    }`;

  next = replaceOne(
    next,
    oldApprovedBlock,
    newApprovedBlock,
    'Design reuse the exact Upsell snapshot in cart/checkout',
  );

  next = replaceOne(
    next,
    `      imgScale: checkoutData.scale,
      imgScaleY: checkoutData.scaleY ?? checkoutData.scale,
    });
    scheduleWebPreviewUpload(bannerAddedId, {`,
    `      imgScale: checkoutData.scale,
      imgScaleY: checkoutData.scaleY ?? checkoutData.scale,
      preparedDataUrl: approvedThumbnailUrl.startsWith('data:image/')
        ? approvedThumbnailUrl
        : undefined,
    });
    scheduleWebPreviewUpload(bannerAddedId, {`,
    'Design persist the same exact banner snapshot',
  );

  next = replaceOne(
    next,
    '  const handleCheckout = useCallback(() => {\n    // Yard signs: multi-design flow (no single uploadedFile needed)',
    "  const handleCheckout = useCallback(() => {\n    if (isProcessingUpsell) return;\n    // Yard signs: multi-design flow (no single uploadedFile needed)",
    'Design checkout double-click guard',
  );

  next = replaceOne(
    next,
    `    } else {
      setPendingActionType('checkout');
      setShowUpsellModal(true);
    }
  }, [uploadedFile, imgPos, imgScale, imgScaleY, finishingType, performCheckout, isYardSign, isCarMagnet, yardSignDesigns, yardSignTotalQty, yardSignQuantityValid, toast]);`,
    `    } else {
      void openUpsellWithExactComposition('checkout', {
        pos: posPercent,
        scale: imgScale,
        scaleY: imgScaleY,
      });
    }
  }, [uploadedFile, imgPos, imgScale, imgScaleY, finishingType, performCheckout, isYardSign, isCarMagnet, yardSignDesigns, yardSignTotalQty, yardSignQuantityValid, toast, isProcessingUpsell, openUpsellWithExactComposition]);`,
    'Design checkout exact Upsell opening',
  );

  next = replaceOne(
    next,
    '  const handleAddToCart = useCallback(() => {\n    if (isYardSign) {',
    "  const handleAddToCart = useCallback(() => {\n    if (isProcessingUpsell) return;\n    if (isYardSign) {",
    'Design add-to-cart double-click guard',
  );

  next = replaceOne(
    next,
    `    } else {
      logUx('upsell_opened', { source: 'add_to_cart' });
      setPendingActionType('cart');
      setShowUpsellModal(true);
    }
  }, [uploadedFile, imgPos, imgScale, imgScaleY, finishingType, performCheckout, isYardSign, isCarMagnet, yardSignDesigns, yardSignTotalQty, yardSignQuantityValid, toast]);`,
    `    } else {
      logUx('upsell_opened', { source: 'add_to_cart' });
      void openUpsellWithExactComposition('cart', {
        pos: posPercent,
        scale: imgScale,
        scaleY: imgScaleY,
      });
    }
  }, [uploadedFile, imgPos, imgScale, imgScaleY, finishingType, performCheckout, isYardSign, isCarMagnet, yardSignDesigns, yardSignTotalQty, yardSignQuantityValid, toast, isProcessingUpsell, openUpsellWithExactComposition]);`,
    'Design add-to-cart exact Upsell opening',
  );

  next = replaceOne(
    next,
    `    } else {
      setPendingActionType('checkout');
      setShowUpsellModal(true);
    }
  }, [uploadedFile, finishingType, performCheckout, isCarMagnet]);`,
    `    } else {
      void openUpsellWithExactComposition('checkout', {
        pos: posPercent,
        scale,
        scaleY: scaleY ?? scale,
      });
    }
  }, [uploadedFile, finishingType, performCheckout, isCarMagnet, openUpsellWithExactComposition]);`,
    'Design confirm-position exact Upsell opening',
  );

  next = replaceOne(
    next,
    `          thumbnailUrl: uploadedFile?.previewUrl || uploadedFile?.thumbnailUrl || uploadedFile?.url,`,
    `          thumbnailUrl: pendingUpsellThumbnailUrl || uploadedFile?.previewUrl || uploadedFile?.thumbnailUrl || uploadedFile?.url,`,
    'Design Upsell quote exact thumbnail',
  );

  next = replaceOne(
    next,
    `        thumbnailUrl={uploadedFile?.thumbnailUrl || uploadedFile?.url}
        actionType={pendingActionType === 'checkout' ? 'checkout' : 'cart'}`,
    `        thumbnailUrl={pendingUpsellThumbnailUrl || undefined}
        thumbnailIsExactComposition={Boolean(pendingUpsellThumbnailUrl)}
        actionType={pendingActionType === 'checkout' ? 'checkout' : 'cart'}`,
    'Design Upsell exact thumbnail prop',
  );

  return next;
});

await update('src/components/cart/UpsellModal.tsx', (source) => {
  let next = source;

  next = replaceOne(
    next,
    '  thumbnailUrl?: string; // Canvas thumbnail for preview',
    `  thumbnailUrl?: string; // Exact positioned canvas thumbnail for preview
  thumbnailIsExactComposition?: boolean;`,
    'Upsell exact thumbnail prop type',
  );

  next = replaceOne(
    next,
    `  thumbnailUrl,
  onContinue,`,
    `  thumbnailUrl,
  thumbnailIsExactComposition = false,
  onContinue,`,
    'Upsell exact thumbnail prop default',
  );

  next = replaceOne(
    next,
    `  const copy = getProductCopy(productType);
  const [selectedOptions, setSelectedOptions] = useState<UpsellOption[]>([]);`,
    `  const copy = getProductCopy(productType);
  const effectiveThumbnailUrl = thumbnailUrl || quote.thumbnailUrl || quote.file?.url;
  const [selectedOptions, setSelectedOptions] = useState<UpsellOption[]>([]);`,
    'Upsell deterministic effective thumbnail',
  );

  const rawImageExpression = 'imageUrl={thumbnailUrl || quote.file?.url}';
  const occurrences = next.split(rawImageExpression).length - 1;
  if (occurrences !== 2) {
    throw new Error(`Upsell image source replacement: expected 2 occurrences, found ${occurrences}`);
  }
  next = next.split(rawImageExpression).join('imageUrl={effectiveThumbnailUrl}');

  const fitModeExpression = '                    fitMode={quote.fitMode || "fill"}\n                    designServiceEnabled={designServiceEnabled}';
  const fitOccurrences = next.split(fitModeExpression).length - 1;
  if (fitOccurrences !== 2) {
    throw new Error(`Upsell exact flag insertion: expected 2 occurrences, found ${fitOccurrences}`);
  }
  next = next.split(fitModeExpression).join(
    '                    fitMode={quote.fitMode || "fill"}\n                    isFinalizedSnapshot={thumbnailIsExactComposition}\n                    designServiceEnabled={designServiceEnabled}',
  );

  next = replaceOne(
    next,
    '<div className="bg-gray-50 rounded-xl p-4">',
    `<div
            className="bg-gray-50 rounded-xl p-4"
            data-upsell-preview-source={thumbnailIsExactComposition ? 'exact-composition' : 'fallback'}
          >`,
    'Upsell exact source diagnostic',
  );

  return next;
});

await update('src/components/cart/StableBannerPreview.tsx', (source) => {
  let next = source;

  next = replaceRegexOne(
    next,
    /  \/\*\*[\s\S]*?Centering the original with `contain` guarantees the correct artwork is[\s\S]*?const previewTransformMode = visibleSourceIsExact\n    \? 'exact-snapshot'\n    : 'centered-original-fallback';/,
    `  /**
   * Exact snapshots already contain the approved placement and must never be
   * transformed twice. When the renderer falls back to the original artwork,
   * reconstruct the designer's fit/fill/drag/resize transform on the full-frame
   * layer. The saved position is container-relative percent, so translating the
   * full-frame layer by that percentage matches ArtworkPreviewEditor.
   */
  const imageObjectFit: React.CSSProperties['objectFit'] = fitMode === 'stretch'
    ? 'fill'
    : 'contain';
  const previewTransform = visibleSourceIsExact
    ? undefined
    : \`translate(\${requestedX}%, \${requestedY}%) scale(\${requestedScaleX}, \${requestedScaleY})\`;
  const previewTransformMode = visibleSourceIsExact
    ? 'exact-snapshot'
    : 'reconstructed-original';`,
    'StableBannerPreview reconstruct original composition',
  );

  next = replaceOne(
    next,
    '          ) : imageUrl && !baseFailed ? (\n            <div className="absolute inset-0 h-full w-full">',
    `          ) : imageUrl && !baseFailed ? (
            <div
              className="absolute inset-0 h-full w-full"
              style={{
                transform: previewTransform,
                transformOrigin: 'center center',
              }}
            >`,
    'StableBannerPreview apply reconstructed transform',
  );

  return next;
});

await update('tests/browser/run-preview-handoff-cdp.mjs', (source) => {
  let next = source;
  next = replaceOne(
    next,
    "const commerceHarnessUrl = process.env.COMMERCE_PREVIEW_HANDOFF_URL || 'http://127.0.0.1:4175/tests/browser/commerce-preview-handoff.html';",
    "const commerceHarnessUrl = process.env.COMMERCE_PREVIEW_HANDOFF_URL || 'http://127.0.0.1:4175/tests/browser/commerce-preview-handoff.html';\nconst upsellHarnessUrl = process.env.UPSELL_PREVIEW_HANDOFF_URL || 'http://127.0.0.1:4175/tests/browser/upsell-preview-handoff.html';",
    'CDP Upsell harness URL',
  );

  next = replaceOne(
    next,
    `  { name: 'commerce-thumbnail-lightbox', url: commerceHarnessUrl },
  { name: 'order-confirmation-my-orders-admin', url: orderSurfaceHarnessUrl },`,
    `  { name: 'commerce-thumbnail-lightbox', url: commerceHarnessUrl },
  { name: 'upsell-exact-composition', url: upsellHarnessUrl },
  { name: 'order-confirmation-my-orders-admin', url: orderSurfaceHarnessUrl },`,
    'CDP run actual Upsell preview',
  );
  return next;
});

await update('netlify/functions/__tests__/preview-pipeline.test.cjs', (source) => {
  let next = source;

  next = replaceOne(
    next,
    `test('Design and Google Ads use the shared session-stable artwork editor alias', () => {`,
    `test('Upsell receives a baked designer composition before it opens', () => {
  const design = read('src/pages/Design.tsx');
  const upsell = read('src/components/cart/UpsellModal.tsx');
  const banner = read('src/components/cart/StableBannerPreview.tsx');
  const runner = read('tests/browser/run-preview-handoff-cdp.mjs');
  const harness = read('tests/browser/upsell-preview-handoff.jsx');

  assert.match(design, /prepareExactCompositionPreview/);
  assert.match(design, /openUpsellWithExactComposition/);
  assert.match(design, /pendingUpsellThumbnailUrl/);
  assert.match(design, /thumbnailIsExactComposition=\{Boolean\(pendingUpsellThumbnailUrl\)\}/);
  assert.match(design, /preparedDataUrl: approvedThumbnailUrl\.startsWith/);
  assert.equal(design.includes('thumbnailUrl={uploadedFile?.thumbnailUrl || uploadedFile?.url}'), false);
  assert.match(upsell, /thumbnailIsExactComposition/);
  assert.match(upsell, /isFinalizedSnapshot=\{thumbnailIsExactComposition\}/);
  assert.match(upsell, /effectiveThumbnailUrl/);
  assert.match(banner, /reconstructed-original/);
  assert.match(banner, /transform: previewTransform/);
  assert.match(runner, /upsell-exact-composition/);
  assert.match(harness, /UPSELL-APPROVED-COMPOSITION/);
});

test('Design and Google Ads use the shared session-stable artwork editor alias', () => {`,
    'Preview pipeline exact Upsell source guards',
  );

  return next;
});

console.log('[exact-upsell-composition] deterministic source patch complete');
