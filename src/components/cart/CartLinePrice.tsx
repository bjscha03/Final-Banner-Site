import React from 'react';
import { usd } from '@/lib/pricing';

export default function CartLinePrice({ originalCents, totalCents, quantity }: {
  originalCents: number; totalCents: number; quantity: number;
}) {
  const discounted = totalCents < originalCents;
  return <div className="flex-shrink-0 text-right" data-testid="cart-line-price">
    {discounted && <p className="text-xs text-slate-500"><span className="sr-only">Original price </span><s>{usd(originalCents / 100)}</s></p>}
    <p className={`text-lg font-bold leading-tight ${discounted ? 'text-emerald-700' : 'text-gray-900'}`}>
      <span className="sr-only">{discounted ? 'Discounted line total ' : 'Line total '}</span>{usd(totalCents / 100)}
    </p>
    {quantity > 1 && <p className="text-xs text-gray-600">{usd(totalCents / Math.max(1, quantity) / 100)} each, including options</p>}
    {discounted && <p className="text-xs font-medium text-emerald-700">Discount included</p>}
  </div>;
}
