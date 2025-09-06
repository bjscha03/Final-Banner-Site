import { MaterialKey } from '@/store/quote';

export const PRICE_PER_SQFT = {
  '13oz': 4.5,
  '15oz': 6.0,
  '18oz': 7.5,
  'mesh': 6.0
} as const;

export const TAX_RATE = 0.06; // 6% tax rate

export const inchesToSqFt = (widthIn: number, heightIn: number): number => {
  return (widthIn * heightIn) / 144;
};

export const ropeCost = (widthIn: number, quantity: number): number => {
  return (widthIn / 12) * 2 * quantity;
};

export const polePocketCost = (widthIn: number, heightIn: number, polePockets: string, quantity: number): number => {
  if (polePockets === 'none') return 0;

  const setupFee = 15.00;
  const pricePerLinearFoot = 2.00;

  let linearFeet = 0;

  switch (polePockets) {
    case 'top':
    case 'bottom':
      linearFeet = widthIn / 12;
      break;
    case 'left':
    case 'right':
      linearFeet = heightIn / 12;
      break;
    case 'top-bottom':
      linearFeet = (widthIn / 12) * 2;
      break;
    default:
      linearFeet = 0;
  }

  return setupFee + (linearFeet * pricePerLinearFoot * quantity);
};

export interface CalcTotalsParams {
  widthIn: number;
  heightIn: number;
  qty: number;
  material: MaterialKey;
  addRope: boolean;
  polePockets?: string;
}

export interface CalcTotalsResult {
  area: number;
  unit: number;
  rope: number;
  polePocket: number;
  materialTotal: number;
  tax: number;
  totalWithTax: number;
}

export function calcTotals({
  widthIn,
  heightIn,
  qty,
  material,
  addRope,
  polePockets = 'none'
}: CalcTotalsParams): CalcTotalsResult {
  const area = inchesToSqFt(widthIn, heightIn);
  const unit = area * PRICE_PER_SQFT[material];
  const rope = addRope ? ropeCost(widthIn, qty) : 0;
  const polePocket = polePocketCost(widthIn, heightIn, polePockets, qty);
  const materialTotal = unit * qty + rope + polePocket;
  const tax = materialTotal * TAX_RATE;
  const totalWithTax = materialTotal + tax;

  return {
    area,
    unit,
    rope,
    polePocket,
    materialTotal,
    tax,
    totalWithTax
  };
}

export const calculateTax = (subtotal: number): number => {
  return subtotal * TAX_RATE;
};

export const calculateTotalWithTax = (subtotal: number): number => {
  return subtotal + calculateTax(subtotal);
};

export const usd = (amount: number): string => {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2
  });
};

export const formatArea = (area: number): string => {
  return `${area.toFixed(2)} sq ft`;
};

export const formatDimensions = (widthIn: number, heightIn: number): string => {
  return `${widthIn}" × ${heightIn}"`;
};
