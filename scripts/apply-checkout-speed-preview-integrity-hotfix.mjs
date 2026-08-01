import fs from 'node:fs';

const changed = new Set();

function read(path) {
  return fs.readFileSync(path, 'utf8');
}

function write(path, content) {
  fs.writeFileSync(path, content);
  changed.add(path);
}

function replaceRegex(path, pattern, replacement, label) {
  const before = read(path);
  const matches = before.match(pattern);
  if (!matches) throw new Error(`${label}: pattern not found in ${path}`);
  const after = before.replace(pattern, replacement);
  if (after === before) throw new Error(`${label}: replacement made no change in ${path}`);
  write(path, after);
}

function replaceLiteral(path, oldText, newText, label) {
  const before = read(path);
  const first = before.indexOf(oldText);
  if (first < 0) throw new Error(`${label}: text not found in ${path}`);
  if (before.indexOf(oldText, first + oldText.length) >= 0) {
    throw new Error(`${label}: expected one occurrence in ${path}`);
  }
  write(path, before.slice(0, first) + newText + before.slice(first + oldText.length));
}

const uploadPages = [
  'src/pages/Design.tsx',
  'src/pages/GoogleAdsBanner.tsx',
];

const preloadHelper = `    const preloadImage = (url: string) => new Promise<boolean>((resolve) => {
      const img = new Image();
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = url;
    });
`;

const delayedUploadHandoff = `      let browserPreviewUrl = previewUrl;
      if (!isPdf && productionUrl) {
        const productionPreviewLoaded = await preloadImage(productionUrl);
        if (productionPreviewLoaded) browserPreviewUrl = productionUrl;
      }

      setUploadedFile({
        ...initialArtwork,
        url: productionUrl,
        fileKey: productionPublicId,
        thumbnailUrl: browserPreviewUrl,
        previewUrl: browserPreviewUrl,
`;

const immediateUploadHandoff = `      // The original upload is complete and the local preview is already decoded.
      // Persist permanent production metadata immediately, but keep the exact local
      // preview painted for this editing session. Waiting for the CDN image to load
      // here unnecessarily held the checkout buttons disabled on slower devices.
      setUploadedFile({
        ...initialArtwork,
        url: productionUrl,
        fileKey: productionPublicId,
        thumbnailUrl: previewUrl,
        previewUrl,
`;

for (const path of uploadPages) {
  replaceLiteral(path, preloadHelper, '', 'remove blocking production-image preload helper');
  replaceLiteral(path, delayedUploadHandoff, immediateUploadHandoff, 'unlock checkout immediately after upload response');
}

const cartPath = 'src/store/cart.ts';
replaceLiteral(
  cartPath,
  `const debugLog = CART_DEBUG ? console.log.bind(console) : () => {};
`,
  `const debugLog = CART_DEBUG ? console.log.bind(console) : () => {};

const isPersistentCartPreviewUrl = (value: unknown): value is string => {
  if (typeof value !== 'string') return false;
  const url = value.trim();
  return /^https?:\\/\\//i.test(url) && !url.startsWith('blob:') && !url.startsWith('data:');
};

const resolveAuthoritativeQuoteWebPreview = (quote: QuoteState, aiMetadata?: any): string | null => {
  const placement = (quote as any).placementPreview as PlacementPreviewManifest | undefined;
  if (placement?.uploadStatus === 'uploaded' && isPersistentCartPreviewUrl(placement.url)) {
    return placement.url;
  }
  const proofUrl = aiMetadata?.assets?.proofUrl;
  return isPersistentCartPreviewUrl(proofUrl) ? proofUrl : null;
};

const buildInitialPlacementPreview = (
  quote: QuoteState,
  productType: string,
  authoritativeWebPreviewUrl: string | null,
): PlacementPreviewManifest | undefined => {
  if (productType === 'yard_sign') return undefined;
  const placement = (quote as any).placementPreview as PlacementPreviewManifest | undefined;
  if (
    authoritativeWebPreviewUrl
    && placement?.uploadStatus === 'uploaded'
    && placement.url === authoritativeWebPreviewUrl
  ) {
    return placement;
  }
  return quote.file ? { uploadStatus: 'pending' } : undefined;
};
`,
  'add authoritative preview helpers',
);

replaceLiteral(
  cartPath,
  `        debugLog('📦 [CART STORE] This fileKey should be the CANVAS THUMBNAIL key (includes text/images)');

        const newItem: CartItem = {
`,
  `        debugLog('📦 [CART STORE] This fileKey should be the CANVAS THUMBNAIL key (includes text/images)');

        const authoritativeWebPreviewUrl = resolveAuthoritativeQuoteWebPreview(quote, aiMetadata);
        const initialPlacementPreview = buildInitialPlacementPreview(
          quote,
          activeProductType,
          authoritativeWebPreviewUrl,
        );

        const newItem: CartItem = {
`,
  'compute current add-to-cart preview identity',
);

replaceRegex(
  cartPath,
  /          web_preview_url: \(\(\) => \{\n            const explicitWebPreview = \(quote as any\)\.webPreviewUrl;\n            if \(explicitWebPreview && !explicitWebPreview\.startsWith\('blob:'\) && !explicitWebPreview\.startsWith\('data:'\)\) return explicitWebPreview;\n            return \(aiMetadata\?\.assets\?\.proofUrl\?\.startsWith\('blob:'\) \? null : aiMetadata\?\.assets\?\.proofUrl\) \|\| null;\n          \}\)\(\),/,
  `          web_preview_url: authoritativeWebPreviewUrl || undefined,`,
  'stop inheriting stale quote web preview',
);

replaceLiteral(
  cartPath,
  `          placement_preview: (quote as any).placementPreview || undefined,
`,
  `          placement_preview: initialPlacementPreview,
`,
  'initialize placement preview from current item only',
);

replaceLiteral(
  cartPath,
  `        // Use the file key from the uploaded file
        const fileKey = quote.file?.fileKey;

        // Update the item with new data
`,
  `        // Use the file key from the uploaded file
        const fileKey = quote.file?.fileKey;
        const updatedProductType = ((quote as any).product_type || existingItem.product_type || 'banner');
        const authoritativeWebPreviewUrl = resolveAuthoritativeQuoteWebPreview(quote, aiMetadata);
        const initialPlacementPreview = buildInitialPlacementPreview(
          quote,
          updatedProductType,
          authoritativeWebPreviewUrl,
        );

        // Update the item with new data
`,
  'compute current edited-item preview identity',
);

replaceLiteral(
  cartPath,
  `          web_preview_url: (quote as any).webPreviewUrl || aiMetadata?.assets?.proofUrl || existingItem.web_preview_url,
`,
  `          web_preview_url: authoritativeWebPreviewUrl || undefined,
`,
  'clear stale edited-item web preview',
);

replaceLiteral(
  cartPath,
  `          canvas_state_json: (quote as any).canvasStateJson || existingItem.canvas_state_json,
          // Design Service fields
`,
  `          canvas_state_json: (quote as any).canvasStateJson || existingItem.canvas_state_json,
          artwork_manifest: (quote as any).artworkManifest || existingItem.artwork_manifest,
          placement_preview: initialPlacementPreview,
          // Design Service fields
`,
  'refresh edited-item preview manifest',
);

replaceRegex(
  cartPath,
  /      updateItemWebPreview: \(itemId: string, webPreviewUrl: string\) => \{[\s\S]*?      \},\n      updatePlacementPreviewStatus:/,
  `      updateItemWebPreview: (itemId: string, webPreviewUrl: string) => {
        if (!itemId || !isPersistentCartPreviewUrl(webPreviewUrl)) return;
        let didUpdate = false;
        const uploadedAt = new Date().toISOString();
        set((state) => {
          const items = state.items.map(item => {
            if (item.id !== itemId) return item;
            didUpdate = true;
            return {
              ...item,
              web_preview_url: webPreviewUrl,
              placement_preview: {
                ...(item.placement_preview || {}),
                url: webPreviewUrl,
                uploadStatus: 'uploaded' as const,
                uploadedAt,
                error: null,
              },
            };
          });
          return { items };
        });
        if (!didUpdate) return;
        setTimeout(() => {
          get().syncToServer();
        }, 0);
      },
      updatePlacementPreviewStatus:`,
  'publish web preview and manifest atomically',
);

const checkoutPath = 'src/pages/Checkout.tsx';
replaceLiteral(
  checkoutPath,
  `import StripeCheckout from '@/components/checkout/StripeCheckout';
`,
  '',
  'remove Stripe checkout import',
);

replaceRegex(
  checkoutPath,
  /  \/\/ Feature flag to temporarily disable Stripe[\s\S]*?  const \[showPromoCode, setShowPromoCode\] = useState\(false\);/,
  `  const [showPromoCode, setShowPromoCode] = useState(false);`,
  'remove dead Stripe checkout state',
);

replaceRegex(
  checkoutPath,
  /                \{stripeAvailable \? \([\s\S]*?                \)\}\n\n                <div className="mt-4 border-t border-gray-100 pt-4">/,
  `                <div className="space-y-3" data-paypal-only-checkout="true">
                  <div className="space-y-2 rounded-lg border border-[#E7D9C7] bg-[#FCF7F0] p-3 shadow-sm">
                    <p className="text-xs text-gray-600">
                      Pay securely by card or PayPal. No PayPal account required.
                    </p>
                    <div className="flex justify-center">
                      <img
                        src="https://res.cloudinary.com/dtrxl120u/image/upload/v1778187843/8b1a7087-53d4-4389-a6b8-090268a31dd5_bscbcu.png"
                        alt="Accepted payment methods: Visa, Mastercard, American Express, Discover"
                        className="h-auto w-full max-w-[240px] sm:max-w-[280px] object-contain"
                        loading="eager"
                        decoding="async"
                      />
                    </div>
                  </div>
                  <PayPalCheckout
                    disabled={!canProceed}
                    total={totalCents}
                    onSuccess={handlePaymentSuccess}
                    onError={handlePaymentError}
                    cardFirstLayout
                  />
                </div>

                <div className="mt-4 border-t border-gray-100 pt-4">`,
  'render PayPal-only checkout without dead payment provider branch',
);

const paypalPath = 'src/components/checkout/PayPalCheckout.tsx';
replaceLiteral(
  paypalPath,
  `import React, { useState, useEffect, useRef } from 'react';
`,
  `import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
`,
  'add PayPal preparation hooks',
);
replaceLiteral(
  paypalPath,
  `import { getStoredAttribution } from '@/lib/attribution';
`,
  `import { getStoredAttribution } from '@/lib/attribution';
import { buildPayPalCheckoutSignature } from '@/lib/paypalCheckoutPreparation';
`,
  'import PayPal checkout signature helper',
);

replaceLiteral(
  paypalPath,
  `const trackCheckoutPaymentClick = (method: 'card' | 'paypal') => {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', 'payment_button_click', {
    payment_method: method,
    device_type: window.innerWidth < 768 ? 'mobile' : 'desktop',
  });
};
`,
  `const trackCheckoutPaymentClick = (method: 'card' | 'paypal') => {
  if (typeof window === 'undefined' || !window.gtag) return;
  window.gtag('event', 'payment_button_click', {
    payment_method: method,
    device_type: window.innerWidth < 768 ? 'mobile' : 'desktop',
  });
};

const getImmediatePayPalConfig = (): PayPalConfig | null => {
  const clientId = getFirstNonEmpty(
    import.meta.env.VITE_PAYPAL_CLIENT_ID,
    import.meta.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID,
  );
  if (!clientId) return null;
  const environment = String(import.meta.env.VITE_PAYPAL_ENV || 'live').toLowerCase() === 'sandbox'
    ? 'sandbox'
    : 'live';
  return { enabled: true, clientId, environment };
};

const serializePayPalItems = (items: any[]) => items.map(item => ({
  width_in: item.width_in,
  height_in: item.height_in,
  quantity: item.quantity,
  material: item.material,
  grommets: item.grommets,
  pole_pockets: item.pole_pockets,
  pole_pocket_position: item.pole_pocket_position,
  rounded_corners: item.rounded_corners,
  pole_pocket_size: item.pole_pocket_size,
  pole_pocket_cost_cents: item.pole_pocket_cost_cents,
  rope_feet: item.rope_feet,
  rope_placement: item.rope_placement,
  rope_cost_cents: item.rope_cost_cents,
  area_sqft: item.area_sqft,
  unit_price_cents: item.unit_price_cents,
  line_total_cents: item.line_total_cents,
  file_key: item.file_key,
  file_name: item.file_name,
  file_url: item.file_url,
  is_pdf: item.is_pdf,
  artwork_manifest: item.artwork_manifest,
  placement_preview: item.placement_preview,
  text_elements: item.text_elements,
  overlay_image: item.overlay_image,
  overlay_images: item.overlay_images,
  canvas_background_color: item.canvas_background_color,
  image_scale: item.image_scale,
  image_scale_y: item.image_scale_y,
  thumbnail_url: item.thumbnail_url,
  web_preview_url: item.web_preview_url,
  image_position: item.image_position,
  fit_mode: item.fit_mode,
  final_render_url: item.final_render_url,
  final_render_file_key: item.final_render_file_key,
  final_render_width_px: item.final_render_width_px,
  final_render_height_px: item.final_render_height_px,
  final_render_dpi: item.final_render_dpi,
  canvas_state_json: item.canvas_state_json,
  design_service_enabled: item.design_service_enabled,
  design_request_text: item.design_request_text,
  design_draft_preference: item.design_draft_preference,
  design_draft_contact: item.design_draft_contact,
  design_uploaded_assets: item.design_uploaded_assets,
  product_type: item.product_type || 'banner',
  yard_sign_sidedness: item.yard_sign_sidedness,
  yard_sign_step_stakes_enabled: item.yard_sign_step_stakes_enabled,
  yard_sign_step_stakes_qty: item.yard_sign_step_stakes_qty,
  yard_sign_design_count: item.yard_sign_design_count,
  yard_sign_designs: item.yard_sign_designs,
  yard_sign_signs_subtotal_cents: item.yard_sign_signs_subtotal_cents,
  yard_sign_stakes_subtotal_cents: item.yard_sign_stakes_subtotal_cents,
}));

type PreparedPayPalOrder = {
  signature: string;
  internalOrderId: string;
  paypalOrderId: string;
};
`,
  'add PayPal preparation helpers',
);

replaceRegex(
  paypalPath,
  /const PayPalCheckout: React\.FC<PayPalCheckoutProps> = \(\{ total, onSuccess, onError, disabled = false, cardFirstLayout = false \}\) => \{[\s\S]*?\n  \/\/ Admin test payment handler/,
  `const PayPalCheckout: React.FC<PayPalCheckoutProps> = ({ total, onSuccess, onError, disabled = false, cardFirstLayout = false }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  const { items, discountCode, sameDayHitService, saturdayDelivery } = useCartStore();
  const immediateConfig = useMemo(getImmediatePayPalConfig, []);
  const [paypalConfig, setPaypalConfig] = useState<PayPalConfig | null>(immediateConfig);
  const [isLoadingConfig, setIsLoadingConfig] = useState(!immediateConfig);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [isCapturingPayment, setIsCapturingPayment] = useState(false);
  const isDeployPreview = shouldUseDeployPreviewTestCheckout();
  const guestEmailRef = useRef(\`guest-\${Date.now()}-\${crypto.randomUUID().slice(0, 8)}@bannersonthefly.com\`);
  const checkoutEmail = user?.email || guestEmailRef.current;
  const internalOrderIdRef = useRef<string | null>(null);
  const checkoutIdempotencyKeyRef = useRef<string>(crypto.randomUUID());

  const checkoutSignature = useMemo(() => buildPayPalCheckoutSignature({
    totalCents: total,
    userId: user?.id || null,
    email: checkoutEmail,
    items: items as unknown as Array<Record<string, unknown>>,
    discountCode: discountCode as unknown as Record<string, unknown> | null,
    sameDayHitService: !!sameDayHitService,
    saturdayDelivery: !!saturdayDelivery,
  }), [total, user?.id, checkoutEmail, items, discountCode, sameDayHitService, saturdayDelivery]);

  const activeSignatureRef = useRef(checkoutSignature);
  const preparationGenerationRef = useRef(0);
  const preparedOrderRef = useRef<PreparedPayPalOrder | null>(null);
  const preparationRef = useRef<{
    signature: string;
    promise: Promise<PreparedPayPalOrder>;
    controller: AbortController;
  } | null>(null);

  const resetPreparation = useCallback((nextSignature: string) => {
    if (activeSignatureRef.current === nextSignature) return;
    preparationGenerationRef.current += 1;
    preparationRef.current?.controller.abort();
    preparationRef.current = null;
    preparedOrderRef.current = null;
    internalOrderIdRef.current = null;
    checkoutIdempotencyKeyRef.current = crypto.randomUUID();
    activeSignatureRef.current = nextSignature;
  }, []);

  const preparePayPalOrder = useCallback(async (): Promise<PreparedPayPalOrder> => {
    resetPreparation(checkoutSignature);

    const prepared = preparedOrderRef.current;
    if (prepared?.signature === checkoutSignature) return prepared;

    const existing = preparationRef.current;
    if (existing?.signature === checkoutSignature) return existing.promise;

    const controller = new AbortController();
    const generation = preparationGenerationRef.current;
    const signature = checkoutSignature;
    const idempotencyKey = checkoutIdempotencyKeyRef.current;

    const promise = (async () => {
      let internalOrderId = internalOrderIdRef.current;
      if (!internalOrderId) {
        const pendingResponse = await fetch('/.netlify/functions/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: controller.signal,
          body: JSON.stringify({
            user_id: user?.id || null,
            email: checkoutEmail,
            subtotal_cents: total,
            tax_cents: 0,
            total_cents: total,
            currency: 'usd',
            payment_method: 'paypal',
            payment_status: 'pending',
            checkout_idempotency_key: idempotencyKey,
            items,
            discountCode,
            sameDayHitService: !!sameDayHitService,
            saturdayDelivery: !!saturdayDelivery,
            attribution: getStoredAttribution(),
          }),
        });
        const pending = await pendingResponse.json().catch(() => ({}));
        if (!pendingResponse.ok || !pending.orderId) {
          throw new Error(pending.message || pending.error || 'Could not safely persist the order before payment');
        }
        if (generation !== preparationGenerationRef.current || signature !== activeSignatureRef.current) {
          throw new Error('Checkout changed while payment was preparing.');
        }
        internalOrderId = pending.orderId;
        internalOrderIdRef.current = internalOrderId;
      }

      const response = await fetch('/.netlify/functions/paypal-create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          totalCents: total,
          items: serializePayPalItems(items),
          email: checkoutEmail,
          user_id: user?.id || null,
          discountCode: discountCode ? {
            code: discountCode.code,
            discountPercentage: discountCode.discountPercentage,
            discountAmountCents: discountCode.discountAmountCents,
          } : null,
          sameDayHitService: !!sameDayHitService,
          saturdayDelivery: !!saturdayDelivery,
          attribution: getStoredAttribution(),
          internalOrderId,
        }),
      });

      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.paypalOrderId) {
        throw new Error(result.error || result.message || 'Failed to create PayPal order');
      }
      if (generation !== preparationGenerationRef.current || signature !== activeSignatureRef.current) {
        throw new Error('Checkout changed while payment was preparing.');
      }

      const nextPrepared = {
        signature,
        internalOrderId,
        paypalOrderId: result.paypalOrderId,
      };
      preparedOrderRef.current = nextPrepared;
      return nextPrepared;
    })();

    preparationRef.current = { signature, promise, controller };
    try {
      return await promise;
    } finally {
      if (preparationRef.current?.promise === promise) preparationRef.current = null;
    }
  }, [checkoutSignature, resetPreparation, user?.id, checkoutEmail, total, items, discountCode, sameDayHitService, saturdayDelivery]);

  useEffect(() => {
    if (isDeployPreview) {
      setPaypalConfig(null);
      setIsLoadingConfig(false);
      return;
    }

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 4000);
    const loadPayPalConfig = async () => {
      try {
        const response = await fetch('/.netlify/functions/paypal-config', { signal: controller.signal });
        if (!response.ok) throw new Error(\`Failed to load PayPal config: \${response.status}\`);
        const config = await response.json();
        if (!config?.enabled || !config?.clientId) throw new Error('PayPal is not configured.');
        setPaypalConfig((current) => (
          current?.enabled === config.enabled
          && current?.clientId === config.clientId
          && current?.environment === config.environment
            ? current
            : config
        ));
      } catch (error) {
        if (!immediateConfig) {
          console.error('[PayPalCheckout] Unable to load PayPal configuration:', error);
          setPaypalConfig({ enabled: false, clientId: null, environment: null });
        }
      } finally {
        window.clearTimeout(timeoutId);
        setIsLoadingConfig(false);
      }
    };

    void loadPayPalConfig();
    return () => {
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [isDeployPreview, immediateConfig]);

  useEffect(() => {
    resetPreparation(checkoutSignature);
  }, [checkoutSignature, resetPreparation]);

  useEffect(() => () => {
    preparationRef.current?.controller.abort();
  }, []);

  // Prepare the exact pending application order and PayPal order while the
  // customer is reading the payment section. The card click then returns an
  // already-created PayPal order ID instead of waiting through two network hops.
  useEffect(() => {
    if (
      isDeployPreview
      || disabled
      || isLoadingConfig
      || !paypalConfig?.enabled
      || !paypalConfig.clientId
      || total <= 0
      || items.length === 0
    ) return;

    const timer = window.setTimeout(() => {
      void preparePayPalOrder().catch((error) => {
        if ((error as { name?: string })?.name !== 'AbortError') {
          console.info('[PayPalCheckout] Background payment preparation will retry on click.');
        }
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [isDeployPreview, disabled, isLoadingConfig, paypalConfig, total, items.length, preparePayPalOrder]);

  // Admin test payment handler`,
  'replace PayPal initialization with immediate SDK config and prepared order pipeline',
);

replaceRegex(
  paypalPath,
  /  \/\/ PayPal order creation handler\n  const handleCreateOrder = async \(\) => \{[\s\S]*?\n  \/\/ PayPal order approval handler/,
  `  // PayPal order creation handler. In the normal path the background
  // preparation has already finished, so this resolves immediately.
  const handleCreateOrder = async () => {
    try {
      setIsCreatingOrder(true);
      const prepared = await preparePayPalOrder();
      return prepared.paypalOrderId;
    } catch (error) {
      console.error('PayPal create order error:', error);
      const isDev = import.meta.env.DEV || window.location.hostname === 'localhost';
      if (isDev) return \`DEV_ORDER_\${Date.now()}\`;
      throw error;
    } finally {
      setIsCreatingOrder(false);
    }
  };

  // PayPal order approval handler`,
  'use prepared PayPal order on click',
);

let paypalContent = read(paypalPath);
paypalContent = paypalContent.replaceAll("user?.email || `guest-${Date.now()}@bannersonthefly.com`", 'checkoutEmail');
write(paypalPath, paypalContent);

replaceRegex(
  paypalPath,
  /  const initialOptions = \{\n    clientId: paypalConfig\.clientId!,[\s\S]*?  \};/,
  `  const initialOptions = useMemo(() => ({
    clientId: paypalConfig.clientId!,
    currency: 'USD',
    intent: 'capture' as const,
    commit: true,
    vault: false,
    enableFunding: 'card' as any,
    disableFunding: 'paylater,credit' as any,
  }), [paypalConfig.clientId]);`,
  'stabilize and eagerly enable PayPal card SDK options',
);

replaceLiteral(
  paypalPath,
  `                disabled={disabled || isCreatingOrder || isCapturingPayment}
                onClick={() => trackCheckoutPaymentClick('card')}
`,
  `                disabled={disabled || isCreatingOrder || isCapturingPayment}
                onInit={() => { void preparePayPalOrder().catch(() => undefined); }}
                onClick={() => trackCheckoutPaymentClick('card')}
`,
  'prewarm card checkout when PayPal button initializes',
);
replaceLiteral(
  paypalPath,
  `                disabled={disabled || isCreatingOrder || isCapturingPayment}
                onClick={() => trackCheckoutPaymentClick('paypal')}
`,
  `                disabled={disabled || isCreatingOrder || isCapturingPayment}
                onInit={() => { void preparePayPalOrder().catch(() => undefined); }}
                onClick={() => trackCheckoutPaymentClick('paypal')}
`,
  'prewarm PayPal checkout when button initializes',
);
replaceLiteral(
  paypalPath,
  `              disabled={disabled || isCreatingOrder || isCapturingPayment}
              createOrder={async (data, actions) => {
`,
  `              disabled={disabled || isCreatingOrder || isCapturingPayment}
              onInit={() => { void preparePayPalOrder().catch(() => undefined); }}
              createOrder={async (data, actions) => {
`,
  'prewarm default PayPal button',
);

const indexPath = 'index.html';
replaceLiteral(
  indexPath,
  `    <link rel="preconnect" href="https://res.cloudinary.com" crossorigin>
    <link rel="dns-prefetch" href="https://res.cloudinary.com">
`,
  `    <link rel="preconnect" href="https://res.cloudinary.com" crossorigin>
    <link rel="dns-prefetch" href="https://res.cloudinary.com">
    <link rel="preconnect" href="https://www.paypal.com" crossorigin>
    <link rel="preconnect" href="https://www.paypalobjects.com" crossorigin>
    <link rel="dns-prefetch" href="https://www.paypal.com">
    <link rel="dns-prefetch" href="https://www.paypalobjects.com">
`,
  'preconnect PayPal checkout origins',
);

const paypalOnlyTest = 'netlify/functions/__tests__/checkout-paypal-only.test.cjs';
replaceLiteral(
  paypalOnlyTest,
  `test('legacy card component cannot load or call a non-PayPal payment SDK', () => {
`,
  `test('checkout page imports and renders PayPal only', () => {
  const checkout = read('src/pages/Checkout.tsx');
  assert.equal(checkout.includes("import StripeCheckout"), false);
  assert.equal(checkout.includes('stripeAvailable'), false);
  assert.equal(checkout.includes('<StripeCheckout'), false);
  assert.match(checkout, /data-paypal-only-checkout/);
});

test('legacy card component cannot load or call a non-PayPal payment SDK', () => {
`,
  'assert live checkout cannot load Stripe',
);

const previewPipelineTest = 'netlify/functions/__tests__/preview-pipeline.test.cjs';
replaceLiteral(
  previewPipelineTest,
  `test('cart thumbnails render immediately without an idle skeleton swap', () => {
`,
  `test('upload completion does not wait for a second CDN image download before enabling checkout', () => {
  for (const pagePath of ['src/pages/Design.tsx', 'src/pages/GoogleAdsBanner.tsx']) {
    const page = read(pagePath);
    assert.equal(page.includes('await preloadImage(productionUrl)'), false);
    assert.equal(page.includes('const preloadImage = (url: string)'), false);
    assert.match(page, /thumbnailUrl: previewUrl/);
    assert.match(page, /previewUrl,/);
  }
});

test('PayPal checkout prepares the order before the card click and keeps a stable SDK instance', () => {
  const paypal = read('src/components/checkout/PayPalCheckout.tsx');
  assert.match(paypal, /preparePayPalOrder/);
  assert.match(paypal, /preparedOrderRef/);
  assert.match(paypal, /preparationRef/);
  assert.match(paypal, /buildPayPalCheckoutSignature/);
  assert.match(paypal, /const initialOptions = useMemo/);
  assert.match(paypal, /enableFunding: 'card'/);
});

test('cart preview persistence cannot inherit an unrelated quote web preview', () => {
  const cart = read('src/store/cart.ts');
  assert.match(cart, /resolveAuthoritativeQuoteWebPreview/);
  assert.match(cart, /placement_preview: initialPlacementPreview/);
  assert.equal(cart.includes('const explicitWebPreview = (quote as any).webPreviewUrl'), false);
});

test('cart thumbnails render immediately without an idle skeleton swap', () => {
`,
  'add upload, PayPal, and preview integrity source regressions',
);

const workflowPath = '.github/workflows/order-email-tracking-regressions.yml';
replaceLiteral(
  workflowPath,
  `            src/lib/sessionArtworkPreviewSource.test.ts \\
            src/lib/order-thumbnail.test.ts \\
`,
  `            src/lib/sessionArtworkPreviewSource.test.ts \\
            src/lib/paypalCheckoutPreparation.test.ts \\
            src/lib/order-thumbnail.test.ts \\
`,
  'run PayPal preparation unit tests',
);

console.log('Applied checkout speed and preview integrity hotfix to:');
for (const path of [...changed].sort()) console.log(` - ${path}`);
