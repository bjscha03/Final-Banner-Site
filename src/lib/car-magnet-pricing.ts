import { getProductConfig } from '@/lib/products';

export const CAR_MAGNET_IMAGE_URL = 'https://res.cloudinary.com/dtrxl120u/image/upload/v1776755781/car_magnet_yinavh.png';

export type CarMagnetRoundedCorner = 'none' | '0.5' | '1';

export interface CarMagnetSizeOption {
  label: string;
  widthIn: number;
  heightIn: number;
  basePriceCents: number;
}

const carMagnetConfig = getProductConfig('car_magnet');

/**
 * The product registry is the single source of truth for supported magnet
 * sizes and prices. Checkout, the configurator, landing pages, and schema all
 * consume this exported view of the same registry values.
 */
export const CAR_MAGNET_SIZES: CarMagnetSizeOption[] = (carMagnetConfig.predefinedSizes || []).map((size) => ({
  label: size.label,
  widthIn: size.widthIn,
  heightIn: size.heightIn,
  basePriceCents: size.basePriceCents,
}));

export const CAR_MAGNET_ROUNDED_CORNERS: Array<{ value: CarMagnetRoundedCorner; label: string }> = [
  { value: 'none', label: 'None' },
  { value: '0.5', label: '1/2"' },
  { value: '1', label: '1"' },
];

export function getCarMagnetSizeLabel(widthIn: number, heightIn: number): string {
  const match = CAR_MAGNET_SIZES.find((size) => size.widthIn === widthIn && size.heightIn === heightIn);
  return match?.label || `${widthIn}" × ${heightIn}"`;
}

export function getCarMagnetRoundedCornersLabel(value?: string | null): string {
  if (!value || value === 'none') return 'None';
  if (value === '0.5') return '1/2"';
  if (value === '1') return '1"';
  return String(value);
}

export interface CarMagnetPricing {
  unitPriceCents: number;
  quantity: number;
  /** Total of unit * quantity, BEFORE quantity discount and tax. */
  baseSubtotalCents: number;
  /** Discount rate applied (decimal, e.g. 0.07 for 7%). */
  quantityDiscountRate: number;
  /** Discount amount in cents (>=0). */
  quantityDiscountCents: number;
  /** baseSubtotalCents - quantityDiscountCents */
  subtotalCents: number;
  taxRate: number;
  taxCents: number;
  totalCents: number;
}

export function calcCarMagnetPricing(widthIn: number, heightIn: number, quantity: number): CarMagnetPricing {
  const config = carMagnetConfig;
  const size = CAR_MAGNET_SIZES.find((option) => option.widthIn === widthIn && option.heightIn === heightIn) || CAR_MAGNET_SIZES[0];
  const safeQuantity = Math.max(1, Number(quantity || 1));
  const unitPriceCents = size.basePriceCents;
  const baseSubtotalCents = unitPriceCents * safeQuantity;
  const quantityDiscountRate = 0;
  const quantityDiscountCents = 0;
  const subtotalCents = baseSubtotalCents;
  const taxRate = config.taxRate;
  const taxCents = Math.round(subtotalCents * taxRate);
  const totalCents = subtotalCents + taxCents;

  return {
    unitPriceCents,
    quantity: safeQuantity,
    baseSubtotalCents,
    quantityDiscountRate,
    quantityDiscountCents,
    subtotalCents,
    taxRate,
    taxCents,
    totalCents,
  };
}
