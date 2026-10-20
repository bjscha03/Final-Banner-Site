import { PackageCheck, Truck } from 'lucide-react';
import type { ETParts } from '@/lib/delivery';
import '@/styles/compact-product-hero.css';

/** Presentation only: each product supplies dates from its own fulfillment engine. */
export default function DeliveryDateCard({ shipDate, deliveryDate }: { shipDate: ETParts; deliveryDate: ETParts }) {
  return <div className="delivery-date-card" aria-label="Shipping and delivery dates">
    {[{ label: 'Shipping date', date: shipDate, Icon: Truck }, { label: 'Delivery date', date: deliveryDate, Icon: PackageCheck }].map(({ label, date, Icon }) => {
      const value = new Date(Date.UTC(date.year, date.month - 1, date.day));
      return <div className="delivery-date-cell" key={label}>
        <Icon aria-hidden="true" />
        <div><p className="delivery-date-label">{label}</p>
          <p className="delivery-date-weekday">{new Intl.DateTimeFormat('en-US', { weekday: 'long', timeZone: 'UTC' }).format(value)}</p>
          <p className="delivery-date-value">{new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' }).format(value)}</p>
        </div>
      </div>;
    })}
  </div>;
}
