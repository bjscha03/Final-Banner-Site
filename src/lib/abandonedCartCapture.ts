import type { CartItem } from '@/store/cart';

export type AbandonedCartStage = 'cart' | 'checkout' | 'contact' | 'payment_started';

export type AbandonedCartContact = {
  email?: string | null;
  phone?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type AbandonedCartTotals = {
  subtotalCents?: number | null;
  discountCents?: number | null;
  taxCents?: number | null;
  estimatedTotalCents?: number | null;
};

const ABANDONED_CART_ID_STORAGE_KEY = 'bof-abandoned-cart-id-v1';
const ABANDONED_CART_RECOVERY_ATTRIBUTION_STORAGE_KEY = 'bof-abandoned-cart-recovery-attribution-v1';
export const ABANDONED_CART_SNAPSHOT_MAX_ITEMS = 40;
// Fetch keepalive bodies are capped near 64 KiB in modern browsers. Keep the
// complete JSON request comfortably below that limit so a pagehide flush does
// not silently discard artwork-heavy carts.
export const ABANDONED_CART_SNAPSHOT_MAX_JSON_BYTES = 48_000;
export const ABANDONED_CART_SNAPSHOT_METADATA_KEY = '__bof_abandoned_cart_snapshot_v1';
const MAX_ITEM_JSON_BYTES = 8_000;
const MAX_OBJECT_KEYS = 80;
const MAX_ARRAY_ITEMS = 60;
const MAX_DEPTH = 6;
const MAX_STRING_LENGTH = 4_096;
const MAX_SCENE_STRING_LENGTH = 4_000;

type AbandonedCartSnapshotMetadata = {
  version: 1;
  sourceItemCount: number;
  storedItemCount: number;
  complete: boolean;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SIGNED_RECOVERY_TOKEN_PATTERN = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const OMITTED_KEYS = new Set([
  'canvas_snapshot',
  'raw_file',
  'rawFile',
  'file_buffer',
  'fileBuffer',
  '__proto__',
  'constructor',
  'prototype',
]);

const OPTIONAL_ARTWORK_KEYS = new Set([
  'aiDesign',
  'artwork_manifest',
  'canvas_state_json',
  'design_request_text',
  'design_uploaded_assets',
  'file_url',
  'final_render_url',
  'overlay_image',
  'overlay_images',
  'placement_preview',
  'print_ready_url',
  'text_elements',
  'thumbnail_url',
  'web_preview_url',
  'yard_sign_designs',
]);

const jsonByteLength = (value: unknown): number => {
  const serialized = JSON.stringify(value);
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(serialized).byteLength;
  return serialized.length;
};

const boundedUtf8String = (value: unknown, maxBytes: number): string | null => {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  let result = '';
  let resultBytes = 0;
  for (const character of String(value)) {
    const characterBytes = jsonByteLength(character) - 2;
    if (resultBytes + characterBytes > maxBytes) break;
    result += character;
    resultBytes += characterBytes;
  }
  return result || null;
};

const isUnsafeInlineUrl = (value: string): boolean => (
  value.startsWith('blob:') || value.startsWith('data:')
);

const stringLimitForKey = (key: string): number => (
  key === 'canvas_state_json' ? MAX_SCENE_STRING_LENGTH : MAX_STRING_LENGTH
);

const sanitizeUnknown = (value: unknown, key = '', depth = 0): unknown => {
  if (value == null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    if ((key.toLowerCase().includes('url') || key.toLowerCase().includes('src')) && isUnsafeInlineUrl(value)) {
      return null;
    }
    return value.slice(0, stringLimitForKey(key));
  }
  if (depth >= MAX_DEPTH) return null;
  if (Array.isArray(value)) {
    return value
      .slice(0, MAX_ARRAY_ITEMS)
      .map((entry) => sanitizeUnknown(entry, key, depth + 1));
  }
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [entryKey, entryValue] of Object.entries(value).slice(0, MAX_OBJECT_KEYS)) {
      if (OMITTED_KEYS.has(entryKey)) continue;
      result[entryKey] = sanitizeUnknown(entryValue, entryKey, depth + 1);
    }
    return result;
  }
  return null;
};

const finiteNumber = (value: unknown, fallback = 0): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const compactArtworkManifest = (value: CartItem['artwork_manifest']): Record<string, unknown> | null => (
  value ? {
    originalUrl: sanitizeUnknown(value.originalUrl, 'originalUrl'),
    publicId: String(value.publicId || '').slice(0, 512),
    assetId: value.assetId ? String(value.assetId).slice(0, 512) : null,
    version: finiteNumber(value.version),
    resourceType: String(value.resourceType || '').slice(0, 80),
    format: String(value.format || '').slice(0, 40),
    mimeType: String(value.mimeType || '').slice(0, 100),
    originalFilename: String(value.originalFilename || '').slice(0, 255),
    bytes: finiteNumber(value.bytes),
    width: finiteNumber(value.width),
    height: finiteNumber(value.height),
    sha256: value.sha256 ? String(value.sha256).slice(0, 128) : null,
    uploadStatus: value.uploadStatus,
    uploadedAt: String(value.uploadedAt || '').slice(0, 80),
  } : null
);

const compactPlacementPreview = (value: CartItem['placement_preview']): Record<string, unknown> | null => (
  value ? {
    version: finiteNumber(value.version),
    sourceIdentity: value.sourceIdentity ? String(value.sourceIdentity).slice(0, 512) : null,
    sourceUrl: sanitizeUnknown(value.sourceUrl, 'sourceUrl'),
    productType: value.productType ? String(value.productType).slice(0, 80) : null,
    widthIn: finiteNumber(value.widthIn),
    heightIn: finiteNumber(value.heightIn),
    fitMode: value.fitMode || null,
    positionPct: sanitizeUnknown(value.positionPct, 'positionPct'),
    scaleX: finiteNumber(value.scaleX, 1),
    scaleY: finiteNumber(value.scaleY, 1),
    compositionRevision: finiteNumber(value.compositionRevision),
    compositionSignature: value.compositionSignature
      ? String(value.compositionSignature).slice(0, 512)
      : null,
    url: sanitizeUnknown(value.url, 'url'),
    publicId: value.publicId ? String(value.publicId).slice(0, 512) : null,
    previewUrl: sanitizeUnknown(value.previewUrl, 'previewUrl'),
    previewPublicId: value.previewPublicId ? String(value.previewPublicId).slice(0, 512) : null,
    previewWidthPx: finiteNumber(value.previewWidthPx),
    previewHeightPx: finiteNumber(value.previewHeightPx),
    uploadStatus: value.uploadStatus,
  } : null
);

const snapshotSummary = (item: CartItem): Record<string, unknown> => ({
  id: String(item.id || '').slice(0, 200),
  product_type: String(item.product_type || 'banner').slice(0, 80),
  width_in: finiteNumber(item.width_in),
  height_in: finiteNumber(item.height_in),
  quantity: Math.max(1, Math.round(finiteNumber(item.quantity, 1))),
  material: String(item.material || '').slice(0, 100),
  grommets: String(item.grommets || '').slice(0, 100),
  pole_pockets: String(item.pole_pockets || '').slice(0, 100),
  pole_pocket_size: item.pole_pocket_size ? String(item.pole_pocket_size).slice(0, 40) : null,
  pole_pocket_position: item.pole_pocket_position ? String(item.pole_pocket_position).slice(0, 80) : null,
  rounded_corners: item.rounded_corners ? String(item.rounded_corners).slice(0, 80) : null,
  rope_feet: finiteNumber(item.rope_feet),
  rope_placement: item.rope_placement ? String(item.rope_placement).slice(0, 80) : null,
  area_sqft: finiteNumber(item.area_sqft),
  unit_price_cents: Math.round(finiteNumber(item.unit_price_cents)),
  rope_cost_cents: Math.round(finiteNumber(item.rope_cost_cents)),
  pole_pocket_cost_cents: Math.round(finiteNumber(item.pole_pocket_cost_cents)),
  rope_pricing_mode: item.rope_pricing_mode || null,
  pole_pocket_pricing_mode: item.pole_pocket_pricing_mode || null,
  line_total_cents: Math.round(finiteNumber(item.line_total_cents)),
  file_key: item.file_key ? String(item.file_key).slice(0, 512) : null,
  file_name: item.file_name ? String(item.file_name).slice(0, 255) : null,
  file_url: sanitizeUnknown(item.file_url, 'file_url'),
  thumbnail_url: sanitizeUnknown(item.thumbnail_url, 'thumbnail_url'),
  web_preview_url: sanitizeUnknown(item.web_preview_url, 'web_preview_url'),
  print_ready_url: sanitizeUnknown(item.print_ready_url, 'print_ready_url'),
  is_pdf: Boolean(item.is_pdf),
  final_render_url: sanitizeUnknown(item.final_render_url, 'final_render_url'),
  final_render_file_key: item.final_render_file_key ? String(item.final_render_file_key).slice(0, 512) : null,
  final_render_width_px: finiteNumber(item.final_render_width_px),
  final_render_height_px: finiteNumber(item.final_render_height_px),
  final_render_dpi: finiteNumber(item.final_render_dpi),
  artwork_manifest: compactArtworkManifest(item.artwork_manifest),
  placement_preview: compactPlacementPreview(item.placement_preview),
  yard_sign_sidedness: item.yard_sign_sidedness || null,
  yard_sign_step_stakes_enabled: Boolean(item.yard_sign_step_stakes_enabled),
  yard_sign_step_stakes_qty: finiteNumber(item.yard_sign_step_stakes_qty),
  yard_sign_design_count: finiteNumber(item.yard_sign_design_count),
  yard_sign_designs: item.yard_sign_designs?.slice(0, 20).map((design) => ({
    id: String(design.id || '').slice(0, 200),
    fileName: String(design.fileName || '').slice(0, 255),
    fileUrl: sanitizeUnknown(design.fileUrl, 'fileUrl'),
    fileKey: String(design.fileKey || '').slice(0, 512),
    thumbnailUrl: sanitizeUnknown(design.thumbnailUrl, 'thumbnailUrl'),
    isPdf: Boolean(design.isPdf),
    quantity: Math.max(1, Math.round(finiteNumber(design.quantity, 1))),
    placementPreview: compactPlacementPreview(design.placementPreview),
  })) || null,
  yard_sign_signs_subtotal_cents: Math.round(finiteNumber(item.yard_sign_signs_subtotal_cents)),
  yard_sign_stakes_subtotal_cents: Math.round(finiteNumber(item.yard_sign_stakes_subtotal_cents)),
  design_service_enabled: Boolean(item.design_service_enabled),
  sameDayHitServiceSelected: Boolean(item.sameDayHitServiceSelected),
  sameDayHitServicePrice: Math.round(finiteNumber(item.sameDayHitServicePrice)),
  has_artwork: cartItemHasArtwork(item),
});

const stripOptionalArtworkPayloads = (
  item: Record<string, unknown>,
): Record<string, unknown> => {
  const result = { ...item };
  for (const key of OPTIONAL_ARTWORK_KEYS) delete result[key];
  return result;
};

const commerceSnapshotSummary = (item: CartItem): Record<string, unknown> => ({
  id: boundedUtf8String(item.id, 96) || 'recovered-item',
  product_type: boundedUtf8String(item.product_type || 'banner', 48) || 'banner',
  width_in: finiteNumber(item.width_in),
  height_in: finiteNumber(item.height_in),
  quantity: Math.max(1, Math.round(finiteNumber(item.quantity, 1))),
  material: boundedUtf8String(item.material, 64) || '',
  grommets: boundedUtf8String(item.grommets, 64) || 'none',
  pole_pockets: boundedUtf8String(item.pole_pockets, 64) || 'none',
  pole_pocket_size: boundedUtf8String(item.pole_pocket_size, 32),
  pole_pocket_position: boundedUtf8String(item.pole_pocket_position, 48),
  rounded_corners: boundedUtf8String(item.rounded_corners, 48),
  rope_feet: finiteNumber(item.rope_feet),
  rope_placement: boundedUtf8String(item.rope_placement, 48),
  area_sqft: finiteNumber(item.area_sqft),
  unit_price_cents: Math.round(finiteNumber(item.unit_price_cents)),
  rope_cost_cents: Math.round(finiteNumber(item.rope_cost_cents)),
  pole_pocket_cost_cents: Math.round(finiteNumber(item.pole_pocket_cost_cents)),
  rope_pricing_mode: boundedUtf8String(item.rope_pricing_mode, 32),
  pole_pocket_pricing_mode: boundedUtf8String(item.pole_pocket_pricing_mode, 32),
  line_total_cents: Math.round(finiteNumber(item.line_total_cents)),
  yard_sign_sidedness: boundedUtf8String(item.yard_sign_sidedness, 32),
  yard_sign_step_stakes_enabled: Boolean(item.yard_sign_step_stakes_enabled),
  yard_sign_step_stakes_qty: finiteNumber(item.yard_sign_step_stakes_qty),
  yard_sign_design_count: finiteNumber(item.yard_sign_design_count),
  yard_sign_signs_subtotal_cents: Math.round(finiteNumber(item.yard_sign_signs_subtotal_cents)),
  yard_sign_stakes_subtotal_cents: Math.round(finiteNumber(item.yard_sign_stakes_subtotal_cents)),
  design_service_enabled: Boolean(item.design_service_enabled),
  sameDayHitServiceSelected: Boolean(item.sameDayHitServiceSelected),
  sameDayHitServicePrice: Math.round(finiteNumber(item.sameDayHitServicePrice)),
  has_artwork: cartItemHasArtwork(item),
});

const COMMERCE_COMPACTION_KEYS = [
  'area_sqft',
  'rope_pricing_mode',
  'pole_pocket_pricing_mode',
  'rounded_corners',
  'pole_pocket_size',
  'pole_pocket_position',
  'rope_placement',
  'yard_sign_design_count',
  'yard_sign_signs_subtotal_cents',
  'yard_sign_stakes_subtotal_cents',
  'sameDayHitServicePrice',
  'unit_price_cents',
  'rope_cost_cents',
  'pole_pocket_cost_cents',
] as const;

const withSnapshotMetadata = (
  items: Record<string, unknown>[],
  sourceItemCount: number,
): Record<string, unknown>[] => {
  if (items.length === 0) return [];
  const result = items.map((item) => ({ ...item }));
  const metadata: AbandonedCartSnapshotMetadata = {
    version: 1,
    sourceItemCount,
    storedItemCount: result.length,
    complete: sourceItemCount === result.length,
  };
  // Put the marker first so the server's generic bounded object sanitizer
  // preserves it even when a future CartItem grows to the maximum key count.
  // Reassign after the spread so an untrusted colliding field cannot win.
  result[0] = { [ABANDONED_CART_SNAPSHOT_METADATA_KEY]: metadata, ...result[0] };
  result[0][ABANDONED_CART_SNAPSHOT_METADATA_KEY] = metadata;
  return result;
};

const fitCommerceSummaries = (
  items: CartItem[],
  sourceItemCount: number,
): Record<string, unknown>[] => {
  const summaries = items.map(commerceSnapshotSummary);
  let result = withSnapshotMetadata(summaries, sourceItemCount);
  for (const key of COMMERCE_COMPACTION_KEYS) {
    if (jsonByteLength(result) <= ABANDONED_CART_SNAPSHOT_MAX_JSON_BYTES) return result;
    for (const summary of summaries) delete summary[key];
    result = withSnapshotMetadata(summaries, sourceItemCount);
  }
  return result;
};

export const normalizeCaptureEmail = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 254 || !EMAIL_PATTERN.test(normalized)) return null;
  return normalized;
};

export const normalizeCapturePhone = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return null;
  return trimmed.startsWith('+') ? `+${digits}` : digits;
};

export const normalizeCaptureName = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().replace(/\s+/g, ' ').slice(0, 100);
  return normalized || null;
};

export const normalizeCaptureContact = (
  value?: AbandonedCartContact | null,
): Required<AbandonedCartContact> => ({
  email: normalizeCaptureEmail(value?.email),
  phone: normalizeCapturePhone(value?.phone),
  firstName: normalizeCaptureName(value?.firstName),
  lastName: normalizeCaptureName(value?.lastName),
});

export const cartItemHasArtwork = (item: Partial<CartItem> | Record<string, unknown>): boolean => {
  const candidate = item as Record<string, unknown>;
  return Boolean(
    candidate.has_artwork === true
    || candidate.file_key
    || candidate.file_url
    || candidate.thumbnail_url
    || candidate.web_preview_url
    || candidate.print_ready_url
    || candidate.final_render_url
    || candidate.final_render_file_key
    || candidate.artwork_manifest
    || candidate.placement_preview
    || (Array.isArray(candidate.yard_sign_designs) && candidate.yard_sign_designs.length > 0)
    || (Array.isArray(candidate.design_uploaded_assets) && candidate.design_uploaded_assets.length > 0),
  );
};

export const sanitizeSnapshotItems = (items: CartItem[]): Record<string, unknown>[] => {
  const supportedItems = items.slice(0, ABANDONED_CART_SNAPSHOT_MAX_ITEMS);
  const result: Record<string, unknown>[] = [];

  for (const item of supportedItems) {
    const broadlySanitized = sanitizeUnknown(item) as Record<string, unknown>;
    // Future snapshots always carry explicit per-item knowledge. Historical
    // rows that predate this field remain nullable in the Admin response.
    broadlySanitized.has_artwork = cartItemHasArtwork(item);
    let safeItem = broadlySanitized;
    if (jsonByteLength(safeItem) > MAX_ITEM_JSON_BYTES) {
      // Artwork scenes and previews are useful but optional for recovery. Drop
      // them before falling back to a smaller commerce-only representation.
      safeItem = stripOptionalArtworkPayloads(safeItem);
    }
    if (jsonByteLength(safeItem) > MAX_ITEM_JSON_BYTES) {
      safeItem = snapshotSummary(item);
    }
    if (jsonByteLength(safeItem) > MAX_ITEM_JSON_BYTES) {
      safeItem = commerceSnapshotSummary(item);
    }
    result.push(safeItem);
  }

  let withMetadata = withSnapshotMetadata(result, items.length);
  if (jsonByteLength(withMetadata) <= ABANDONED_CART_SNAPSHOT_MAX_JSON_BYTES) {
    return withMetadata;
  }

  // A single artwork-heavy line must not consume the global budget and make
  // later lines disappear. Strip optional artwork from every line first.
  withMetadata = withSnapshotMetadata(result.map(stripOptionalArtworkPayloads), items.length);
  if (jsonByteLength(withMetadata) <= ABANDONED_CART_SNAPSHOT_MAX_JSON_BYTES) {
    return withMetadata;
  }

  // Commerce summaries retain every supported line. The final compaction only
  // removes secondary pricing/configuration detail; identity, product,
  // dimensions, quantity, material, primary options, line total, and artwork
  // knowledge always remain.
  return fitCommerceSummaries(supportedItems, items.length);
};

const getSessionStorage = (): Storage | null => {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    return null;
  }
};

export const readStoredAbandonedCartId = (storage = getSessionStorage()): string | null => {
  if (!storage) return null;
  try {
    const value = storage.getItem(ABANDONED_CART_ID_STORAGE_KEY);
    return value && UUID_PATTERN.test(value) ? value : null;
  } catch {
    return null;
  }
};

export const writeStoredAbandonedCartId = (
  value: string | null,
  storage = getSessionStorage(),
): void => {
  if (!storage) return;
  try {
    if (value && UUID_PATTERN.test(value)) {
      storage.setItem(ABANDONED_CART_ID_STORAGE_KEY, value);
    } else {
      storage.removeItem(ABANDONED_CART_ID_STORAGE_KEY);
    }
  } catch {
    // Storage restrictions must never block checkout.
  }
};

export type AbandonedCartRecoveryAttribution = {
  cartId: string;
  token: string;
};

export type AbandonedCartPaymentAttribution = {
  abandonedCartId: string | null;
  abandonedCartSessionId: string | null;
  abandonedCartRecoveryToken: string | null;
};

export const selectAbandonedCartPaymentAttribution = ({
  recoveryAttribution,
  capturedCartId,
  storedCartId,
  sessionId,
}: {
  recoveryAttribution?: AbandonedCartRecoveryAttribution | null;
  capturedCartId?: string | null;
  storedCartId?: string | null;
  sessionId?: string | null;
}): AbandonedCartPaymentAttribution => ({
  // A token-authorized emailed cart must win over the new snapshot created by
  // the browser that opened it. That is what preserves cross-device recovery
  // attribution instead of crediting the replacement session cart.
  abandonedCartId: recoveryAttribution?.cartId
    || (capturedCartId && UUID_PATTERN.test(capturedCartId) ? capturedCartId : null)
    || (storedCartId && UUID_PATTERN.test(storedCartId) ? storedCartId : null),
  abandonedCartSessionId: typeof sessionId === 'string' && sessionId ? sessionId : null,
  abandonedCartRecoveryToken: recoveryAttribution?.token || null,
});

export const readStoredAbandonedCartRecoveryAttribution = (
  storage = getSessionStorage(),
): AbandonedCartRecoveryAttribution | null => {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(
      storage.getItem(ABANDONED_CART_RECOVERY_ATTRIBUTION_STORAGE_KEY) || 'null',
    ) as Partial<AbandonedCartRecoveryAttribution> | null;
    const cartId = typeof parsed?.cartId === 'string' ? parsed.cartId.trim().toLowerCase() : '';
    const token = typeof parsed?.token === 'string' ? parsed.token.trim() : '';
    if (!UUID_PATTERN.test(cartId) || !SIGNED_RECOVERY_TOKEN_PATTERN.test(token) || token.length > 2048) {
      return null;
    }
    return { cartId, token };
  } catch {
    return null;
  }
};

export const writeStoredAbandonedCartRecoveryAttribution = (
  value: AbandonedCartRecoveryAttribution | null,
  storage = getSessionStorage(),
): void => {
  if (!storage) return;
  try {
    const cartId = typeof value?.cartId === 'string' ? value.cartId.trim().toLowerCase() : '';
    const token = typeof value?.token === 'string' ? value.token.trim() : '';
    if (UUID_PATTERN.test(cartId) && SIGNED_RECOVERY_TOKEN_PATTERN.test(token) && token.length <= 2048) {
      storage.setItem(
        ABANDONED_CART_RECOVERY_ATTRIBUTION_STORAGE_KEY,
        JSON.stringify({ cartId, token }),
      );
      return;
    }
    storage.removeItem(ABANDONED_CART_RECOVERY_ATTRIBUTION_STORAGE_KEY);
  } catch {
    // Storage restrictions must never block checkout.
  }
};

export async function awaitBoundedAbandonedCartSnapshot<T>(
  operation: Promise<T> | null | undefined,
  timeoutMs = 1_500,
): Promise<T | null> {
  if (!operation) return null;
  const boundedTimeoutMs = Number.isFinite(timeoutMs)
    ? Math.max(0, Math.min(5_000, Math.round(timeoutMs)))
    : 1_500;
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      operation.catch(() => null),
      new Promise<null>((resolve) => {
        timeout = setTimeout(() => resolve(null), boundedTimeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export const splitCaptureName = (value: unknown): Pick<AbandonedCartContact, 'firstName' | 'lastName'> => {
  const normalized = normalizeCaptureName(value);
  if (!normalized) return { firstName: null, lastName: null };
  const [firstName, ...remaining] = normalized.split(' ');
  return { firstName, lastName: remaining.join(' ') || null };
};
