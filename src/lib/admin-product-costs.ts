export type FixedPriceProductType = 'magnet';

export type ProductCostDiagnostics = {
  productType: string | null;
  rawProductName: string | null;
  rawSize: string | null;
  normalizedSize: string | null;
  quantity: number | null;
  reason?: string;
};

export type FixedProductCostResult =
  | {
      ok: true;
      productType: FixedPriceProductType;
      normalizedSize: string;
      unitCostCents: number;
      totalCostCents: number;
      diagnostics: ProductCostDiagnostics;
    }
  | {
      ok: false;
      productType: FixedPriceProductType | 'poster' | 'unknown';
      normalizedSize: string | null;
      totalCostCents: 0;
      diagnostics: ProductCostDiagnostics & { reason: string };
    };

export const fixedProductCostsCents: Record<FixedPriceProductType, Record<string, number>> = {
  magnet: {
    '12x18': 1195,
    '12x24': 1495,
    '18x24': 2095,
    '12x42': 2995,
    '24x72': 8970,
  },
};

const supportedFixedProductTypes: FixedPriceProductType[] = ['magnet'];

export const normalizeSizeKey = (rawSize: unknown): string | null => {
  if (rawSize == null) return null;
  const match = String(rawSize)
    .toLowerCase()
    .replace(/[″”]/g, '"')
    .match(/(\d+(?:\.\d+)?)\s*(?:"|in(?:ches?)?)?\s*[x×]\s*(\d+(?:\.\d+)?)\s*(?:"|in(?:ches?)?)?/i);

  if (!match) return null;

  const dims = [Number(match[1]), Number(match[2])];
  if (!dims.every((dim) => Number.isFinite(dim) && dim > 0)) return null;

  const normalizedDims = dims
    .map((dim) => (Number.isInteger(dim) ? String(dim) : String(Number(dim.toFixed(3)))))
    .sort((a, b) => Number(a) - Number(b));

  return `${normalizedDims[0]}x${normalizedDims[1]}`;
};

export const identifyFixedPriceProductType = (productType?: string | null, productName?: string | null): FixedPriceProductType | 'poster' | null => {
  const haystack = `${productType || ''} ${productName || ''}`.toLowerCase();
  if (haystack.includes('magnet')) return 'magnet';
  if (haystack.includes('poster')) return 'poster';
  return null;
};

export const resolveFixedProductCost = ({
  productType,
  productName,
  rawSize,
  quantity,
}: {
  productType?: string | null;
  productName?: string | null;
  rawSize?: unknown;
  quantity?: unknown;
}): FixedProductCostResult => {
  const resolvedProductType = identifyFixedPriceProductType(productType, productName) || 'unknown';
  const normalizedSize = normalizeSizeKey(rawSize);
  const qty = typeof quantity === 'number' ? quantity : Number(quantity);
  const baseDiagnostics: ProductCostDiagnostics = {
    productType: productType || null,
    rawProductName: productName || null,
    rawSize: rawSize == null ? null : String(rawSize),
    normalizedSize,
    quantity: Number.isFinite(qty) ? qty : null,
  };

  if (resolvedProductType === 'unknown') {
    return { ok: false, productType: 'unknown', normalizedSize, totalCostCents: 0, diagnostics: { ...baseDiagnostics, reason: 'Product type cannot be identified' } };
  }

  if (!supportedFixedProductTypes.includes(resolvedProductType as FixedPriceProductType)) {
    return { ok: false, productType: resolvedProductType, normalizedSize, totalCostCents: 0, diagnostics: { ...baseDiagnostics, reason: `Missing pricing for ${resolvedProductType}` } };
  }

  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, productType: resolvedProductType, normalizedSize, totalCostCents: 0, diagnostics: { ...baseDiagnostics, reason: 'Quantity is missing or invalid' } };
  }

  if (!normalizedSize) {
    return { ok: false, productType: resolvedProductType, normalizedSize, totalCostCents: 0, diagnostics: { ...baseDiagnostics, reason: `${resolvedProductType} size is missing or invalid` } };
  }

  const unitCostCents = fixedProductCostsCents[resolvedProductType][normalizedSize];
  if (!unitCostCents) {
    return { ok: false, productType: resolvedProductType, normalizedSize, totalCostCents: 0, diagnostics: { ...baseDiagnostics, reason: `${resolvedProductType} size does not match supported pricing: ${normalizedSize}` } };
  }

  return {
    ok: true,
    productType: resolvedProductType,
    normalizedSize,
    unitCostCents,
    totalCostCents: Math.round(unitCostCents * qty),
    diagnostics: baseDiagnostics,
  };
};
