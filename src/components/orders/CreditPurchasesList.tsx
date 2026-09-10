/**
 * Credit Purchases List
 * 
 * Displays credit purchase history in the My Orders page
 */

import React from 'react';
import { Sparkles, Check, Calendar, CreditCard } from 'lucide-react';

interface CreditPurchase {
  id: string;
  credits_purchased: number;
  amount_cents: number;
  paypal_capture_id: string;
  customer_name: string;
  email: string;
  status: string;
  created_at: string;
}

interface CreditPurchasesListProps {
  purchases: CreditPurchase[];
}

export const CreditPurchasesList: React.FC<CreditPurchasesListProps> = ({ purchases }) => {
  if (purchases.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-900 flex items-center gap-2">
        <Sparkles className="w-5 h-5 text-blue-600" />
        AI Credits Purchases
      </h2>

      <div className="space-y-3">
        {purchases.map((purchase) => (
          <div
            key={purchase.id}
            className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              {/* Left Side - Purchase Info */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="w-5 h-5 text-blue-600" />
                  <h3 className="font-semibold text-lg">
                    {purchase.credits_purchased} AI Credits
                  </h3>
                  <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
                    {purchase.status === 'completed' ? 'Completed' : purchase.status}
                  </span>
                </div>

                <div className="space-y-1 text-sm text-gray-600">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    <span>{new Date(purchase.created_at).toLocaleDateString('en-US', {
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    <span>PayPal</span>
                    <span className="text-gray-400">•</span>
                    <span className="font-mono text-xs">{purchase.paypal_capture_id.substring(0, 16)}...</span>
                  </div>
                </div>
              </div>

              {/* Right Side - Amount */}
              <div className="text-right">
                <div className="text-2xl font-bold text-gray-900">
                  ${(purchase.amount_cents / 100).toFixed(2)}
                </div>
                <div className="text-sm text-gray-500">
                  ${((purchase.amount_cents / 100) / purchase.credits_purchased).toFixed(2)} per credit
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default CreditPurchasesList;
