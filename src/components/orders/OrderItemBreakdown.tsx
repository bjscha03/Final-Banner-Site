import React from 'react';
import { usd } from '@/lib/pricing';
import { generateItemBreakdown, OrderItemInput } from '@/lib/order-pricing';

interface OrderItemBreakdownProps {
  item: OrderItemInput;
  className?: string;
  variant?: 'default' | 'compact' | 'email';
}

/**
 * Unified Order Item Breakdown Component
 * 
 * Displays pricing breakdown for a single order item.
 * Uses the unified pricing module for all calculations.
 */
export default function OrderItemBreakdown({ 
  item, 
  className = '',
  variant = 'default' 
}: OrderItemBreakdownProps) {
  const lines = generateItemBreakdown(item);
  
  if (lines.length === 0) {
    return null;
  }
  
  const isCompact = variant === 'compact';
  
  return (
    <div className={`space-y-2 ${className}`}>
      {!isCompact && (
        <h5 className="text-sm font-medium text-gray-900 mb-2">
          Price Breakdown
        </h5>
      )}
      
      <div className="space-y-1.5">
        {lines.map((line, index) => (
          <div 
            key={index}
            className="flex justify-between items-start text-sm"
          >
            <div className="flex-1">
              <span className="text-gray-700">
                {line.label}
                {line.description && (
                  <span className="text-gray-500 ml-1">
                    ({line.description})
                  </span>
                )}
              </span>
            </div>
            <span className="text-gray-900 font-medium ml-4">
              {usd(line.value_cents / 100)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
