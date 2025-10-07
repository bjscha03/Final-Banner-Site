import React from 'react';

const PromoBanner: React.FC = () => {
  return (
    <div className="bg-orange-500 text-white py-3 px-4 text-center animate-pulse-subtle">
      <div className="max-w-7xl mx-auto">
        <p className="text-sm md:text-base font-semibold">
          PROFESSIONAL BANNERS • FREE NEXT-DAY AIR • 24-HOUR PRODUCTION
        </p>
      </div>
    </div>
  );
};

export default PromoBanner;
