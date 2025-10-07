import React, { useState } from 'react';
import { ShoppingCart, CreditCard, Minus, Plus } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';
import { formatDimensions, inchesToSqFt } from '@/lib/pricing';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';

const CheckoutSummary: React.FC = () => {
  const { widthIn, heightIn, quantity, material, grommets, set } = useQuoteStore();
  const { toast } = useToast();
  const [isProcessing, setIsProcessing] = useState(false);

  // Calculate pricing
  const area = inchesToSqFt(widthIn, heightIn);
  const basePrice = area * 4.50; // Base price per sq ft
  const materialMultiplier = material === 'mesh' ? 1.2 : material === 'fabric' ? 1.5 : 1.0;
  const grommetCost = grommets === 'none' ? 0 : 5.00;
  const unitPrice = basePrice * materialMultiplier + grommetCost;
  const subtotal = unitPrice * quantity;
  const tax = subtotal * 0.08; // 8% tax
  const total = subtotal + tax;

  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity >= 1 && newQuantity <= 1000) {
      set({ quantity: newQuantity });
    }
  };

  const handleAddToCart = async () => {
    setIsProcessing(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      toast({
        title: 'Added to cart!',
        description: `${quantity} banner${quantity > 1 ? 's' : ''} added to your cart.`,
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to add to cart. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleBuyNow = async () => {
    setIsProcessing(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 1500));
      toast({
        title: 'Redirecting to checkout...',
        description: 'Please wait while we prepare your order.',
      });
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to proceed to checkout. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="bg-white border-t border-gray-200 p-6">
      <div className="max-w-4xl mx-auto">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Order Summary</h3>
        
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Size:</span>
              <span className="font-medium">{formatDimensions(widthIn, heightIn)}</span>
            </div>
            
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Material:</span>
              <span className="font-medium capitalize">{material}</span>
            </div>
            
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Grommets:</span>
              <span className="font-medium">{grommets === 'none' ? 'None' : grommets}</span>
            </div>
            
            <div className="flex justify-between items-center py-2 border-b border-gray-100">
              <span className="text-gray-600">Quantity:</span>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => handleQuantityChange(quantity - 1)}
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={quantity <= 1}
                >
                  <Minus className="w-4 h-4" />
                </Button>
                <span className="font-medium min-w-[2rem] text-center">{quantity}</span>
                <Button
                  onClick={() => handleQuantityChange(quantity + 1)}
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={quantity >= 1000}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">Unit Price:</span>
              <span className="font-medium">${unitPrice.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between items-center py-2">
              <span className="text-gray-600">Subtotal:</span>
              <span className="font-medium">${subtotal.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between items-center py-2 border-b border-gray-200">
              <span className="text-gray-600">Tax (8%):</span>
              <span className="font-medium">${tax.toFixed(2)}</span>
            </div>
            
            <div className="flex justify-between items-center py-2">
              <span className="text-lg font-semibold text-gray-900">Total:</span>
              <span className="text-lg font-bold text-blue-600">${total.toFixed(2)}</span>
            </div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 mt-6 pt-6 border-t border-gray-200">
          <Button
            onClick={handleAddToCart}
            disabled={isProcessing}
            className="flex-1 bg-orange-500 hover:bg-orange-600 text-white py-3"
          >
            <ShoppingCart className="w-4 h-4 mr-2" />
            {isProcessing ? 'Adding...' : 'Add to Cart'}
          </Button>
          
          <Button
            onClick={handleBuyNow}
            disabled={isProcessing}
            className="flex-1 bg-[#18448D] hover:bg-[#18448D]/90 text-white py-3"
          >
            <CreditCard className="w-4 h-4 mr-2" />
            {isProcessing ? 'Processing...' : 'Buy Now'}
          </Button>
        </div>

        <div className="mt-4 text-center">
          <p className="text-sm text-gray-600">
            Free next-day air shipping • 24-hour production • 100% satisfaction guarantee
          </p>
        </div>
      </div>
    </div>
  );
};

export default CheckoutSummary;
