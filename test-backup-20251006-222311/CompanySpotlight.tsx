import React from 'react';
import { Award, Clock, CheckCircle, ArrowRight } from 'lucide-react';

const CompanySpotlight: React.FC = () => {
  const stats = [
    {
      icon: Award,
      label: "Banners Printed",
      value: "1000s"
    },
    {
      icon: Clock,
      label: "Turnaround",
      value: "24 Hours"
    },
    {
      icon: CheckCircle,
      label: "Satisfaction",
      value: "100%"
    }
  ];

  return (
    <section className="py-16 bg-gradient-to-br from-gray-50 via-blue-50/30 to-white relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-20">
        <div className="absolute top-1/3 right-1/4 w-96 h-96 bg-gradient-to-br from-blue-200/40 to-transparent rounded-full blur-3xl"></div>
        <div className="absolute bottom-1/3 left-1/4 w-96 h-96 bg-gradient-to-tl from-indigo-200/40 to-transparent rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Top Badge */}
        <div className="flex justify-center mb-8">
          <div className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white text-sm font-semibold rounded-full shadow-lg">
            <Award className="h-4 w-4 mr-2" />
            Company Spotlight
          </div>
        </div>

        {/* Main Card */}
        <div className="bg-white/80 backdrop-blur-sm rounded-3xl shadow-xl border border-gray-200/50 overflow-hidden hover:shadow-2xl transition-shadow duration-300">
          <div className="grid lg:grid-cols-2 gap-0">
            {/* Image Section - Left on Desktop, Top on Mobile */}
            <div className="relative h-64 lg:h-auto">
              <img
                src="https://res.cloudinary.com/dtrxl120u/image/upload/v1759799151/dan-oliver_1200xx3163-3170-1048-0_zgphzw.jpg"
                alt="Dan Oliver, Founder of Dan-O's Seasoning"
                className="w-full h-full object-cover"
              />
              {/* Gradient Overlay for better text contrast on mobile */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent lg:hidden"></div>
            </div>

            {/* Content Section - Right on Desktop, Bottom on Mobile */}
            <div className="p-8 lg:p-12 flex flex-col justify-center">
              {/* Headline */}
              <h2 className="text-3xl lg:text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-indigo-800 bg-clip-text text-transparent mb-6">
                Dan-O's Seasoning — a Day-One Partner
              </h2>

              {/* Body Copy */}
              <p className="text-lg text-gray-700 leading-relaxed mb-6">
                We've been proud to help Dan Oliver grow from local shows to a national brand. Dan-O's has trusted us for every banner since before we launched this new site — fast, dependable, and always top quality.
              </p>

              {/* Quote Block */}
              <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border-l-4 border-blue-600 p-6 rounded-r-xl mb-8">
                <p className="text-gray-700 italic leading-relaxed">
                  "We've trusted this crew for every banner since day one — long before their new site launched. They're fast, they care, and the quality's legit."
                </p>
                <p className="text-sm font-semibold text-gray-900 mt-3">
                  — Dan Oliver, Founder of Dan-O's Seasoning
                </p>
              </div>

              {/* Mini Stats Row */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                {stats.map((stat, index) => {
                  const Icon = stat.icon;
                  return (
                    <div
                      key={index}
                      className="bg-gradient-to-br from-white to-gray-50 border border-gray-200 rounded-xl p-4 text-center hover:shadow-md transition-all duration-300 hover:scale-105"
                    >
                      <Icon className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                      <p className="text-xs text-gray-600 font-medium mb-1">{stat.label}</p>
                      <p className="text-xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                        {stat.value}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4">
                <a
                  href="https://bannersonthefly.com/design"
                  className="inline-flex items-center justify-center px-8 py-4 bg-gradient-to-r from-orange-500 to-red-600 text-white font-bold rounded-xl shadow-lg hover:shadow-xl hover:scale-105 transition-all duration-300 group"
                >
                  Start Designing Now
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
                </a>
                <a
                  href="#quick-quote"
                  className="inline-flex items-center justify-center px-8 py-4 bg-transparent border-2 border-blue-600 text-blue-600 font-bold rounded-xl hover:bg-blue-50 transition-all duration-300 group"
                >
                  Get Quick Quote
                  <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default CompanySpotlight;
