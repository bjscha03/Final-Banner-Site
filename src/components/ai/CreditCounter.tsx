/**
 * CreditCounter Component
 * 
 * Displays user's AI generation credits and monthly spending
 */

import React, { useEffect, useState } from 'react';
import { Sparkles, Coins, TrendingUp, ShoppingCart } from 'lucide-react';
import type { CreditsStatusResponse } from '../../types/ai-generation';
import { PurchaseCreditsModal } from './PurchaseCreditsModal';

interface CreditCounterProps {
  userId: string;
  userEmail?: string;
  onRefresh?: () => void;
  className?: string;
}

export const CreditCounter: React.FC<CreditCounterProps> = ({ 
  userId,
  userEmail,
  onRefresh,
  className = '' 
}) => {
  const [status, setStatus] = useState<CreditsStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showReceipt, setShowReceipt] = useState(false);
  const [purchaseData, setPurchaseData] = useState<any>(null);

  const fetchStatus = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/.netlify/functions/ai-credits-status?userId=${encodeURIComponent(userId)}`
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: CreditsStatusResponse = await response.json();
      setStatus(data);
    } catch (err: any) {
      console.error('[CreditCounter] Error fetching status:', err);
      setError(err.message || 'Failed to load credits');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
  }, [userId]);

  // Refresh when onRefresh is called
  useEffect(() => {
    if (onRefresh) {
      fetchStatus();
    }
  }, [onRefresh]);

  const handlePurchaseCredits = () => {
    setShowPurchaseModal(true);
  };

  const handlePurchaseComplete = () => {
    // Refresh credits after purchase
    fetchStatus();
  };

  if (loading) {
    return (
      <div className={`flex items-center gap-2 text-sm text-gray-500 ${className}`}>
        <div className="animate-spin rounded-full h-4 w-4 border-2 border-gray-300 border-t-blue-600" />
        <span>Loading credits...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`flex items-center gap-2 text-sm text-red-600 ${className}`}>
        <span>⚠️ {error}</span>
        <button
          onClick={fetchStatus}
          className="text-blue-600 hover:underline"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!status) {
    return null;
  }

  const budgetPercentage = (status.monthlySpend / status.monthlyCap) * 100;
  const budgetColor = budgetPercentage > 90 ? 'text-red-600' : budgetPercentage > 70 ? 'text-yellow-600' : 'text-green-600';
  const hasNoCredits = status.freeRemainingToday === 0 && status.paidCredits === 0;

  return (
    <>
      <div className={`flex flex-col gap-2 ${className}`}>
        {/* Credits Display */}
        <div className="flex items-center gap-4 text-sm flex-wrap">
          {/* Free Credits */}
          {status.freeRemainingToday > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full">
              <Sparkles className="w-4 h-4" />
              <span className="font-medium">🎁 {status.freeRemainingToday}</span>
              <span className="text-blue-600">free today</span>
            </div>
          )}

          {/* Paid Credits */}
          {status.paidCredits > 0 && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 text-green-700 rounded-full">
              <Coins className="w-4 h-4" />
              <span className="font-medium">{status.paidCredits}</span>
              <span className="text-green-600">credits</span>
            </div>
          )}

          {/* Purchase Credits Button - Always Visible */}
          <button
            onClick={handlePurchaseCredits}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors font-medium"
          >
            <ShoppingCart className="w-4 h-4" />
            Purchase Credits
          </button>

          {/* No Credits Warning */}
          {hasNoCredits && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-50 text-yellow-700 rounded-full">
              <span className="font-medium">⚠️ No credits remaining</span>
            </div>
          )}
        </div>

        {/* Monthly Budget Indicator */}
        <div className="flex items-center gap-2 text-xs">
          <TrendingUp className={`w-3 h-3 ${budgetColor}`} />
          <span className="text-gray-600">
            Monthly spend: 
            <span className={`font-medium ml-1 ${budgetColor}`}>
              ${status.monthlySpend.toFixed(2)}
            </span>
            <span className="text-gray-500 ml-1">
              / ${status.monthlyCap.toFixed(0)}
            </span>
          </span>
          
          {/* Budget Warning */}
          {budgetPercentage > 90 && (
            <span className="text-red-600 font-medium">
              (⚠️ {(100 - budgetPercentage).toFixed(0)}% remaining)
            </span>
          )}
        </div>

        {/* Budget Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-1.5">
          <div
            className={`h-1.5 rounded-full transition-all ${
              budgetPercentage > 90 ? 'bg-red-600' : 
              budgetPercentage > 70 ? 'bg-yellow-600' : 
              'bg-green-600'
            }`}
            style={{ width: `${Math.min(budgetPercentage, 100)}%` }}
          />
        </div>
      </div>

      {/* Purchase Credits Modal */}
      <PurchaseCreditsModal
        open={showPurchaseModal}
        onOpenChange={setShowPurchaseModal}
        userId={userId}
        userEmail={userEmail}
        onPurchaseComplete={handlePurchaseComplete}
        showReceipt={showReceipt}
        setShowReceipt={setShowReceipt}
        purchaseData={purchaseData}
        setPurchaseData={setPurchaseData}
      />
    </>
  );
};

export default CreditCounter;
