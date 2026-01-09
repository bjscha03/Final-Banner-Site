import React, { useState, useEffect, useMemo } from 'react';
import { Truck, Clock, Zap } from 'lucide-react';
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
      <div className={`inline-flex items-center gap-2 bg-[#18448D]/10 border border-[#18448D]/20 text-[#18448D] px-3 py-1.5 rounded-full text-sm font-medium shadow-sm ${className}`}>
        <Zap className="h-3.5 w-3.5 text-[#ff6b35]" />
        <span className="font-mono font-bold text-[#ff6b35]">{timeDisplay}</span>
        <span className="text-gray-600">→</span>
        <span className="font-semibold">{formattedDeliveryDate}</span>
      </div>
    );
  }

  return (
    <div className={`bg-gradient-to-r from-[#18448D]/5 via-white to-[#ff6b35]/5 border border-[#18448D]/15 rounded-xl p-4 shadow-sm ${className}`}>
      {/* Centered content container */}
      <div className="flex flex-col items-center text-center">
        {/* Main countdown row */}
        <div className="flex items-center justify-center gap-3 flex-wrap">
          {/* Icon */}
          <div className="flex-shrink-0 bg-[#18448D] rounded-full p-2 shadow-md">
            <Truck className="h-5 w-5 text-white" />
          </div>
          
          {/* Countdown message */}
          <p className="text-gray-800 font-semibold text-base md:text-lg flex flex-wrap items-center justify-center gap-1.5">
            {isLongWindow ? (
              <>
                <span>Order now — delivery by</span>
                <span className="text-[#18448D] font-bold">{formattedDeliveryDate}</span>
              </>
            ) : (
              <>
                <span>Order within</span>
                <span className="inline-flex items-center gap-1.5 bg-gradient-to-r from-[#ff6b35] to-[#f7931e] text-white px-3 py-1 rounded-lg font-mono font-bold text-sm md:text-base tabular-nums shadow-md">
                  <Clock className="h-3.5 w-3.5" />
                  {timeDisplay}
                </span>
                <span>to get it by</span>
                <span className="text-[#18448D] font-bold">{formattedDeliveryDate}</span>
              </>
            )}
          </p>
        </div>
        
        {/* Secondary line */}
        {showSecondaryLine && (
          <p className="text-gray-500 text-xs md:text-sm mt-2">
            <span className="inline-flex items-center gap-1">
              <Zap className="h-3 w-3 text-[#ff6b35]" />
              24-hour production + Free Next Day Air (Mon–Fri). Weekends may shift delivery.
            </span>
          </p>
        )}
      </div>
    </div>
  );
};

export default DeliveryCountdown;
