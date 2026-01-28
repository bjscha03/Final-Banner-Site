import React, { useState } from 'react';
import { FileText, Star, Lock, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import QuickQuoteModal from '@/components/QuickQuoteModal';

// Realistic metal grommet component
const Grommet: React.FC<{ position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' }> = ({ position }) => {
  const positionClasses = {
    'top-left': 'top-3 left-3 sm:top-4 sm:left-4 md:top-5 md:left-5',
    'top-right': 'top-3 right-3 sm:top-4 sm:right-4 md:top-5 md:right-5',
    'bottom-left': 'bottom-3 left-3 sm:bottom-4 sm:left-4 md:bottom-5 md:left-5',
    'bottom-right': 'bottom-3 right-3 sm:bottom-4 sm:right-4 md:bottom-5 md:right-5',
  };

  return (
    <div className={`absolute ${positionClasses[position]} z-20`}>
      {/* Outer metal ring */}
      <div className="w-5 h-5 sm:w-6 sm:h-6 md:w-7 md:h-7 rounded-full relative"
        style={{
          background: 'linear-gradient(145deg, #e8e8e8 0%, #b8b8b8 25%, #d4d4d4 50%, #9a9a9a 75%, #c0c0c0 100%)',
          boxShadow: `
            0 2px 4px rgba(0,0,0,0.4),
            inset 0 1px 2px rgba(255,255,255,0.6),
            inset 0 -1px 2px rgba(0,0,0,0.3)
          `,
        }}
      >
        {/* Inner ring bevel */}
        <div className="absolute inset-[2px] sm:inset-[3px] rounded-full"
          style={{
            background: 'linear-gradient(145deg, #a0a0a0 0%, #d0d0d0 40%, #888888 100%)',
            boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.4)',
          }}
        >
          {/* Center hole */}
          <div className="absolute inset-[3px] sm:inset-[4px] rounded-full"
            style={{
              background: 'linear-gradient(145deg, #0d1520 0%, #1a2332 50%, #0a0f18 100%)',
              boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.8)',
            }}
          />
        </div>
      </div>
    </div>
  );
};

const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  const [showQuickQuote, setShowQuickQuote] = useState(false);

  const handleUploadOrCreate = () => {
    navigate('/design');
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  return (
    <section className="bg-slate-950 py-3 sm:py-4 md:py-6">
      {/* Banner Container with vinyl effect */}
      <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6">
        <div
          className="relative overflow-hidden rounded-sm"
          style={{
            // Vinyl banner material background with texture
            background: `
              linear-gradient(135deg, rgba(255,255,255,0.03) 0%, transparent 50%, rgba(0,0,0,0.05) 100%),
              linear-gradient(45deg, transparent 40%, rgba(255,255,255,0.02) 50%, transparent 60%),
              linear-gradient(180deg, #1e2d42 0%, #1a2738 15%, #182433 50%, #151f2c 85%, #121a24 100%)
            `,
            // Subtle inner shadow for thickness illusion
            boxShadow: `
              inset 0 0 30px rgba(0,0,0,0.4),
              inset 0 0 60px rgba(0,0,0,0.2),
              0 4px 20px rgba(0,0,0,0.5),
              0 2px 8px rgba(0,0,0,0.3)
            `,
          }}
        >
          {/* Vinyl texture overlay - fine grain effect */}
          <div
            className="absolute inset-0 opacity-[0.15] pointer-events-none"
            style={{
              backgroundImage: `
                repeating-linear-gradient(
                  0deg,
                  transparent,
                  transparent 1px,
                  rgba(255,255,255,0.03) 1px,
                  rgba(255,255,255,0.03) 2px
                ),
                repeating-linear-gradient(
                  90deg,
                  transparent,
                  transparent 1px,
                  rgba(255,255,255,0.02) 1px,
                  rgba(255,255,255,0.02) 2px
                )
              `,
              backgroundSize: '3px 3px',
            }}
          />

          {/* Light reflection sweep - mimics how light hits vinyl */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `
                linear-gradient(
                  115deg,
                  transparent 0%,
                  transparent 30%,
                  rgba(255,255,255,0.04) 45%,
                  rgba(255,255,255,0.06) 50%,
                  rgba(255,255,255,0.04) 55%,
                  transparent 70%,
                  transparent 100%
                )
              `,
            }}
          />

          {/* Subtle edge tension effect - very faint wrinkle near edges */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: `
                linear-gradient(90deg, rgba(0,0,0,0.08) 0%, transparent 3%, transparent 97%, rgba(0,0,0,0.08) 100%),
                linear-gradient(180deg, rgba(0,0,0,0.06) 0%, transparent 4%, transparent 96%, rgba(0,0,0,0.06) 100%)
              `,
            }}
          />

          {/* Corner grommets */}
          <Grommet position="top-left" />
          <Grommet position="top-right" />
          <Grommet position="bottom-left" />
          <Grommet position="bottom-right" />

          {/* Content */}
          <div className="relative z-10 px-8 sm:px-12 md:px-16 lg:px-20 py-12 sm:py-14 md:py-16 lg:py-20">
            {/* Centered Content */}
            <div className="text-center text-white space-y-4">
              {/* Main Heading */}
              <div className="space-y-3">
                <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight uppercase drop-shadow-lg">
                  Custom Banners
                </h1>
                <p className="text-lg md:text-xl lg:text-2xl font-normal text-slate-200 drop-shadow-md">
                  Printed Fast, Shipped <span className="text-orange-400 italic font-semibold">FREE</span> Next-Day Air
                </p>
              </div>

              {/* Subheading - Bold feature points */}
              <p className="text-base md:text-lg text-slate-300 pt-2 font-bold drop-shadow-sm">
                24-Hour Production • Free Next-Day Air Shipping • 20% Off First Order
              </p>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                {/* Upload or Create Button - Orange */}
                <button
                  onClick={handleUploadOrCreate}
                  className="px-8 py-3.5 bg-orange-500 hover:bg-orange-600 text-white text-base font-semibold rounded-lg transition-colors duration-200 min-w-[200px] shadow-lg hover:shadow-xl"
                >
                  Upload or Create
                </button>

                {/* Quick Quote Button - Dark outline */}
                <button
                  onClick={() => setShowQuickQuote(true)}
                  className="px-8 py-3.5 bg-slate-700/50 hover:bg-slate-700 border border-slate-500 text-white text-base font-semibold rounded-lg transition-colors duration-200 min-w-[200px] flex items-center justify-center gap-2 shadow-lg hover:shadow-xl backdrop-blur-sm"
                >
                  <FileText className="w-4 h-4" />
                  Quick Quote
                </button>
              </div>

              {/* Trust Indicators */}
              <div className="flex flex-wrap items-center justify-center gap-6 pt-6 text-sm text-slate-300">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-yellow-400 fill-yellow-400 drop-shadow-sm" />
                  <span>10,000+ happy customers</span>
                </div>
                <div className="flex items-center gap-2">
                  <Lock className="w-4 h-4 text-slate-400" />
                  <span>Secure checkout</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400 drop-shadow-sm" />
                  <span>Satisfaction guaranteed</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Quote Modal */}
      <QuickQuoteModal
        isOpen={showQuickQuote}
        onClose={() => setShowQuickQuote(false)}
      />
    </section>
  );
};

export default HeroSection;
