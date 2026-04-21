import { getProductConfig } from '@/lib/products';
import { calculateQuantityDiscount } from './quantity-discount';

export const CAR_MAGNET_IMAGE_URL = 'https://res.cloudinary.com/dtrxl120u/image/upload/v1776755781/car_magnet_yinavh.png';

export type CarMagnetRoundedCorner = 'none' | '0.5' | '1';

export interface CarMagnetSizeOption {
  label: string;
  widthIn: number;
  heightIn: number;
  basePriceCents: number;
}

export const CAR_MAGNET_SIZES: CarMagnetSizeOption[] = [
  { label: '18" × 12"', widthIn: 18, heightIn: 12, basePriceCents: 2200 },
  { label: '24" × 12"', widthIn: 24, heightIn: 12, basePriceCents: 2800 },
  { label: '24" × 18"', widthIn: 24, heightIn: 18, basePriceCents: 3600 },
  { label: '42" × 12"', widthIn: 42, heightIn: 12, basePriceCents: 4400 },
];

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
  const config = getProductConfig('car_magnet');
  const size = CAR_MAGNET_SIZES.find((option) => option.widthIn === widthIn && option.heightIn === heightIn) || CAR_MAGNET_SIZES[0];
  const safeQuantity = Math.max(1, Number(quantity || 1));
  const unitPriceCents = size.basePriceCents;
  const baseSubtotalCents = unitPriceCents * safeQuantity;
  const quantityDiscount = calculateQuantityDiscount(baseSubtotalCents, safeQuantity);
  const subtotalCents = quantityDiscount.subtotalAfterDiscountCents;
  const taxRate = config.taxRate;
  const taxCents = Math.round(subtotalCents * taxRate);
  const totalCents = subtotalCents + taxCents;

  return {
    unitPriceCents,
    quantity: safeQuantity,
    baseSubtotalCents,
    quantityDiscountRate: quantityDiscount.discountRate,
    quantityDiscountCents: quantityDiscount.discountCents,
    subtotalCents,
    taxRate,
    taxCents,
    totalCents,
  };
}
