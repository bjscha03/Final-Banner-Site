import { Truck } from 'lucide-react';

interface ShippingBenefitBadgeProps {
  variant?: 'summary' | 'sticky';
  className?: string;
}

/** Display-only shipping benefit. Production estimates and pricing stay authoritative. */
export default function ShippingBenefitBadge({
  variant = 'summary',
  className = '',
}: ShippingBenefitBadgeProps) {
  const compact = variant === 'sticky';

  return (
    <div
      data-testid="free-next-day-air-badge"
      data-variant={variant}
      title="Next-Day Air begins after production. See the estimated ship and delivery dates for your order."
      className={`inline-flex max-w-full items-center border border-emerald-200 bg-emerald-50 text-left text-emerald-800 ${
        compact ? 'gap-1.5 rounded-lg px-2 py-1.5' : 'gap-3 rounded-xl px-3 py-3'
      } ${className}`}
    >
      <Truck
        aria-hidden="true"
        className={`shrink-0 text-emerald-600 ${compact ? 'h-5 w-5' : 'h-7 w-7'}`}
        strokeWidth={2}
      />
      <div className="min-w-0">
        <p className={`font-bold leading-tight ${compact ? 'text-[11px]' : 'text-base'}`}>
          <span className={compact ? 'block text-[10px] tracking-wide' : undefined}>FREE</span>{' '}
          <span className="whitespace-nowrap">Next-Day Air</span>
        </p>
        {compact ? (
          <span className="sr-only">Shipping after production</span>
        ) : (
          <p className="mt-1 text-xs leading-snug text-emerald-800">Shipping after production</p>
        )}
      </div>
    </div>
  );
}
