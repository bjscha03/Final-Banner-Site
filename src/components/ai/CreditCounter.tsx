/**
 * CreditCounter Component
 * 
 * Displays user's AI generation credits with simple, clear balance
 */

import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, Coins, ShoppingCart } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/use-toast';
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
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
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
    // Check if user is authenticated before showing purchase modal
    if (!user) {
      toast({
        title: '🔒 Sign In Required',
        description: 'Please sign in to purchase AI credits.',
        variant: 'destructive',
      });
      // Redirect to sign-in page with return URL
      navigate('/sign-in?next=/design&action=purchase-credits');
      return;
    }
    
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

  const hasNoCredits = status.totalCreditsRemaining === 0;
  const hasFreeCredits = status.freeCreditsRemaining > 0;
  const hasPaidCredits = status.paidCreditsRemaining > 0;

  return (
    <>
      <div className={`flex flex-col gap-3 ${className}`}>
        {/* Simple Credit Display */}
        <div className="flex items-center gap-3 text-sm flex-wrap">
          {/* Total Credits Remaining - Primary Display */}
          <div className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-50 to-purple-50 border border-blue-200 rounded-lg">
            <Sparkles className="w-5 h-5 text-blue-600" />
            <div className="flex flex-col">
              <span className="text-xs text-gray-600 font-medium">Credits Available</span>
              <span className="text-lg font-bold text-gray-900">{status.totalCreditsRemaining}</span>
            </div>
          </div>

          {/* Breakdown (if user has both free and paid) */}
          {hasFreeCredits && hasPaidCredits && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              <span className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full font-medium">
                {status.freeCreditsRemaining} free
              </span>
              <span className="text-gray-400">+</span>
              <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                {status.paidCreditsRemaining} purchased
              </span>
            </div>
          )}

          {/* Purchase Credits Button */}
          <button
            onClick={handlePurchaseCredits}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-sm hover:shadow-md"
          >
            <ShoppingCart className="w-4 h-4" />
            Buy More Credits
          </button>
        </div>

        {/* Usage Stats - Compact */}
        {(status.freeCreditsUsed > 0 || status.paidCreditsUsed > 0) && (
          <div className="flex items-center gap-4 text-xs text-gray-500 px-2">
            {status.freeCreditsUsed > 0 && (
              <span>
                Free: <span className="font-medium text-gray-700">{status.freeCreditsUsed} of {status.freeCreditsTotal} used</span>
              </span>
            )}
            {status.paidCreditsUsed > 0 && (
              <span>
                Purchased: <span className="font-medium text-gray-700">{status.paidCreditsUsed} of {status.paidCreditsPurchased} used</span>
              </span>
            )}
          </div>
        )}

        {/* No Credits Warning */}
        {hasNoCredits && (
          <div className="flex items-center gap-2 px-3 py-2 bg-yellow-50 border border-yellow-200 text-yellow-800 rounded-lg text-sm">
            <span className="font-medium">⚠️ No credits remaining. Purchase more to continue generating AI banners.</span>
          </div>
        )}
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
