import React from 'react';
import { useQuoteStore } from '@/store/quote';
import { ropeCost } from '@/lib/pricing';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

const RopeCard: React.FC = () => {
  const { addRope, widthIn, quantity, set } = useQuoteStore();

  const handleRopeChange = (checked: boolean) => {
    set({ addRope: checked });
  };

  const totalRopeCost = addRope ? ropeCost(widthIn, quantity) : 0;
  const linearFeet = widthIn / 12;

  return (
    <div className="bg-white rounded-2xl shadow-md p-5 md:p-6">
      <div className="flex items-center space-x-2 mb-6">
        <span className="text-lg">🪢</span>
        <h3 className="text-lg font-bold text-gray-900">Rope</h3>
      </div>

      <div className="space-y-4">
        <div className="flex items-start space-x-3">
          <Checkbox
            id="add-rope"
            checked={addRope}
            onCheckedChange={handleRopeChange}
            className="mt-1"
          />
          <div className="flex-1">
            <Label htmlFor="add-rope" className="text-base font-medium text-gray-900 cursor-pointer">
              Add Rope — $2 per linear foot of width
            </Label>
            <p className="text-sm text-gray-500 mt-1">
              Rope is calculated based on the width of your banner × quantity
            </p>
          </div>
        </div>

        {addRope && (
          <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Banner width:</span>
                <span className="font-medium">{widthIn}"</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Linear feet per banner:</span>
                <span className="font-medium">{linearFeet.toFixed(2)} ft</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Quantity:</span>
                <span className="font-medium">{quantity}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Rate:</span>
                <span className="font-medium">$2.00 per linear foot</span>
              </div>
              <div className="border-t border-yellow-300 pt-2 mt-2">
                <div className="flex justify-between font-semibold">
                  <span>Total rope cost:</span>
                  <span className="text-yellow-700">${totalRopeCost.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="p-3 bg-gray-50 rounded-lg">
          <p className="text-sm text-gray-600">
            <strong>What's included:</strong> High-quality rope for securing your banner. 
            Perfect for outdoor installations and temporary displays.
          </p>
        </div>
      </div>
    </div>
  );
};

export default RopeCard;
