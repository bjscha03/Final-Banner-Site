/**
 * Credit Purchase Receipt Modal
 * 
 * Displays a receipt/invoice after successful credit purchase
 */

import React from 'react';
import { Check, Download, X, Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface CreditPurchase {
  id: string;
  credits_purchased: number;
  amount_cents: number;
  paypal_capture_id: string;
  customer_name: string;
  email: string;
  created_at: string;
}

interface CreditPurchaseReceiptProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  purchase: CreditPurchase | null;
}

export const CreditPurchaseReceipt: React.FC<CreditPurchaseReceiptProps> = ({
  open,
  onOpenChange,
  purchase,
}) => {
  if (!purchase) {
    console.log('⚠️  CreditPurchaseReceipt: No purchase data provided');
    return null;
  }
  
  console.log('✅ CreditPurchaseReceipt rendering with data:', purchase);

  const handlePrint = () => {
    window.print();
  };

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
        console.log('🎫 CreditPurchaseReceipt Dialog open state changing:', open, '->', newOpen);
        onOpenChange(newOpen);
      }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-2xl">
            <Check className="w-6 h-6 text-green-600" />
            Purchase Successful!
          </DialogTitle>
        </DialogHeader>

        <div className="mt-4 space-y-6">
          {/* Success Message */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h3 className="font-semibold text-green-900">
                  {purchase.credits_purchased} AI Credits Added!
                </h3>
                <p className="text-sm text-green-700">
                  Your credits are now available and ready to use
                </p>
              </div>
            </div>
          </div>

          {/* Receipt Details */}
          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h3 className="font-semibold text-lg mb-4">Receipt Details</h3>
            
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Purchase ID:</span>
                <span className="font-mono text-sm">{purchase.id}</span>
              </div>

              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Customer:</span>
                <span className="font-medium">{purchase.customer_name}</span>
              </div>

              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Email:</span>
                <span>{purchase.email}</span>
              </div>

              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Credits Purchased:</span>
                <span className="font-semibold text-blue-600">
                  {purchase.credits_purchased} credits
                </span>
              </div>

              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Amount Paid:</span>
                <span className="font-semibold">
                  ${(purchase.amount_cents / 100).toFixed(2)} USD
                </span>
              </div>

              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Payment Method:</span>
                <span>PayPal</span>
              </div>

              <div className="flex justify-between py-2 border-b border-gray-100">
                <span className="text-gray-600">Transaction ID:</span>
                <span className="font-mono text-xs">{purchase.paypal_capture_id}</span>
              </div>

              <div className="flex justify-between py-2">
                <span className="text-gray-600">Date:</span>
                <span>{new Date(purchase.created_at).toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={handlePrint}
              className="flex-1"
            >
              <Download className="w-4 h-4 mr-2" />
              Print Receipt
            </Button>
            <Button
              onClick={() => onOpenChange(false)}
              className="flex-1"
            >
              Done
            </Button>
          </div>

          {/* Email Confirmation Note */}
          <p className="text-sm text-gray-500 text-center">
            A confirmation email with your receipt has been sent to {purchase.email}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default CreditPurchaseReceipt;
