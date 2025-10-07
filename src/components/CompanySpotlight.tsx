import React from 'react';
import { Star, ArrowRight } from 'lucide-react';

const CompanySpotlight: React.FC = () => {
  return (
    <section className="bg-slate-50 py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white border border-slate-200 rounded-lg overflow-hidden shadow-sm">
          <div className="grid md:grid-cols-2 gap-0">
            {/* Image */}
            <div className="relative h-64 md:h-full min-h-[400px] bg-slate-100">
              <img
                src="https://res.cloudinary.com/dtrxl120u/image/upload/v1759799151/dan-oliver_1200xx3163-3170-1048-0_zgphzw.jpg"
                alt="Dan Oliver - Dan-O's Seasoning"
                className="w-full h-full object-cover"
                loading="eager"
                onError={(e) => {
                  console.error('Image failed to load:', e);
                  const target = e.currentTarget as HTMLImageElement;
                  target.style.display = 'block';
                  target.style.backgroundColor = '#f1f5f9';
                }}
              />
            </div>

            {/* Content */}
            <div className="p-8 md:p-12 flex flex-col justify-center">
              <div className="inline-flex items-center gap-2 bg-orange-50 text-orange-600 px-3 py-1 rounded-full text-sm font-semibold mb-4 w-fit">
                <Star className="h-4 w-4 fill-current" />
                Featured Customer
              </div>
              
              <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">
                Dan-O's Seasoning
              </h2>
              
              <div className="border-l-4 border-orange-500 pl-4 mb-6">
                <p className="text-lg text-slate-700 italic leading-relaxed">
                  "Banners on the Fly delivered exactly what we needed for our nationwide events. 
                  Fast, professional, and high quality every time."
                </p>
                <p className="text-sm text-slate-600 mt-3 font-semibold">
                  — Dan Oliver, Founder
                </p>
              </div>

              <div className="flex items-center gap-8 mb-6">
                <div>
                  <div className="text-3xl font-bold text-orange-500">100+</div>
                  <div className="text-sm text-slate-600">Banners Ordered</div>
                </div>
                <div>
                  <div className="text-3xl font-bold text-orange-500">5★</div>
                  <div className="text-sm text-slate-600">Rating</div>
                </div>
              </div>

              <a
                href="/design"
                className="inline-flex items-center justify-center bg-orange-500 hover:bg-orange-600 text-white font-semibold text-lg px-8 py-4 rounded-md shadow-sm transition-colors group"
              >
                Start your order
                <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CompanySpotlight;
