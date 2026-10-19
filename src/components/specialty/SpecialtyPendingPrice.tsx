import {formatSpecialtyPrice,specialtyItemPrice} from '@/lib/specialtyProducts';

/** Keep a known base visible without presenting an incomplete quote as payable. */
export default function SpecialtyPendingPrice({item}:{item:Parameters<typeof specialtyItemPrice>[0]&{quantity:number}}) {
  const quote=specialtyItemPrice(item);
  return <div className="text-right" data-testid="specialty-pending-price">
    {quote?.baseVerified?<>
      <p className="text-xs text-slate-500">Base + priced options</p>
      <p className="text-lg font-bold text-slate-900">{formatSpecialtyPrice(quote.unitCents*item.quantity)}</p>
      <p className="text-xs text-amber-800">Other option prices coming soon</p>
    </>:<p className="text-sm font-semibold text-amber-800">Price coming soon</p>}
  </div>;
}
