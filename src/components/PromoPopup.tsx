import { useState, useEffect } from 'react';
import { X, Copy, Check, Zap, Plane } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { trackPromoEvent } from '@/lib/posthog';

interface PromoPopupProps {
  onClose: () => void;
}

export const PromoPopup = ({ onClose }: PromoPopupProps) => {
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();
  const promoCode = 'WEEK20';

  // Track promo shown event
  useEffect(() => {
    trackPromoEvent('promo_shown', {
      promo_code: promoCode,
      discount_percentage: 20,
    });
  }, []);

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(promoCode);
      setCopied(true);
      
      trackPromoEvent('promo_copied', {
        promo_code: promoCode,
        discount_percentage: 20,
      });
      
      toast({
        title: 'Code copied!',
        description: 'Use it at checkout to save 20%',
      });

      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy code:', error);
      toast({
        title: 'Copy failed',
        description: 'Please manually copy the code: ' + promoCode,
        variant: 'destructive',
      });
    }
  };

  const handleClose = () => {
    // Set suppression flag for 14 days
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + 14);
    localStorage.setItem('promo_popup_dismissed', expiryDate.toISOString());
    onClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/50 z-50 animate-in fade-in duration-200"
        onClick={handleClose}
      />
      
      {/* Popup */}
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
        <div 
          className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8 relative pointer-events-auto animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={handleClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Content */}
          <div className="text-center space-y-6">
            {/* Headline */}
            <div>
              <div className="inline-block bg-gradient-to-r from-orange-500 to-red-500 text-white text-sm font-bold px-4 py-1 rounded-full mb-3">
                LIMITED TIME
              </div>
              <h2 className="text-4xl font-bold text-gray-900 mb-2">
                20% OFF
              </h2>
              <p className="text-xl font-semibold text-gray-700">
                This Week Only!
              </p>
            </div>

            {/* Subtext */}
            <p className="text-gray-600 text-sm">
              Use code <span className="font-mono font-bold text-[#18448D]">{promoCode}</span> at checkout.<br />
              One use per customer. Expires Saturday 11:59 PM.
            </p>

            {/* Trust badges */}
            <div className="bg-blue-50 rounded-xl p-4 space-y-3">
              <div className="flex items-center gap-3 text-left">
                <div className="flex-shrink-0 w-10 h-10 bg-[#18448D] rounded-full flex items-center justify-center">
                  <Zap className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">24-Hour Production</p>
                  <p className="text-xs text-gray-600">Fast turnaround guaranteed</p>
                </div>
              </div>
              
              <div className="flex items-center gap-3 text-left">
                <div className="flex-shrink-0 w-10 h-10 bg-[#18448D] rounded-full flex items-center justify-center">
                  <Plane className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 text-sm">Free Next Day Air Delivery</p>
                  <p className="text-xs text-gray-600">Get it fast, no extra cost</p>
                </div>
              </div>

            </div>

            {/* CTA Buttons */}
            <div className="space-y-3">
              <button
                onClick={handleCopyCode}
                className="w-full bg-gradient-to-r from-[#18448D] to-[#1a5bb8] hover:from-[#153a7a] hover:to-[#18448D] text-white font-bold py-4 px-6 rounded-xl transition-all duration-200 shadow-lg hover:shadow-xl flex items-center justify-center gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-5 h-5" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    Copy Code
                  </>
                )}
              </button>
              
              <button
                onClick={handleClose}
                className="w-full text-gray-500 hover:text-gray-700 font-medium py-2 transition-colors"
              >
                No Thanks
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};
