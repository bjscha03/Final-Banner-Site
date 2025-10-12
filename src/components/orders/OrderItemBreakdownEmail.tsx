import React from 'react';
import { Text } from '@react-email/components';
import { generateItemBreakdown, OrderItemInput } from '@/lib/order-pricing';

interface OrderItemBreakdownEmailProps {
  item: OrderItemInput;
}

/**
 * Email-Compatible Order Item Breakdown Component
 * 
 * Uses inline styles for maximum email client compatibility.
 * Uses the unified pricing module for all calculations.
 */
export default function OrderItemBreakdownEmail({ item }: OrderItemBreakdownEmailProps) {
  const lines = generateItemBreakdown(item);
  
  if (lines.length === 0) {
    return null;
  }
  
  const formatCurrency = (cents: number) => {
    return `$${(cents / 100).toFixed(2)}`;
  };
  
  return (
    <div style={{ marginTop: '16px', marginBottom: '16px' }}>
      <Text style={{ 
        fontSize: '14px', 
        fontWeight: '600', 
        color: '#111827',
        marginBottom: '8px'
      }}>
        Price Breakdown
      </Text>
      
      <div style={{ 
        borderTop: '1px solid #e5e7eb',
        paddingTop: '8px'
      }}>
        {lines.map((line, index) => (
          <div 
            key={index}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginBottom: '6px',
              fontSize: '14px'
            }}
          >
            <div style={{ flex: 1, color: '#374151' }}>
              <span>{line.label}</span>
              {line.description && (
                <span style={{ color: '#6b7280', marginLeft: '4px' }}>
                  ({line.description})
                </span>
              )}
            </div>
            <div style={{ 
              fontWeight: '500', 
              color: '#111827',
              marginLeft: '16px',
              whiteSpace: 'nowrap'
            }}>
              {formatCurrency(line.value_cents)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
