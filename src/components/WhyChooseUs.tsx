import React from 'react';
import { Clock, Shield, Truck, Award, DollarSign, Headphones } from 'lucide-react';

const WhyChooseUs: React.FC = () => {
  const features = [
    {
      icon: Clock,
      title: '24-Hour Production',
      description: 'Your banners printed and shipped within 24 hours of order approval.'
    },
    {
      icon: Truck,
      title: 'Free Next-Day Air',
      description: 'Complimentary expedited shipping on all orders, nationwide.'
    },
    {
      icon: Shield,
      title: 'Premium Quality',
      description: '13oz vinyl material with vibrant, long-lasting colors.'
    },
    {
      icon: DollarSign,
      title: 'Best Price Guarantee',
      description: 'Competitive pricing without compromising on quality.'
    },
    {
      icon: Award,
      title: '100% Satisfaction',
      description: 'We stand behind our work with a complete satisfaction guarantee.'
    },
    {
      icon: Headphones,
      title: 'Expert Support',
      description: 'Dedicated customer service team ready to help you.'
    }
  ];

  return (
    <section className="bg-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold text-slate-900 mb-3">
            Why Choose Banners on the Fly?
          </h2>
          <p className="text-lg text-slate-600">
            Fast, professional, and reliable banner printing
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => {
            const IconComponent = feature.icon;
            return (
              <div
                key={index}
                className="bg-white border border-slate-200 rounded-lg p-6 hover:shadow-lg hover:border-orange-300 transition-all duration-200"
              >
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0">
                    <div className="w-12 h-12 bg-orange-100 rounded-lg flex items-center justify-center">
                      <IconComponent className="h-6 w-6 text-orange-600" />
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
