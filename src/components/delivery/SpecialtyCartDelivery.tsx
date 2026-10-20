import { useCartStore } from '@/store/cart';
import SpecialtyDeliveryStatus from './SpecialtyDeliveryStatus';
import PriceDeliveryEstimate from './PriceDeliveryEstimate';

/** Keep each fulfillment schedule visible when a cart contains both groups. */
export default function SpecialtyCartDelivery({ compact = false }: { compact?: boolean }) {
  const hasRegularProducts = useCartStore(state => state.items.some(item => item.product_type !== 'specialty'));
  return <div className="space-y-3" data-specialty-cart-delivery>
    <div>
      {hasRegularProducts && <p className="mb-2 text-xs font-bold text-slate-700">Displays &amp; signs</p>}
      <SpecialtyDeliveryStatus compact={compact} />
    </div>
    {hasRegularProducts && <div>
      <p className="mb-2 text-xs font-bold text-slate-700">Banners, yard signs &amp; car magnets</p>
      <PriceDeliveryEstimate variant={compact ? 'default' : 'checkout'} />
      <p className="mt-2 text-xs text-slate-600">Your products follow the shipping dates shown for each group and may arrive separately.</p>
    </div>}
  </div>;
}
