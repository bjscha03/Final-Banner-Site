import fs from 'node:fs/promises';

function replaceOne(source, search, replacement, label) {
  if (search instanceof RegExp) {
    const flags = search.flags.includes('g') ? search.flags : `${search.flags}g`;
    const matches = [...source.matchAll(new RegExp(search.source, flags))];
    if (matches.length !== 1) {
      throw new Error(`${label}: expected 1 match, found ${matches.length}`);
    }
    return source.replace(search, replacement);
  }
  const first = source.indexOf(search);
  if (first < 0) throw new Error(`${label}: target not found`);
  if (source.indexOf(search, first + search.length) >= 0) {
    throw new Error(`${label}: target is not unique`);
  }
  return source.slice(0, first) + replacement + source.slice(first + search.length);
}

async function update(path, transform) {
  const current = await fs.readFile(path, 'utf8');
  const next = transform(current);
  if (next === current) throw new Error(`${path}: no change`);
  await fs.writeFile(path, next, 'utf8');
  console.log(`[direct-upload-patch] updated ${path}`);
}

const sharedHelpers = `function hasPermanentArtwork(file: UploadedArtworkFile | null | undefined): file is UploadedArtworkFile {
  return Boolean(
    file
    && (file.productionUrl || (/^https?:\\/\\//i.test(file.url || '') ? file.url : null))
    && (file.productionPublicId || file.fileKey),
  );
}

function preloadPermanentArtwork(url: string, timeoutMs = 20_000): Promise<boolean> {
  return new Promise((resolve) => {
    if (!url) { resolve(false); return; }
    const image = new Image();
    let settled = false;
    const finish = (value: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      image.onload = null;
      image.onerror = null;
      resolve(value);
    };
    const timeoutId = window.setTimeout(() => finish(false), timeoutMs);
    image.onload = () => finish(Boolean(image.naturalWidth && image.naturalHeight));
    image.onerror = () => finish(false);
    image.src = url;
  });
}

`;

const replacementStateBlock = `  const [isUploading, setIsUploading] = useState(false);
  const [uploadedFile, setUploadedFile] = useState<UploadedArtworkFile | null>(null);
  const uploadedFileRef = useRef<UploadedArtworkFile | null>(null);
  const activeUploadFileRef = useRef<File | null>(null);
  const activeUploadPromiseRef = useRef<Promise<UploadedArtworkFile | null> | null>(null);
  const activeUploadAbortControllerRef = useRef<AbortController | null>(null);
  const uploadGenerationRef = useRef(0);
  const activeImagePreviewCleanupRef = useRef<(() => void) | null>(null);
  const activePdfPreviewCleanupRef = useRef<(() => void) | null>(null);
  const activePdfPreviewFileRef = useRef<File | null>(null);
  useEffect(() => {
    uploadedFileRef.current = uploadedFile;
  }, [uploadedFile]);
  useEffect(() => () => {
    activeUploadAbortControllerRef.current?.abort();
    activeImagePreviewCleanupRef.current?.();
    activePdfPreviewCleanupRef.current?.();
    activeImagePreviewCleanupRef.current = null;
    activePdfPreviewCleanupRef.current = null;
  }, []);
  const [uploadError, setUploadError] = useState('');`;

const replacementUploadBlock = `  const persistArtworkUpload = useCallback(async (
    file: File,
    initialArtwork: UploadedArtworkFile,
    generation: number,
    correlationId: string,
  ): Promise<UploadedArtworkFile | null> => {
    const controller = new AbortController();
    activeUploadAbortControllerRef.current?.abort();
    activeUploadAbortControllerRef.current = controller;
    setIsUploading(true);
    setUploadError('');

    const promise = (async () => {
      const result = await uploadArtworkFile(file, {
        correlationId,
        signal: controller.signal,
        onAttempt: (attempt, maximum) => {
          console.info('[artwork_upload]', {
            correlationId,
            stage: 'direct_upload_attempt',
            attempt,
            maximum,
            size: file.size,
          });
        },
      });
      if (generation !== uploadGenerationRef.current) return null;

      let browserPreviewUrl = initialArtwork.previewUrl || initialArtwork.thumbnailUrl || initialArtwork.url;
      const permanentPreviewUrl = result.previewUrl || result.secureUrl;
      const permanentPreviewLoaded = await preloadPermanentArtwork(permanentPreviewUrl);
      if (permanentPreviewLoaded) browserPreviewUrl = permanentPreviewUrl;

      const completedArtwork: UploadedArtworkFile = {
        ...initialArtwork,
        url: result.secureUrl,
        fileKey: result.fileKey,
        thumbnailUrl: browserPreviewUrl,
        previewUrl: browserPreviewUrl,
        productionUrl: result.productionUrl,
        productionPublicId: result.productionPublicId,
        resourceType: result.resourceType,
        mimeType: result.mimeType,
        originalFormat: result.format || initialArtwork.originalFormat,
        originalBytes: result.bytes || file.size,
        originalWidth: result.width ?? initialArtwork.originalWidth ?? null,
        originalHeight: result.height ?? initialArtwork.originalHeight ?? null,
        pdfPageNumber: initialArtwork.isPdf ? 1 : undefined,
        artworkManifest: result.artworkManifest,
      };

      uploadedFileRef.current = completedArtwork;
      setUploadedFile(completedArtwork);
      setUploadError('');
      console.info('[artwork_upload]', {
        correlationId,
        stage: 'original_upload_succeeded',
        transport: result.transport,
        publicIdPresent: Boolean(result.fileKey),
      });
      logUx('upload_success', {
        name: file.name,
        fileKey: result.fileKey,
        transport: result.transport,
      });

      if (permanentPreviewLoaded) {
        window.setTimeout(() => {
          activeImagePreviewCleanupRef.current?.();
          activePdfPreviewCleanupRef.current?.();
          activeImagePreviewCleanupRef.current = null;
          activePdfPreviewCleanupRef.current = null;
        }, 0);
      }
      return completedArtwork;
    })();

    activeUploadPromiseRef.current = promise;
    try {
      return await promise;
    } catch (error) {
      if (generation !== uploadGenerationRef.current) return null;
      const cancelled = controller.signal.aborted;
      if (!cancelled) {
        console.error('[artwork_upload]', { correlationId, stage: 'original_upload_failed', error });
        logUx('upload_error', {
          name: file.name,
          message: error instanceof Error ? error.message : String(error),
        });
        setUploadError(
          'We could not finish the original artwork upload. Your file is still selected — tap Buy Now to retry automatically or choose another file.',
        );
      }
      return null;
    } finally {
      if (activeUploadPromiseRef.current === promise) activeUploadPromiseRef.current = null;
      if (activeUploadAbortControllerRef.current === controller) activeUploadAbortControllerRef.current = null;
      if (generation === uploadGenerationRef.current) setIsUploading(false);
    }
  }, []);

  const handleFileUpload = useCallback(async (file: File) => {
    const validationError = validateArtworkFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    const generation = uploadGenerationRef.current + 1;
    uploadGenerationRef.current = generation;
    activeUploadAbortControllerRef.current?.abort();
    activeUploadFileRef.current = file;
    setUploadError('');

    activeImagePreviewCleanupRef.current?.();
    activePdfPreviewCleanupRef.current?.();
    activeImagePreviewCleanupRef.current = null;
    activePdfPreviewCleanupRef.current = null;

    const correlationId = \`artwork-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    const extension = file.name.split('.').pop()?.toLowerCase() || (isPdf ? 'pdf' : 'jpg');
    const mimeType = isPdf
      ? 'application/pdf'
      : (file.type || (extension === 'png' ? 'image/png' : 'image/jpeg'));

    setIsUploading(true);
    logUx('upload_start', { name: file.name, size: file.size, type: file.type });

    try {
      let previewUrl = '';
      let dimensions: { width: number; height: number } | null = null;
      if (isPdf) {
        activePdfPreviewFileRef.current = file;
        const pdfPreview = await generateValidatedPdfPreview(file, correlationId);
        previewUrl = pdfPreview.preview.previewUrl;
        activePdfPreviewCleanupRef.current = pdfPreview.preview.cleanup;
        dimensions = pdfPreview.dimensions;
      } else {
        activePdfPreviewFileRef.current = null;
        previewUrl = URL.createObjectURL(file);
        activeImagePreviewCleanupRef.current = () => URL.revokeObjectURL(previewUrl);
        dimensions = await new Promise((resolve) => {
          const image = new Image();
          let settled = false;
          const finish = (value: { width: number; height: number } | null) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeoutId);
            image.onload = null;
            image.onerror = null;
            resolve(value);
          };
          const timeoutId = window.setTimeout(() => finish(null), 12_000);
          image.onload = () => finish({ width: image.naturalWidth, height: image.naturalHeight });
          image.onerror = () => finish(null);
          image.src = previewUrl;
        });
      }

      if (generation !== uploadGenerationRef.current) return;
      const initialArtwork: UploadedArtworkFile = {
        name: file.name,
        url: previewUrl,
        fileKey: '',
        size: file.size,
        isPdf,
        thumbnailUrl: previewUrl,
        previewUrl,
        resourceType: 'image',
        mimeType,
        originalFormat: extension,
        originalBytes: file.size,
        originalWidth: dimensions?.width ?? null,
        originalHeight: dimensions?.height ?? null,
        pdfPageNumber: isPdf ? 1 : undefined,
      };
      uploadedFileRef.current = initialArtwork;
      setUploadedFile(initialArtwork);
      console.info('[artwork_upload]', {
        correlationId,
        stage: 'local_preview_ready',
        previewUrlType: previewUrl.startsWith('data:') ? 'data' : previewUrl.startsWith('blob:') ? 'blob' : 'url',
      });

      await persistArtworkUpload(file, initialArtwork, generation, correlationId);
    } catch (error) {
      if (generation !== uploadGenerationRef.current) return;
      console.error('[artwork_upload]', { correlationId, stage: 'local_preview_failed', error });
      setUploadError('We could not open that artwork file. Please choose a PDF, PNG, JPG, or JPEG file.');
      setIsUploading(false);
    }
  }, [generateValidatedPdfPreview, persistArtworkUpload]);

  const retryActiveArtworkUpload = useCallback(async (): Promise<UploadedArtworkFile | null> => {
    const file = activeUploadFileRef.current;
    const current = uploadedFileRef.current;
    if (!file || !current) return null;
    if (hasPermanentArtwork(current)) return current;
    return persistArtworkUpload(
      file,
      current,
      uploadGenerationRef.current,
      \`artwork-retry-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`,
    );
  }, [persistArtworkUpload]);

  const ensurePermanentArtworkUploaded = useCallback(async (): Promise<UploadedArtworkFile | null> => {
    let current = uploadedFileRef.current;
    if (hasPermanentArtwork(current)) return current;

    if (activeUploadPromiseRef.current) {
      toast({
        title: 'Finishing artwork upload',
        description: 'Your file is selected. We are completing the secure upload now.',
      });
      await activeUploadPromiseRef.current.catch(() => null);
      current = uploadedFileRef.current;
      if (hasPermanentArtwork(current)) return current;
    }

    if (activeUploadFileRef.current && current) {
      toast({
        title: 'Retrying artwork upload',
        description: 'You do not need to select the file again. We are retrying it now.',
      });
      current = await retryActiveArtworkUpload();
      if (hasPermanentArtwork(current)) return current;
    }

    toast({
      title: 'Artwork upload failed',
      description: 'The file is still selected. Check your connection and tap Buy Now again, or choose another file.',
      variant: 'destructive',
    });
    return null;
  }, [retryActiveArtworkUpload, toast]);`;

function patchPerformCheckout(source, path) {
  const start = source.indexOf('  const performCheckout = useCallback(async (');
  if (start < 0) throw new Error(`${path}: performCheckout start not found`);
  const endMarker = '\n\n\n  // Proceed directly to checkout';
  let end = source.indexOf(endMarker, start);
  if (end < 0) {
    end = source.indexOf('\n\n  // Proceed directly to checkout', start);
  }
  if (end < 0) throw new Error(`${path}: performCheckout end not found`);

  let block = source.slice(start, end);
  block = block.replace(/\buploadedFile\b/g, 'checkoutArtwork');
  block = replaceOne(
    block,
    '    const checkoutData = directData || pendingCheckoutData;\n',
    '    const checkoutData = directData || pendingCheckoutData;\n    let checkoutArtwork = uploadedFileRef.current;\n',
    `${path}: checkout artwork ref`,
  );

  const uploadGuard = /      if \(!\(checkoutArtwork\.productionUrl \|\| checkoutArtwork\.fileKey\) \|\| !\(checkoutArtwork\.productionPublicId \|\| checkoutArtwork\.fileKey\)\) \{\n        toast\(\{\n          title: 'Upload still processing',\n          description: 'Please wait for the original artwork upload to finish before checkout\.',\n          variant: 'destructive',\n        \}\);\n        return;\n      \}/g;
  const guardMatches = [...block.matchAll(uploadGuard)];
  if (guardMatches.length !== 2) {
    throw new Error(`${path}: expected 2 upload guards, found ${guardMatches.length}`);
  }
  block = block.replace(uploadGuard, `      checkoutArtwork = await ensurePermanentArtworkUploaded();
      if (!checkoutArtwork) return;`);

  block = block.replace(
    '  }, [checkoutArtwork,',
    '  }, [ensurePermanentArtworkUploaded,',
  );
  if (!block.includes('[ensurePermanentArtworkUploaded,')) {
    throw new Error(`${path}: performCheckout dependency replacement failed`);
  }

  return source.slice(0, start) + block + source.slice(end);
}

async function patchDesignLike(path, componentMarker, addManifestType) {
  await update(path, (source) => {
    let next = source;
    if (!next.includes("@/utils/uploadArtworkFile")) {
      next = replaceOne(
        next,
        "import { base64ToFile } from '@/utils/base64ToFile';",
        "import { base64ToFile } from '@/utils/base64ToFile';\nimport { uploadArtworkFile, validateArtworkFile } from '@/utils/uploadArtworkFile';",
        `${path}: upload utility import`,
      );
    }
    if (addManifestType && !next.includes("import type { ArtworkManifest } from '@/types/artwork';")) {
      next = replaceOne(
        next,
        "import { formatOptionValue, getDisplayPlacement } from '@/lib/product-display';",
        "import { formatOptionValue, getDisplayPlacement } from '@/lib/product-display';\nimport type { ArtworkManifest } from '@/types/artwork';",
        `${path}: artwork manifest import`,
      );
    }
    if (addManifestType && !next.includes('artworkManifest?: ArtworkManifest;')) {
      next = replaceOne(
        next,
        '  pdfPageNumber?: number;\n};',
        '  pdfPageNumber?: number;\n  artworkManifest?: ArtworkManifest;\n};',
        `${path}: artwork manifest field`,
      );
    }
    if (!next.includes('function hasPermanentArtwork(')) {
      next = replaceOne(
        next,
        componentMarker,
        `${sharedHelpers}${componentMarker}`,
        `${path}: shared helpers`,
      );
    }

    next = replaceOne(
      next,
      /  const \[isUploading, setIsUploading\] = useState\(false\);\n  const \[uploadedFile, setUploadedFile\] = useState<UploadedArtworkFile \| null>\(null\);\n  const activePdfPreviewCleanupRef = useRef<\(\(\) => void\) \| null>\(null\);\n  const activePdfPreviewFileRef = useRef<File \| null>\(null\);\n  useEffect\(\(\) => \(\) => \{\n    activePdfPreviewCleanupRef\.current\?\.\(\);\n    activePdfPreviewCleanupRef\.current = null;\n  \}, \[\]\);\n  const \[uploadError, setUploadError\] = useState\(''\);/,
      replacementStateBlock,
      `${path}: upload state block`,
    );

    next = replaceOne(
      next,
      /  \/\/ Compress images client-side to stay under Netlify's 6 MB function limit\n  const compressImage = useCallback\(async \(file: File\): Promise<File> => \{[\s\S]*?\n  \}, \[\]\);\n\n/,
      '',
      `${path}: remove lossy original compression`,
    );

    next = replaceOne(
      next,
      /  const handleFileUpload = useCallback\(async \(file: File\) => \{[\s\S]*?\n  \}, \[generateValidatedPdfPreview\]\);/,
      replacementUploadBlock,
      `${path}: direct upload block`,
    );

    next = replaceOne(
      next,
      '  const resetPreview = useCallback(() => {\n    setUploadedFile(null);',
      `  const resetPreview = useCallback(() => {
    uploadGenerationRef.current += 1;
    activeUploadAbortControllerRef.current?.abort();
    activeUploadAbortControllerRef.current = null;
    activeUploadPromiseRef.current = null;
    activeUploadFileRef.current = null;
    activeImagePreviewCleanupRef.current?.();
    activePdfPreviewCleanupRef.current?.();
    activeImagePreviewCleanupRef.current = null;
    activePdfPreviewCleanupRef.current = null;
    uploadedFileRef.current = null;
    setUploadedFile(null);`,
      `${path}: reset active upload`,
    );
    next = next.replace("    setUploadError(null);", "    setUploadError('');");

    next = patchPerformCheckout(next, path);
    return next;
  });
}

await patchDesignLike('src/pages/Design.tsx', 'const Design: React.FC = () => {', false);
await patchDesignLike('src/pages/GoogleAdsBanner.tsx', 'const GoogleAdsBanner: React.FC = () => {', true);

await update('src/components/design/YardSignConfigurator.tsx', (source) => {
  let next = source;
  next = replaceOne(
    next,
    "import { uploadCanvasImageToCloudinary } from '@/utils/uploadCanvasImage';",
    "import { uploadCanvasImageToCloudinary } from '@/utils/uploadCanvasImage';\nimport { isPdfArtwork, uploadArtworkFile, validateArtworkFile } from '@/utils/uploadArtworkFile';\nimport StablePreviewImage from '@/components/preview/StablePreviewImage';",
    'YardSign direct upload imports',
  );

  next = replaceOne(
    next,
    `function getRowThumbnailSrc(design: YardSignDesign): string {
  return design.previewThumbnailUrl || design.thumbnailUrl;
}`,
    `function getRowThumbnailSrc(design: YardSignDesign): string {
  return design.previewThumbnailUrl || design.thumbnailUrl;
}

function getRowThumbnailSources(design: YardSignDesign): string[] {
  const values = [
    design.previewThumbnailUrl,
    design.thumbnailUrl,
    design.isPdf ? getPdfThumbnailUrl(design.fileUrl) : null,
    design.fileUrl,
  ];
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}`,
    'YardSign thumbnail candidates',
  );

  next = replaceOne(
    next,
    /  \/\/ Compress images client-side to stay under Netlify's 6 MB function limit\n  const compressImage = useCallback\(async \(file: File\): Promise<File> => \{[\s\S]*?\n  \}, \[\]\);\n\n/,
    '',
    'YardSign remove lossy compression',
  );

  next = replaceOne(
    next,
    /  const handleFileUpload = useCallback\(async \(file: File\) => \{[\s\S]*?\n  \}, \[canAddMoreDesigns, compressImage, designs, onDesignsChange, initialDesignQuantity\]\);/,
    `  const handleFileUpload = useCallback(async (file: File) => {
    setUploadError('');
    if (!canAddMoreDesigns) {
      setUploadError(\`Maximum \${YARD_SIGN_MAX_DESIGNS} designs per order.\`);
      return;
    }
    const validationError = validateArtworkFile(file);
    if (validationError) {
      setUploadError(validationError);
      return;
    }

    setIsUploading(true);
    try {
      const result = await uploadArtworkFile(file, {
        correlationId: \`yard-sign-\${Date.now()}-\${Math.random().toString(36).slice(2, 8)}\`,
      });
      const isPdf = isPdfArtwork(file);
      const thumbnailUrl = isPdf ? result.previewUrl : result.secureUrl;
      const presetFirstDesignQuantity = Math.max(
        YARD_SIGN_MIN_QUANTITY,
        Math.min(YARD_SIGN_MAX_QUANTITY, initialDesignQuantity || YARD_SIGN_MIN_QUANTITY),
      );
      const newDesign: YardSignDesign = {
        id: \`\${Date.now()}-\${Math.random().toString(36).substring(2, 11)}\`,
        fileName: file.name,
        fileUrl: result.secureUrl,
        fileKey: result.fileKey,
        thumbnailUrl,
        isPdf,
        quantity: designs.length === 0 ? presetFirstDesignQuantity : 1,
        imgScale: 1,
        imgPos: { x: 0, y: 0 },
      };
      onDesignsChange([...designs, newDesign]);
      setPreviewDesignId(newDesign.id);
      logUx('preview_opened', { source: 'yard_sign_after_upload', designId: newDesign.id });
      setPreviewImgPos({ x: 0, y: 0 });
      setPreviewImgScale(1);
      setUploadError('');
    } catch (error) {
      console.error('[YardSign] original upload failed', error);
      setUploadError('Upload failed after automatic retries. Your file was not added; please check your connection and try again.');
      logUx('upload_error', {
        source: 'yard_sign',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setIsUploading(false);
    }
  }, [canAddMoreDesigns, designs, onDesignsChange, initialDesignQuantity]);`,
    'YardSign direct upload block',
  );

  next = replaceOne(
    next,
    `                  <img
                    src={getRowThumbnailSrc(design)}
                    alt={\`${'${design.fileName}'} thumbnail\`}
                    className="w-full h-full object-contain"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                  />`,
    `                  <StablePreviewImage
                    sources={getRowThumbnailSources(design)}
                    alt={\`${'${design.fileName}'} thumbnail\`}
                    className="absolute inset-0 block h-full w-full object-contain"
                    retainPreviousWhileLoading
                    loadTimeoutMs={25_000}
                  />`,
    'YardSign stable row thumbnail',
  );

  return next;
});

console.log('[direct-upload-patch] all upload and Buy Now recovery patches applied');
