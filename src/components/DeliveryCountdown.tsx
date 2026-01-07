import React, { useState, useEffect, useMemo } from 'react';
import { Truck, Clock } from 'lucide-react';
import {
  getNextCutoffTime,
  getEstimatedDeliveryDate,
  formatCountdown,
  formatDeliveryDate,
  getUserTimezone,
  DeliveryConfig,
  DEFAULT_CONFIG,
  addDays,
} from '@/lib/deliveryTimeHelpers';

export interface DeliveryCountdownProps {
  /** Cutoff hour in ET (0-23). Default: 14 (2 PM) */
  cutoffHourET?: number;
  /** Business start hour in ET (0-23). Default: 9 (9 AM) */
  businessStartHourET?: number;
  /** Show secondary line with shipping details. Default: true */
  showSecondaryLine?: boolean;
  /** Compact mode for smaller spaces. Default: false */
  compactMode?: boolean;
  /** Custom blackout dates in 'YYYY-MM-DD' format */
  blackoutDates?: string[];
  /** Custom class name */
  className?: string;
}

const DeliveryCountdown: React.FC<DeliveryCountdownProps> = ({
  cutoffHourET = 14,
  businessStartHourET = 9,
  showSecondaryLine = true,
  compactMode = false,
  blackoutDates = [],
  className = '',
}) => {
  const [now, setNow] = useState(() => new Date());
  const [userTimezone] = useState(() => getUserTimezone());

  // Update every second
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Build config
  const config: DeliveryConfig = useMemo(() => ({
    cutoffHour: cutoffHourET,
    businessStartHour: businessStartHourET,
    blackoutDates,
  }), [cutoffHourET, businessStartHourET, blackoutDates]);

  // Calculate cutoff and delivery
  const { cutoffTime, deliveryDate, countdown, isLongWindow } = useMemo(() => {
    const cutoff = getNextCutoffTime(now, config);
    const delivery = getEstimatedDeliveryDate(now, config);
    const msUntilCutoff = cutoff.getTime() - now.getTime();
    
    // Check if delivery is more than 7 days away
    const sevenDaysFromNow = addDays(now, 7);
    const longWindow = delivery.getTime() > sevenDaysFromNow.getTime();
    
    return {
      cutoffTime: cutoff,
      deliveryDate: delivery,
      countdown: msUntilCutoff,
      isLongWindow: longWindow,
    };
  }, [now, config]);

  const formattedCountdown = formatCountdown(countdown);
  const formattedDeliveryDate = formatDeliveryDate(deliveryDate, userTimezone);

  // Compact mode styles
  if (compactMode) {
    return (
      <div className={`inline-flex items-center gap-2 bg-green-50 text-green-800 px-3 py-1.5 rounded-full text-sm font-medium ${className}`}>
        <Truck className="h-4 w-4" />
        <span>
          {isLongWindow 
            ? `Est. delivery: ${formattedDeliveryDate}`
            : `Order in ${formattedCountdown} → ${formattedDeliveryDate}`
          }
        </span>
      </div>
    );
  }

  return (
    <div className={`bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 ${className}`}>
      {/* Main message */}
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 bg-green-100 rounded-full p-2">
          <Truck className="h-5 w-5 text-green-700" />
        </div>
        <div className="flex-1">
          <p className="text-green-900 font-semibold text-base md:text-lg">
            {isLongWindow ? (
              <>Order now — estimated delivery by <span className="text-green-700">{formattedDeliveryDate}</span></>
            ) : (
              <>
                Order within{' '}
                <span className="inline-flex items-center gap-1 bg-green-600 text-white px-2 py-0.5 rounded font-bold text-sm md:text-base">
                  <Clock className="h-3.5 w-3.5" />
                  {formattedCountdown}
                </span>{' '}
                to get it by <span className="text-green-700 font-bold">{formattedDeliveryDate}</span>
              </>
            )}
          </p>
          
          {/* Secondary line */}
          {showSecondaryLine && (
            <p className="text-green-700 text-xs md:text-sm mt-1 opacity-80">
              24-hour production + Free Next Day Air (Mon–Fri). Weekends may shift delivery.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeliveryCountdown;
