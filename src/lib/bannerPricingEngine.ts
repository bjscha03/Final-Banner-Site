import { MaterialKey } from '@/store/quote';
import { calculateQuantityDiscount } from './quantity-discount';
import { getProductConfig, DEFAULT_PRODUCT_TYPE } from './products';

export type PolePocketPosition = 'none' | 'top' | 'bottom' | 'left' | 'right' | 'top-bottom';

export interface BannerPricingInput {
  widthIn: number;
  heightIn: number;
  quantity: number;
  material: MaterialKey;
  addRope: boolean;
  polePockets?: string;
  grommets?: string;
}

export interface BannerPricingResult {
  areaSqFt: number;
  unitBasePriceCents: number;
  baseBannerPriceCents: number;
  grommetsIncluded: boolean;
  grommetsCostCents: number;
  ropeLinearFeet: number;
  ropeCostCents: number;
  polePocketLinearFeet: number;
  polePocketSetupFeeCents: number;
  polePocketCostCents: number;
  subtotalBeforeDiscountCents: number;
  quantityDiscountRate: number;
  quantityDiscountCents: number;
  subtotalCents: number;
  taxCents: number;
  totalCents: number;
}

const bannerConfig = getProductConfig(DEFAULT_PRODUCT_TYPE);
const TAX_RATE = bannerConfig.taxRate;
const MINIMUM_UNIT_PRICE_CENTS = bannerConfig.minimumUnitPriceCents;
const MATERIAL_PRICE_MAP = bannerConfig.materialPriceMap as Record<MaterialKey, number>;
const ROPE_PRICE_PER_LINEAR_FOOT_CENTS = bannerConfig.rope.pricePerFootCents;
const POLE_POCKET_SETUP_FEE_CENTS = bannerConfig.polePockets.setupFeeCents;
const POLE_POCKET_PRICE_PER_LINEAR_FOOT_CENTS = bannerConfig.polePockets.pricePerLinearFootCents;

export const calculateBannerAreaSqFt = (widthIn: number, heightIn: number): number => {
  return (widthIn * heightIn) / 144;
};

export const getPolePocketLinearFeet = (
  widthIn: number,
  heightIn: number,
  polePockets: string | undefined
): number => {
  switch ((polePockets || 'none') as PolePocketPosition) {
    case 'top':
    case 'bottom':
      return widthIn / 12;
    case 'left':
    case 'right':
      return heightIn / 12;
    case 'top-bottom':
      return (widthIn / 12) * 2;
    default:
      return 0;
  }
};

/**
 * Rope pricing stays aligned with existing storefront behavior:
 * 2x width (top + bottom equivalent linear feet) at $2.00 / linear foot.
 */
export const getRopeLinearFeet = (widthIn: number): number => {
  return (widthIn / 12) * 2;
};

export const calculateBannerPricing = ({
  widthIn,
  heightIn,
  quantity,
  material,
  addRope,
  polePockets = 'none',
  grommets = 'none',
}: BannerPricingInput): BannerPricingResult => {
  const safeWidthIn = Math.max(0, widthIn || 0);
  const safeHeightIn = Math.max(0, heightIn || 0);
  const safeQuantity = Math.max(1, Math.floor(quantity || 1));

  const areaSqFt = calculateBannerAreaSqFt(safeWidthIn, safeHeightIn);
  const materialRate = MATERIAL_PRICE_MAP[material] ?? MATERIAL_PRICE_MAP['13oz'];
  const unitBasePriceCents = Math.max(MINIMUM_UNIT_PRICE_CENTS, Math.round(areaSqFt * materialRate * 100));
  const baseBannerPriceCents = unitBasePriceCents * safeQuantity;

  const ropeLinearFeet = addRope ? getRopeLinearFeet(safeWidthIn) : 0;
  const ropeCostCents = addRope
    ? Math.round(ropeLinearFeet * safeQuantity * ROPE_PRICE_PER_LINEAR_FOOT_CENTS)
    : 0;

  const polePocketLinearFeet = getPolePocketLinearFeet(safeWidthIn, safeHeightIn, polePockets);
  const hasPolePockets = polePockets !== 'none' && polePocketLinearFeet > 0;
  const polePocketSetupFeeCents = hasPolePockets ? POLE_POCKET_SETUP_FEE_CENTS : 0;
  const polePocketLinearCostCents = hasPolePockets
    ? Math.round(polePocketLinearFeet * safeQuantity * POLE_POCKET_PRICE_PER_LINEAR_FOOT_CENTS)
    : 0;
  const polePocketCostCents = polePocketSetupFeeCents + polePocketLinearCostCents;

  const subtotalBeforeDiscountCents = baseBannerPriceCents + ropeCostCents + polePocketCostCents;
  const quantityDiscount = calculateQuantityDiscount(subtotalBeforeDiscountCents, safeQuantity);
  const quantityDiscountCents = quantityDiscount.discountCents;
  const subtotalCents = subtotalBeforeDiscountCents - quantityDiscountCents;
  const taxCents = Math.round(subtotalCents * TAX_RATE);
  const totalCents = subtotalCents + taxCents;

  return {
    areaSqFt,
    unitBasePriceCents,
    baseBannerPriceCents,
    grommetsIncluded: grommets !== 'none',
    grommetsCostCents: 0,
    ropeLinearFeet,
    ropeCostCents,
    polePocketLinearFeet,
    polePocketSetupFeeCents,
    polePocketCostCents,
    subtotalBeforeDiscountCents,
    quantityDiscountRate: quantityDiscount.discountRate,
    quantityDiscountCents,
    subtotalCents,
    taxCents,
    totalCents,
  };
};
