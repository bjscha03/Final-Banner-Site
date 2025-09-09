import React from 'react';
import { Clock, Shield, Users, Truck, Award, HeartHandshake } from 'lucide-react';

const WhyChooseUs: React.FC = () => {
  const features = [
    {
      icon: Clock,
      title: "24-Hour Production",
      description: "Lightning-fast turnaround with guaranteed next-day delivery for rush orders."
    },
    {
      icon: Shield,
      title: "Quality Guarantee",
      description: "Professional printing with premium materials and rigorous quality control."
    },
    {
      icon: Users,
      title: "10,000+ Happy Customers",
      description: "Trusted by businesses nationwide for professional banner printing services."
    },
    {
      icon: Truck,
      title: "Free Shipping",
      description: "Complimentary shipping on all orders over $20 with tracking included."
    },
    {
      icon: Award,
      title: "Premium Materials",
      description: "High-grade vinyl materials (13oz, 15oz, 18oz) built to withstand weather."
    },
    {
      icon: HeartHandshake,
      title: "Expert Support",
      description: "Dedicated customer service team available 24/7 to help with your orders."
    }
  ];

  return (
    <section className="py-16 bg-gradient-to-br from-blue-50 via-indigo-50/50 to-purple-50/30 relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-40">
        <div className="absolute top-0 left-0 w-96 h-96 bg-gradient-to-br from-blue-300/30 to-transparent rounded-full blur-3xl transform -translate-x-1/3 -translate-y-1/3"></div>
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-gradient-to-tl from-purple-300/30 to-transparent rounded-full blur-3xl transform translate-x-1/3 translate-y-1/3"></div>
        <div className="absolute top-1/2 left-1/2 w-64 h-64 bg-gradient-to-r from-indigo-300/20 to-transparent rounded-full blur-3xl transform -translate-x-1/2 -translate-y-1/2"></div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-purple-800 bg-clip-text text-transparent mb-4">
            Why Choose Banners On The Fly?
          </h2>
          <p className="text-xl text-gray-700 max-w-2xl mx-auto">
            We combine cutting-edge technology with premium materials to deliver
            professional banners that exceed your expectations.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => {
            const IconComponent = feature.icon;
            return (
              <div key={index} className="feature-card p-8">
                <div className="flex items-center mb-6">
                  <div className="bg-gradient-to-br from-orange-100 to-orange-200 p-4 rounded-xl group-hover:from-orange-200 group-hover:to-orange-300 transition-all duration-300 shadow-sm">
                    <IconComponent className="h-6 w-6 text-orange-600" />
                  </div>
                  <h3 className="ml-4 text-xl font-bold bg-gradient-to-r from-gray-900 to-orange-800 bg-clip-text text-transparent">
                    {feature.title}
                  </h3>
                </div>
                <p className="text-gray-700 leading-relaxed">
                  {feature.description}
                </p>
              </div>
            );
          })}
        </div>



        {/* Facility Image */}
        <div className="mt-16">
          <div className="relative max-w-5xl mx-auto">
            {/* Professional Frame Container */}
            <div className="relative bg-gradient-to-br from-white via-gray-50 to-gray-100 p-6 md:p-8 rounded-3xl shadow-2xl border border-gray-200/50">
              {/* Inner Frame */}
              <div className="relative bg-white p-4 md:p-6 rounded-2xl shadow-lg border border-gray-100">
                {/* Image Container */}
                <div className="relative overflow-hidden rounded-xl">
                  <img
                    src="https://d64gsuwffb70l.cloudfront.net/68bb812d3c680d9a9bc2bdd7_1757118821237_400c4896.webp"
                    alt="Professional Banner Printing Facility"
                    className="w-full h-auto object-cover transition-transform duration-700 hover:scale-105"
                  />
                  {/* Subtle overlay for depth */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/5 via-transparent to-transparent pointer-events-none"></div>
                </div>

                {/* Professional Caption */}
                <div className="mt-6 text-center">
                  <div className="inline-flex items-center justify-center px-6 py-3 bg-gradient-to-r from-blue-50 via-indigo-50 to-purple-50 rounded-full border border-blue-100/50 shadow-sm">
                    <div className="w-2 h-2 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full mr-3 animate-pulse"></div>
                    <h3 className="text-lg md:text-xl font-bold bg-gradient-to-r from-gray-900 via-blue-800 to-indigo-800 bg-clip-text text-transparent">
                      State-of-the-Art Printing Facility
                    </h3>
                  </div>
                  <p className="mt-4 text-gray-600 text-base md:text-lg leading-relaxed max-w-2xl mx-auto">
                    Our advanced printing technology and quality control processes ensure
                    <span className="font-semibold text-gray-800"> consistent excellence</span> and
                    <span className="font-semibold text-gray-800"> lightning-fast turnaround</span> on every order.
                  </p>
                </div>
              </div>

              {/* Decorative corner elements */}
              <div className="absolute top-2 left-2 w-6 h-6 border-l-2 border-t-2 border-blue-300/50 rounded-tl-lg"></div>
              <div className="absolute top-2 right-2 w-6 h-6 border-r-2 border-t-2 border-blue-300/50 rounded-tr-lg"></div>
              <div className="absolute bottom-2 left-2 w-6 h-6 border-l-2 border-b-2 border-blue-300/50 rounded-bl-lg"></div>
              <div className="absolute bottom-2 right-2 w-6 h-6 border-r-2 border-b-2 border-blue-300/50 rounded-br-lg"></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default WhyChooseUs;