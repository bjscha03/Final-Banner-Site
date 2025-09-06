import React from 'react';
import { ArrowRight, Clock, Users, Shield, Zap, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const HeroSection: React.FC = () => {
  const navigate = useNavigate();

  const handleStartDesigning = () => {
    navigate('/design');
    // Scroll to top after navigation
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  const handleQuickQuote = () => {
    const quickQuoteElement = document.getElementById('quick-quote');
    if (quickQuoteElement) {
      quickQuoteElement.scrollIntoView({ behavior: 'smooth' });
      // Focus the width input after scroll animation completes
      setTimeout(() => {
        const widthInput = document.getElementById('qq-width') as HTMLInputElement;
        if (widthInput) {
          widthInput.focus();
        }
      }, 550);
    }
  };

  return (
    <section className="relative min-h-screen bg-gradient-to-br from-slate-900 via-blue-900 to-indigo-900 text-white overflow-hidden flex items-center">
      {/* Subtle Background Pattern */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,119,198,0.3),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(59,130,246,0.2),transparent_50%)]"></div>
        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.02)_50%,transparent_75%)] bg-[length:60px_60px]"></div>
      </div>

      <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
        <div className="text-center max-w-5xl mx-auto">
          {/* Trust Badge */}
          <div className="inline-flex items-center gap-3 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-400/30 px-6 py-3 text-sm font-semibold tracking-wide backdrop-blur-sm mb-12 animate-pulse">
            <Zap className="h-4 w-4" />
            <span>PROFESSIONAL BANNERS • NEXT-DAY DELIVERY • 100% GUARANTEE</span>
            <CheckCircle className="h-4 w-4" />
          </div>

          {/* Main Heading */}
          <div className="space-y-6 mb-12">
            <h1 className="text-5xl md:text-7xl lg:text-8xl font-black leading-none tracking-tight">
              <span className="block text-white mb-4">BANNERS</span>
              <span className="block bg-gradient-to-r from-orange-400 via-red-500 to-pink-500 bg-clip-text text-transparent">
                ON THE FLY
              </span>
            </h1>

            <p className="text-xl md:text-2xl text-slate-300 font-light max-w-3xl mx-auto leading-relaxed">
              Professional vinyl banners delivered faster than anyone else.
              <span className="text-white font-medium"> Premium quality, competitive pricing, 24-hour production.</span>
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-6 justify-center items-center mb-20">
            <button
              onClick={handleStartDesigning}
              className="group relative inline-flex items-center justify-center px-10 py-5 text-lg font-bold text-white bg-gradient-to-r from-orange-500 to-red-600 rounded-2xl shadow-2xl shadow-orange-500/25 hover:shadow-orange-500/40 transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 active:scale-95"
              aria-label="Navigate to design tool"
            >
              <span>Start Designing Now</span>
              <ArrowRight className="h-5 w-5 ml-3 transition-transform duration-300 group-hover:translate-x-1" />
              <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 transform -skew-x-12 -translate-x-full transition-transform duration-700 group-hover:translate-x-full rounded-2xl"></div>
            </button>

            <button
              onClick={handleQuickQuote}
              className="group inline-flex items-center justify-center px-10 py-5 text-lg font-bold border-2 border-white/30 text-white hover:bg-white/10 hover:border-white/50 rounded-2xl backdrop-blur-sm transition-all duration-300 transform hover:scale-105 hover:-translate-y-1 active:scale-95"
              aria-label="Scroll to quick quote section"
            >
              <span>Get Quick Quote</span>
              <ArrowRight className="h-5 w-5 ml-3 transition-transform duration-300 group-hover:translate-x-1" />
            </button>
          </div>

          {/* Stats Section */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            <div className="group text-center p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all duration-300">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-blue-600/20 border border-blue-400/30 mb-6 group-hover:scale-110 transition-transform duration-300">
                <Clock className="h-8 w-8 text-blue-400" />
              </div>
              <div className="text-4xl md:text-5xl font-black text-white mb-2">24hr</div>
              <div className="text-slate-300 font-medium text-lg">Production Time</div>
              <div className="text-slate-400 text-sm mt-1">Guaranteed delivery</div>
            </div>

            <div className="group text-center p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all duration-300">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 border border-emerald-400/30 mb-6 group-hover:scale-110 transition-transform duration-300">
                <Users className="h-8 w-8 text-emerald-400" />
              </div>
              <div className="text-4xl md:text-5xl font-black text-white mb-2">10k+</div>
              <div className="text-slate-300 font-medium text-lg">Happy Customers</div>
              <div className="text-slate-400 text-sm mt-1">Nationwide</div>
            </div>

            <div className="group text-center p-8 rounded-3xl bg-white/5 border border-white/10 backdrop-blur-sm hover:bg-white/10 transition-all duration-300">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-orange-500/20 to-orange-600/20 border border-orange-400/30 mb-6 group-hover:scale-110 transition-transform duration-300">
                <Shield className="h-8 w-8 text-orange-400" />
              </div>
              <div className="text-4xl md:text-5xl font-black text-white mb-2">100%</div>
              <div className="text-slate-300 font-medium text-lg">Satisfaction Rate</div>
              <div className="text-slate-400 text-sm mt-1">Money-back guarantee</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;