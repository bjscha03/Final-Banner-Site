import React from 'react';
import { Clock, Truck, ShieldCheck, Smile, Mail } from 'lucide-react';

export interface TrustStripProps {
  className?: string;
  supportEmail?: string;
}

/**
 * Bottom trust/support strip rendered below the order builder.
 * Copy distinguishes standard production from carrier transit and uses the
 * same defect-remedy wording as the customer policy pages.
 *
 * Pure presentational.
 */
export default function TrustStrip({
  className,
  supportEmail = 'support@bannersonthefly.com',
}: TrustStripProps) {
  const items = [
    { icon: Clock, title: 'Standard production', subtitle: 'Most orders within 24 hours', iconClass: 'text-orange-700' },
    { icon: Truck, title: 'Free next-day air', subtitle: 'Carrier transit after production', iconClass: 'text-orange-700' },
    { icon: ShieldCheck, title: 'Damage or defect review', subtitle: 'Eligible claims are reprinted', iconClass: 'text-orange-700' },
    { icon: Smile, title: 'Order support', subtitle: 'Email us with questions', iconClass: 'text-orange-700' },
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
                {item.subtitle ? (
                  <p className="text-[11px] md:text-xs text-slate-500 truncate">{item.subtitle}</p>
                ) : null}
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
