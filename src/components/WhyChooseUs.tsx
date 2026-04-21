import React from 'react';
import { Clock, Shield, Truck, Award, Trophy, Headphones } from 'lucide-react';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const WhyChooseUs: React.FC = () => {
  const { ref, isVisible } = useScrollReveal(0.1);

  const features = [
    {
      icon: Clock,
      title: '24-Hour Production',
      description: 'Your order printed and shipped within 24 hours of order approval.',
      gradient: 'from-orange-500 to-amber-500',
    },
    {
      icon: Truck,
      title: 'Free Next-Day Air',
      description: 'Complimentary expedited shipping on all orders, nationwide.',
      gradient: 'from-blue-500 to-cyan-500',
    },
    {
      icon: Shield,
      title: 'Premium Quality',
      description: '13oz, 15oz, & 18oz vinyl material with vibrant, long-lasting colors.',
      gradient: 'from-emerald-500 to-green-500',
    },
    {
      icon: Trophy,
      title: 'Trusted by Top Brands',
      description: 'We\'ve supplied banners to leading companies like Dan-O\'s Seasoning and hundreds of growing brands nationwide.',
      gradient: 'from-purple-500 to-indigo-500',
    },
    {
      icon: Award,
      title: '100% Satisfaction',
      description: 'We stand behind our work with a complete satisfaction guarantee.',
      gradient: 'from-rose-500 to-pink-500',
    },
    {
      icon: Headphones,
      title: 'Expert Support',
      description: 'Dedicated customer service team ready to help you.',
      gradient: 'from-sky-500 to-blue-500',
    }
  ];

  return (
    <section className="bg-gradient-to-b from-white to-slate-50 py-16">
      <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className={`text-center mb-12 scroll-reveal ${isVisible ? 'visible' : ''}`}>
          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            Why Choose Banners on the Fly?
          </h2>
          <p className="text-lg text-slate-600">
            Fast, professional, and reliable signage printing
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const IconComponent = feature.icon;
            return (
              <div
                key={index}
                className={`bg-white border border-slate-200 rounded-xl p-6 hover:shadow-xl hover:border-orange-300 hover:-translate-y-1 transition-all duration-300 group scroll-reveal scroll-reveal-delay-${index + 1} ${isVisible ? 'visible' : ''}`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className={`w-12 h-12 bg-gradient-to-br ${feature.gradient} rounded-xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                      <IconComponent className="h-6 w-6 text-white" />
                    </div>
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900 mb-2">
                      {feature.title}
                    </h3>
                    <p className="text-slate-600 text-sm leading-relaxed">
                      {feature.description}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export default WhyChooseUs;
