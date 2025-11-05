import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Package, Zap, Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCheckoutContext } from '@/store/checkoutContext';
import { cartSyncService } from '@/lib/cartSync';

interface SignUpEncouragementModalProps {
  isOpen: boolean;
  onClose: () => void;
  onContinueAsGuest: () => void;
}

const SignUpEncouragementModal: React.FC<SignUpEncouragementModalProps> = ({
  isOpen,
  onClose,
  onContinueAsGuest
}) => {
  const navigate = useNavigate();
  const { setCheckoutContext } = useCheckoutContext();

  if (!isOpen) return null;

  const handleSignUp = () => {
    // CRITICAL FIX: Set checkout context with guest session ID before navigating
    const guestSessionId = cartSyncService.getSessionId();
    console.log('🛒 MODAL: Setting checkout context before sign-up', {
      guestSessionId: guestSessionId ? `${guestSessionId.substring(0, 12)}...` : 'none'
    });
    setCheckoutContext('/checkout', guestSessionId);
    navigate('/sign-up?from=checkout');
    onClose();
  };

  const handleSignIn = () => {
    // CRITICAL FIX: Set checkout context with guest session ID before navigating
    const guestSessionId = cartSyncService.getSessionId();
    console.log('🛒 MODAL: Setting checkout context before sign-in', {
      guestSessionId: guestSessionId ? `${guestSessionId.substring(0, 12)}...` : 'none'
    });
    setCheckoutContext('/checkout', guestSessionId);
    navigate('/sign-in?from=checkout');
    onClose();
  };

  const handleContinueAsGuest = () => {
    onContinueAsGuest();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto">
      <div className="flex min-h-full items-center justify-center p-4">
        {/* Backdrop */}
        <div
          className="fixed inset-0 bg-black bg-opacity-50 transition-opacity z-[9998]"
          onClick={onClose}
        />

        {/* Modal */}
        <div className="relative bg-white rounded-2xl shadow-xl max-w-md w-full p-6 z-[10000]">
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header */}
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Almost there — make checkout even easier
            </h2>
            <p className="text-gray-600">
              You can checkout as a guest, or create an account to save your details for next time.
            </p>
          </div>

          {/* Benefits */}
          <div className="space-y-3 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Package className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">Track Orders</span> — Easily view your order history and reorder fast
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Zap className="w-4 h-4 text-orange-600" />
              </div>
              <div>
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">Save Time</span> — Faster checkout on future orders
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Bell className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-700">
                  <span className="font-semibold">Stay Updated</span> — Get notified when your banner ships
                </p>
              </div>
            </div>
          </div>

          {/* Actions - Guest checkout is PRIMARY */}
          <div className="space-y-3">
            <Button
              onClick={handleContinueAsGuest}
              className="w-full bg-[#ff6b35] hover:bg-[#ff6b35]/90 text-white py-3 text-base font-semibold"
            >
              Continue as Guest
            </Button>
            
            <Button
              onClick={handleSignUp}
              variant="outline"
              className="w-full border-[#18448D] text-[#18448D] hover:bg-[#18448D]/5 py-3 text-base font-semibold"
            >
              Create Free Account
            </Button>
            
            <div className="text-center">
              <button
                onClick={handleSignIn}
                className="text-sm text-gray-600 hover:text-[#18448D] transition-colors"
              >
                Already have an account? <span className="font-medium">Sign In</span>
              </button>
            </div>
          </div>

          {/* Footer reassurance */}
          <p className="text-xs text-gray-500 text-center mt-4">
            No spam. We only email order updates.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignUpEncouragementModal;
