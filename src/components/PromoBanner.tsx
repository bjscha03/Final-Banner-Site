import React from 'react';
import { Tag, Truck } from 'lucide-react';

const PromoBanner: React.FC = () => {
  return (
    <div className="bg-gradient-to-r from-orange-500 to-orange-600 text-white py-4 px-4 text-center shadow-lg">
      <div className="max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-center gap-2 md:gap-6">
          {/* Main Promo */}
          <div className="flex items-center gap-2 text-lg md:text-xl font-bold">
            <Tag className="w-5 h-5 md:w-6 md:h-6" />
            <span>20% OFF FIRST ORDER</span>
          </div>
          
          {/* Separator */}
          <span className="hidden md:inline text-2xl font-light">+</span>
          
          {/* Free Shipping */}
          <div className="flex items-center gap-2 text-lg md:text-xl font-bold">
            <Truck className="w-5 h-5 md:w-6 md:h-6" />
            <span>FREE NEXT-DAY AIR SHIPPING</span>
          </div>
        </div>
        
        {/* Subtext */}
        <p className="text-xs md:text-sm mt-2 opacity-90">
          Professional Quality • 24-Hour Production • No Minimum Order
        </p>
      </div>
    </div>
  );
};

export default PromoBanner;
