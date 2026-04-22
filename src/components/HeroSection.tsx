import React from 'react';
import { Star, Lock, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const HERO_BG_VIDEO_URL = 'https://res.cloudinary.com/dtrxl120u/video/upload/v1776752374/Multi-Shot_Video_-_Create_a_premium__high-end_commercial_background_video_for_a_fast_custom_printing_plodlm.mp4';

const HeroSection: React.FC = () => {
  const navigate = useNavigate();

  const handleUploadOrCreate = () => {
    navigate('/design');
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  return (
    <section className="relative w-full overflow-hidden bg-slate-950 py-14 sm:py-16 md:py-20 lg:py-24">
      <video
        className="pointer-events-none absolute left-1/2 top-1/2 h-full w-full -translate-x-1/2 -translate-y-1/2 object-cover"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
      >
        <source src={HERO_BG_VIDEO_URL} type="video/mp4" />
      </video>
      <div
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(to bottom, rgba(2,6,23,0.78), rgba(2,6,23,0.62) 45%, rgba(2,6,23,0.78))',
        }}
        aria-hidden="true"
      />
      <div className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div
          className="rounded-2xl border border-white/10 bg-black/15 p-6 sm:p-10 md:p-12 lg:p-16 backdrop-blur-[1px]"
          style={{
            boxShadow: '0 20px 48px rgba(2, 6, 23, 0.35)',
          }}
        >
          <div className="text-center text-white space-y-5 md:space-y-6">
            <div className="space-y-3">
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-black tracking-tight uppercase">
                Custom Banners & Yard Signs
              </h1>
              <p className="text-lg md:text-2xl text-slate-100">
                Printed in 24 Hours • Free <span className="text-orange-400 italic font-semibold">Next-Day Air</span> Shipping
              </p>
              <p className="text-sm md:text-base text-slate-200">
                Order today. Delivered tomorrow.
              </p>
            </div>

            <p className="text-base md:text-xl text-slate-100 font-semibold tracking-wide">
              <span className="font-extrabold">High-quality vinyl</span> • <span className="font-extrabold">Designer reviewed</span> • <span className="font-extrabold">20% off your first order</span>
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-1">
              <button
                onClick={handleUploadOrCreate}
                className="group relative px-8 py-3.5 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-red-500 text-white text-base font-semibold rounded-lg transition-all duration-300 min-w-[220px] shadow-lg hover:shadow-orange-500/40 hover:shadow-xl hover:-translate-y-0.5 overflow-hidden"
              >
                <span className="relative z-10">Upload Your Design →</span>
                <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/25 to-transparent opacity-0 group-hover:opacity-100 group-hover:animate-[btn-shine_0.8s_ease-in-out]" />
              </button>

              <button
                onClick={handleUploadOrCreate}
                className="px-8 py-3.5 bg-slate-700/55 hover:bg-slate-600/75 border border-slate-300/55 hover:border-slate-200 text-white text-base font-semibold rounded-lg transition-all duration-300 min-w-[220px] flex items-center justify-center gap-2 shadow-lg hover:shadow-xl hover:-translate-y-0.5"
              >
                Start Your Design
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-5 pt-2 text-sm text-slate-100">
              <div className="flex items-center gap-2">
                <Star className="w-4 h-4 text-yellow-400 fill-yellow-400" />
                <span>Trusted by 10,000+ customers nationwide</span>
              </div>
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-slate-200" />
                <span>Secure checkout</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-400" />
                <span>Satisfaction guaranteed</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
