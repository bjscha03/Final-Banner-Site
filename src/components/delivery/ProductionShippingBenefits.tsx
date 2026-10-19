import { Plane, Timer, Truck } from 'lucide-react';
import '@/styles/production-shipping-benefits.css';

export default function ProductionShippingBenefits({ freight = false }: { freight?: boolean }) {
  const ShippingIcon = freight ? Truck : Plane;
  return (
    <ul className="production-shipping-benefits" aria-label="Ordering benefits">
      <li><Timer aria-hidden="true" /><div><strong>24 HOUR</strong><span>PRODUCTION</span></div></li>
      <li><ShippingIcon aria-hidden="true" /><div><strong>{freight ? 'OVERSIZED' : 'FREE NEXT-DAY'}</strong><span>{freight ? 'SHIPPING' : 'AIR SHIPPING'}</span><small>{freight ? 'May ship by freight' : 'On orders $20+'}</small></div></li>
    </ul>
  );
}
