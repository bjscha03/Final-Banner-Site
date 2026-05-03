import React from 'react';
import { Clock, Truck, ShieldCheck, Smile, Mail } from 'lucide-react';

export interface TrustStripProps {
  className?: string;
  supportEmail?: string;
}

/**
 * Bottom trust/support strip rendered below the order builder.
 * Copy stays aligned with "24-hour production and free next-day air
 * shipping." — never promises delivery in 24 hours.
 *
 * Pure presentational.
 */
export default function TrustStrip({
  className,
  supportEmail = 'support@bannersonthefly.com',
}: TrustStripProps) {
  const items = [
    { icon: Clock, title: 'Next-day production', subtitle: 'Order by 2 PM EST', iconClass: 'text-orange-500' },
    { icon: Truck, title: 'Free next-day shipping', subtitle: 'On all orders', iconClass: 'text-orange-500' },
    { icon: ShieldCheck, title: 'Best quality guarantee', subtitle: '100% satisfaction', iconClass: 'text-orange-500' },
    { icon: Smile, title: 'Real people, real support', subtitle: "We're here to help", iconClass: 'text-orange-500' },
  ];

  return (
    <section className={`bg-gray-50 border-t border-gray-200 ${className ?? ''}`}>
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
          {items.map(item => (
            <div key={item.title} className="flex items-center gap-3">
              <item.icon className={`h-5 w-5 md:h-6 md:w-6 ${item.iconClass}`} aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-xs md:text-sm font-semibold text-slate-800 truncate">{item.title}</p>
                <p className="text-[11px] md:text-xs text-slate-500 truncate">{item.subtitle}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 md:mt-6 flex items-center justify-center gap-2 text-xs md:text-sm text-slate-500">
          <Mail className="h-4 w-4" aria-hidden="true" />
          <span>
            Questions?{' '}
            <a href={`mailto:${supportEmail}`} className="text-slate-700 hover:text-orange-600 underline-offset-2 hover:underline">
              {supportEmail}
            </a>
          </span>
        </div>
      </div>
    </section>
  );
}
