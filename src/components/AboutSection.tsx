import React from 'react';
import { Award, Users, Clock, Shield } from 'lucide-react';

const AboutSection: React.FC = () => {
  const stats = [
    { icon: Clock, value: '24hr', label: 'Production Time', color: 'text-blue-600' },
    { icon: Shield, value: '100%', label: 'Satisfaction Rate', color: 'text-green-600' },
    { icon: Users, value: '10k+', label: 'Happy Customers', color: 'text-orange-600' },
    { icon: Award, value: 'Free', label: 'Shipping Over $20', color: 'text-purple-600' }
  ];

  return (
    <section className="py-16 bg-white relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-40">
        <div className="absolute top-0 right-0 w-72 h-72 bg-white rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-white rounded-full blur-3xl"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="grid lg:grid-cols-2 gap-12 items-center">
          {/* Left Column - Content */}
          <div>
            <h2 className="text-4xl font-bold text-slate-900 mb-6">
              The Story of Banners On The Fly
            </h2>
            <div className="space-y-4 text-gray-600">
              <p>
                Founded with a simple mission: to provide businesses with high-quality vinyl banners 
                delivered faster than anyone else in the industry. We recognized that businesses needed 
                professional signage solutions without the long wait times.
              </p>
              <p>
                Our state-of-the-art printing facility operates 24/7, ensuring that your banners are 
                printed, finished, and shipped within 24 hours of order confirmation. We've served over 
                10,000 satisfied customers nationwide, from small local businesses to Fortune 500 companies.
              </p>
              <p>
                What sets us apart is our commitment to quality materials, competitive pricing, and 
                exceptional customer service. Every banner is printed on premium vinyl materials and 
                undergoes rigorous quality control before shipping.
              </p>
            </div>

            <div className="mt-8 p-6 bg-white rounded-xl border border-blue-200/50 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900 mb-3">Our Mission</h3>
              <p className="text-gray-700">
                To empower businesses with professional-grade banners that help them stand out,
                attract customers, and grow their brand - all delivered with unmatched speed and quality.
              </p>
            </div>
          </div>

          {/* Right Column - Stats */}
          <div>
            <div className="grid grid-cols-2 gap-6 mb-8">
              {stats.map((stat, index) => {
                const IconComponent = stat.icon;
                return (
                  <div key={index} className="modern-card p-6 text-center">
                    <div className={`inline-flex items-center justify-center w-12 h-12 rounded-xl bg-gradient-to-br from-gray-100 to-gray-200 mb-4 shadow-sm`}>
                      <IconComponent className={`h-6 w-6 ${stat.color}`} />
                    </div>
                    <div className={`text-3xl font-bold ${stat.color} mb-1`}>
                      {stat.value}
                    </div>
                    <div className="text-sm text-gray-600 font-medium">
                      {stat.label}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="bg-white rounded-xl p-6 text-slate-900 shadow-sm">
              <h3 className="text-xl font-bold mb-4">Why Choose Us?</h3>
              <ul className="space-y-2 text-sm">
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-white rounded-full mr-3"></div>
                  Premium materials (13oz, 15oz, 18oz vinyl)
                </li>
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-white rounded-full mr-3"></div>
                  Easy-to-use online design tool
                </li>
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-white rounded-full mr-3"></div>
                  Expert customer support team
                </li>
                <li className="flex items-center">
                  <div className="w-2 h-2 bg-white rounded-full mr-3"></div>
                  100% satisfaction guarantee
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default AboutSection;