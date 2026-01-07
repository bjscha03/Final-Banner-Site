import React, { useState, useEffect, useMemo } from 'react';
import { Truck, Clock } from 'lucide-react';
import {
  getNextCutoffTime,
  getEstimatedDeliveryDate,
  formatDeliveryDate,
  getUserTimezone,
  DeliveryConfig,
  addDays,
} from '@/lib/deliveryTimeHelpers';

export interface DeliveryCountdownProps {
  cutoffHourET?: number;
  businessStartHourET?: number;
  showSecondaryLine?: boolean;
  compactMode?: boolean;
  blackoutDates?: string[];
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

  // Update every second for live countdown
  useEffect(() => {
    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const config: DeliveryConfig = useMemo(() => ({
    cutoffHour: cutoffHourET,
    businessStartHour: businessStartHourET,
    blackoutDates,
  }), [cutoffHourET, businessStartHourET, blackoutDates]);

  const { deliveryDate, hours, minutes, seconds, isLongWindow } = useMemo(() => {
    const cutoff = getNextCutoffTime(now, config);
    const delivery = getEstimatedDeliveryDate(now, config);
    const msUntilCutoff = Math.max(0, cutoff.getTime() - now.getTime());
    
    const totalSeconds = Math.floor(msUntilCutoff / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;
    
    const sevenDaysFromNow = addDays(now, 7);
    const longWindow = delivery.getTime() > sevenDaysFromNow.getTime();
    
    return {
      deliveryDate: delivery,
      hours: h,
      minutes: m,
      seconds: s,
      isLongWindow: longWindow,
    };
  }, [now, config]);

  const formattedDeliveryDate = formatDeliveryDate(deliveryDate, userTimezone);
  
  // Format with leading zeros
  const timeDisplay = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;

  if (compactMode) {
    return (
      <div className={`inline-flex items-center gap-2 bg-green-50 text-green-800 px-3 py-1.5 rounded-full text-sm font-medium ${className}`}>
        <Truck className="h-4 w-4" />
        <span className="font-mono font-bold">{timeDisplay}</span>
        <span>→ {formattedDeliveryDate}</span>
      </div>
    );
  }

  return (
    <div className={`bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg p-4 ${className}`}>
      <div className="flex items-center gap-3">
        <div className="flex-shrink-0 bg-green-100 rounded-full p-2">
          <Truck className="h-5 w-5 text-green-700" />
        </div>
        <div className="flex-1">
          <p className="text-green-900 font-semibold text-base md:text-lg flex flex-wrap items-center gap-1">
            {isLongWindow ? (
              <>Order now — estimated delivery by <span className="text-green-700">{formattedDeliveryDate}</span></>
            ) : (
              <>
                <span>Order within</span>
                <span className="inline-flex items-center gap-1 bg-green-600 text-white px-2 py-0.5 rounded font-mono font-bold text-sm md:text-base tabular-nums">
                  <Clock className="h-3.5 w-3.5" />
                  {timeDisplay}
                </span>
                <span>to get it by</span>
                <span className="text-green-700 font-bold">{formattedDeliveryDate}</span>
              </>
            )}
          </p>
          
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
