import React from 'react';
export interface BannerDiscountOfferProps { className?: string; variant?: 'default' | 'light'; }
const BannerDiscountOffer: React.FC<BannerDiscountOfferProps> = ({ className = '' }) => (
  <div data-banner-discount-offer className={`border-l-[3px] border-[#FF6A00] pl-4 text-[#061A31] ${className}`}>
    <p className="text-base font-bold sm:text-lg">20% off your first order</p>
    <p className="mt-1 text-sm">Use code <strong>NEW20</strong></p>
  </div>
);
export default BannerDiscountOffer;
