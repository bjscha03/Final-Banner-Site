import React, { useState } from 'react';
import { FileText, Star, Lock, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import QuickQuoteModal from '@/components/QuickQuoteModal';

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
    <section className="bg-[#1a2332]">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-20">
        {/* Centered Content */}
        <div className="text-center text-white space-y-4">
          {/* Main Heading */}
          <div className="space-y-3">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold tracking-tight uppercase">
              Custom Banners
            </h1>
            <p className="text-lg md:text-xl lg:text-2xl font-normal text-slate-200">
              Printed Fast, Shipped <span className="text-orange-400 italic font-semibold">FREE</span> Next-Day Air
            </p>
          </div>

          {/* Subheading */}
          <p className="text-base md:text-lg text-slate-300 pt-2">
            24-Hour Production • Free Next-Day Air Shipping • 20% Off First Order
          </p>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            {/* Upload or Create Button - Orange */}
            <button
              onClick={handleUploadOrCreate}
              className="px-8 py-3.5 bg-orange-500 hover:bg-orange-600 text-white text-base font-semibold rounded-lg transition-colors duration-200 min-w-[200px]"
            >
              Upload or Create
            </button>

            {/* Quick Quote Button - Dark outline */}
            <button
              onClick={() => setShowQuickQuote(true)}
              className="px-8 py-3.5 bg-slate-700/50 hover:bg-slate-700 border border-slate-500 text-white text-base font-semibold rounded-lg transition-colors duration-200 min-w-[200px] flex items-center justify-center gap-2"
            >
              <FileText className="w-4 h-4" />
              Quick Quote
            </button>
          </div>

          {/* Trust Indicators */}
          <div className="flex flex-wrap items-center justify-center gap-6 pt-6 text-sm text-slate-300">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
              <span>10,000+ happy customers</span>
            </div>
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-400" />
              <span>Secure checkout</span>
            </div>
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-400" />
              <span>Satisfaction guaranteed</span>
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
