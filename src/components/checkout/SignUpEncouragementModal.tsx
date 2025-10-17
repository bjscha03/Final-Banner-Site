import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, User, ShoppingBag, Clock } from 'lucide-react';
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
            <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <User className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Create Your Account
            </h2>
            <p className="text-gray-600">
              Get the most out of your banner ordering experience
            </p>
          </div>

          {/* Benefits */}
          <div className="space-y-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                <Clock className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">View Past Orders</h3>
                <p className="text-sm text-gray-600">Track your order history and reorder easily</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                <ShoppingBag className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Faster Checkout</h3>
                <p className="text-sm text-gray-600">Save your details for quicker future orders</p>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                <User className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h3 className="font-medium text-gray-900">Order Updates</h3>
                <p className="text-sm text-gray-600">Get notified about your order status</p>
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            <Button
              onClick={handleSignUp}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 text-base font-semibold"
            >
              Create Account
            </Button>
            
            <Button
              onClick={handleSignIn}
              variant="outline"
              className="w-full border-gray-300 text-gray-700 hover:bg-gray-50 py-3 text-base font-semibold"
            >
              Sign In Instead
            </Button>
            
            <button
              onClick={handleContinueAsGuest}
              className="w-full text-sm text-gray-500 hover:text-gray-700 py-2 transition-colors"
            >
              Continue as guest
            </button>
          </div>

          {/* Footer note */}
          <p className="text-xs text-gray-400 text-center mt-4">
            Creating an account is free and takes less than a minute
          </p>
        </div>
      </div>
    </div>
  );
};

export default SignUpEncouragementModal;
