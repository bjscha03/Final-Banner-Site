/**
 * Sticky CTA Component
 */

import React from 'react';
import { Link } from 'react-router-dom';

interface StickyCTAProps {
  position?: 'top' | 'mid' | 'sticky';
}

export function StickyCTA({ position = 'sticky' }: StickyCTAProps) {
  const handleClick = () => {
    if (typeof window !== 'undefined' && (window as any).gtag) {
      (window as any).gtag('event', 'blog_cta_click', {
        position,
      });
    }
  };
  
  return (
    <div className="bg-gradient-to-r from-[#18448D] to-[#2563eb] rounded-lg p-6 text-white">
      <h3 className="text-xl font-bold mb-2">Ready to Create Your Custom Banner?</h3>
      <p className="mb-4 text-white/90">
        Get started with our easy-to-use design tool and bring your vision to life.
      </p>
      <div className="flex flex-col sm:flex-row gap-3">
        <Link
          to="/design"
          onClick={handleClick}
          className="inline-block px-6 py-3 bg-white text-[#18448D] font-semibold rounded-lg hover:bg-gray-100 transition-colors text-center"
        >
          Design Your Banner
        </Link>
      </div>
    </div>
  );
}
