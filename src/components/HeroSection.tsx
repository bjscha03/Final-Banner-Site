import React, { useState, useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const HeroSection: React.FC = () => {
  const navigate = useNavigate();
  const [currentImage, setCurrentImage] = useState(0);
  
  const images = [
    'https://res.cloudinary.com/dtrxl120u/image/upload/v1759857386/unnamed-2_fjdziv.jpg',
    'https://res.cloudinary.com/dtrxl120u/image/upload/v1759858723/IMG_1994_oew8pc.jpg',
    'https://res.cloudinary.com/dtrxl120u/image/upload/v1759800155/2019-07-19_10-03-03_cmg7im.png'
  ];
  
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentImage((prev) => (prev + 1) % images.length);
    }, 5000); // Change image every 5 seconds
    
    return () => clearInterval(interval);
  }, []);

  const handleStartDesigning = () => {
    navigate('/design');
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  return (
    <section className="bg-white">
      {/* Main Hero Banner - Amazon style */}
      <div className="relative bg-slate-800 overflow-hidden">
        {/* Background Image Carousel */}
        {/* First Image - Full coverage */}
        <div
          className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 ${
            currentImage === 0 ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            backgroundImage: `url(${images[0]})`,
          }}
        />
        {/* Second Image - Full coverage */}
        <div
          className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 ${
            currentImage === 1 ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            backgroundImage: `url(${images[1]})`,
          }}
        />
        {/* Third Image - Full coverage */}
        <div
          className={`absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 ${
            currentImage === 2 ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            backgroundImage: `url(${images[2]})`,
          }}
        />
        {/* Blue Overlay */}
        <div className="absolute inset-0 bg-slate-800/80" />
        
        {/* Content */}
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-16">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            {/* Left Content */}
            <div className="order-1 md:order-1">
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4">
                Custom Vinyl Banners
              </h1>
              <p className="text-xl md:text-2xl text-orange-500 font-semibold mb-6">
                24 Hour Production
              </p>
              <p className="text-lg text-slate-300 mb-8">
                Professional quality banners at competitive prices. Free next-day air shipping on all orders.
              </p>
              {/* Desktop button - hidden on mobile */}
              <button
                onClick={handleStartDesigning}
                className="hidden md:inline-flex items-center px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white text-lg font-semibold rounded-lg transition-colors duration-200"
              >
                Start Designing
                <ArrowRight className="ml-2 h-5 w-5" />
              </button>
            </div>

            {/* Right Content - Feature Highlights */}
            <div className="grid grid-cols-2 gap-4 order-2 md:order-2">
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <div className="text-3xl font-bold text-orange-500 mb-2">24hr</div>
                <div className="text-sm text-slate-200">Production Time</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <div className="text-3xl font-bold text-orange-500 mb-2">FREE</div>
                <div className="text-sm text-slate-200">Next-Day Shipping</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <div className="text-3xl font-bold text-orange-500 mb-2">10k+</div>
                <div className="text-sm text-slate-200">Happy Customers</div>
              </div>
              <div className="bg-white/10 backdrop-blur-sm p-6 rounded-lg border border-white/20">
                <div className="text-3xl font-bold text-orange-500 mb-2">100%</div>
                <div className="text-sm text-slate-200">Satisfaction</div>
              </div>
            </div>

            {/* Mobile button - appears below feature boxes, centered */}
            <div className="md:hidden order-3 col-span-full flex justify-center">
              <button
                onClick={handleStartDesigning}
                className="inline-flex items-center px-8 py-3 bg-orange-500 hover:bg-orange-600 text-white text-lg font-semibold rounded-lg transition-colors duration-200"
              >
                Start Designing
                <ArrowRight className="ml-2 h-5 w-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Category Cards - Amazon style product categories */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-2xl font-bold text-slate-900 mb-6">Banners for all Occasions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white border border-slate-200 rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <div className="text-center">
              <div className="text-4xl mb-3">🎯</div>
              <h3 className="font-semibold text-slate-900 mb-1">Business Banners</h3>
              <p className="text-sm text-slate-600">Promote your business</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <div className="text-center">
              <div className="text-4xl mb-3">🎉</div>
              <h3 className="font-semibold text-slate-900 mb-1">Event Banners</h3>
              <p className="text-sm text-slate-600">Festivals & parties</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <div className="text-center">
              <div className="text-4xl mb-3">🛍️</div>
              <h3 className="font-semibold text-slate-900 mb-1">Retail Banners</h3>
              <p className="text-sm text-slate-600">Sales & promotions</p>
            </div>
          </div>
          <div className="bg-white border border-slate-200 rounded-lg p-6 hover:shadow-lg transition-shadow cursor-pointer">
            <div className="text-center">
              <div className="text-4xl mb-3">🎓</div>
              <h3 className="font-semibold text-slate-900 mb-1">School Banners</h3>
              <p className="text-sm text-slate-600">Sports & events</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
