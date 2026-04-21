import React from 'react';
import { Check, Columns3, Cable } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { MaterialKey } from '@/store/quote';
import { useScrollReveal } from '@/hooks/useScrollReveal';

const PricingTable: React.FC = () => {
  const navigate = useNavigate();
  const { ref, isVisible } = useScrollReveal(0.1);

  const materials = [
    {
      name: "13oz Vinyl",
      key: "13oz" as MaterialKey,
      popular: false,
      description: "Perfect for indoor displays and short-term outdoor use",
      features: [
        "Indoor/Short-term outdoor",
        "Smooth finish",
        "Lightweight",
        "Cost-effective",
        "Grommets included"
      ]
    },
    {
      name: "15oz Vinyl",
      key: "15oz" as MaterialKey,
      popular: true,
      description: "Most popular choice for outdoor banners and events",
      features: [
        "All-weather durability",
        "UV resistant",
        "Tear resistant",
        "Professional grade",
        "Grommets included",
        "Wind resistant"
      ]
    },
    {
      name: "18oz Vinyl",
      key: "18oz" as MaterialKey,
      popular: false,
      description: "Heavy-duty material for long-term outdoor displays",
      features: [
        "Maximum durability",
        "Extreme weather resistant",
        "Long-term outdoor use",
        "Premium quality",
        "Grommets included",
        "Fade resistant"
      ]
    },
    {
      name: "Mesh Fence",
      key: "mesh" as MaterialKey,
      popular: false,
      description: "Wind-resistant mesh perfect for fencing and construction",
      features: [
        "Wind-through design",
        "Fence mounting",
        "Construction sites",
        "Reduced wind load",
        "Grommets included",
        "Weather resistant"
      ]
    }
  ];

  const handleMaterialSelect = (_materialKey: MaterialKey) => {
    navigate('/design');
    setTimeout(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }, 100);
  };

  return (
    <section className="py-20 bg-gradient-to-b from-slate-50 to-white relative overflow-hidden">
      {/* Background Pattern */}
      <div className="absolute inset-0 opacity-30">
        <div className="absolute top-0 right-1/4 w-80 h-80 bg-white rounded-full blur-3xl"></div>
        <div className="absolute bottom-0 left-1/4 w-80 h-80 bg-white rounded-full blur-3xl"></div>
      </div>

      <div ref={ref} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
        {/* Header Section */}
        <div className={`text-center mb-16 scroll-reveal ${isVisible ? 'visible' : ''}`}>
          <h2 className="text-4xl font-bold text-slate-900 mb-6">
            Material Pricing
          </h2>
          <p className="text-xl text-gray-700 max-w-2xl mx-auto leading-relaxed">
            Choose the perfect material for your banner needs.
          </p>
        </div>

        {/* Pricing Cards Grid */}
        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
          {materials.map((material, index) => (
            <div
              key={index}
              className={`${
                material.popular
                  ? 'material-card-popular'
                  : 'material-card'
              } relative flex flex-col h-full scroll-reveal ${isVisible ? 'visible' : ''}`}
              style={{ transitionDelay: `${(index + 1) * 150}ms` }}
            >
              {/* Popular Badge - Fixed Height */}
              <div className="h-12 flex items-center justify-center mb-2">
                {material.popular && (
                  <div className="bg-orange-500 text-white px-4 py-2 rounded-full text-xs font-bold shadow-sm">
                    <span className="flex items-center gap-1.5">
                      <span>⭐</span>
                      Most Popular
                    </span>
                  </div>
                )}
              </div>

              {/* Header Section - Fixed Height */}
              <div className="text-center mb-8 px-6">
                <h3 className="text-2xl font-bold text-orange-500 mb-4 leading-tight min-h-[2rem] flex items-center justify-center">
                  {material.name}
                </h3>
                <p className="text-gray-700 font-medium leading-relaxed min-h-[4.5rem] flex items-center justify-center text-center">
                  {material.description}
                </p>
              </div>

              {/* Features List - Flexible Height */}
              <div className="flex-1 px-6 mb-8">
                <ul className="space-y-3">
                  {material.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start text-sm">
                      <Check className="h-4 w-4 text-green-500 mr-3 flex-shrink-0 mt-0.5" />
                      <span className="text-gray-700 leading-relaxed">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Button - Fixed Position at Bottom */}
              <div className="px-6 pb-6">
                <button
                  onClick={() => handleMaterialSelect(material.key)}
                  className={`w-full py-4 px-6 rounded-xl font-bold text-base transition-all duration-200 shadow-lg hover:shadow-xl ${
                    material.popular
                      ? 'bg-orange-500 hover:bg-orange-600 text-white'
                      : 'bg-[#18448D] hover:bg-[#0f2d5c] text-white'
                  }`}
                  aria-label={`Select ${material.name} and go to design tool`}
                >
                  Select {material.name}
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Add-On Options Section */}
        <div className="mt-16 bg-white rounded-lg p-10 shadow-sm border border-gray-200/50">
          <h3 className="text-2xl font-bold text-gray-900 mb-8 text-center">
            Add-On Options
          </h3>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="text-center p-6 border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all duration-300">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Check className="h-6 w-6 text-green-600" />
              </div>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">Grommets</h4>
              <p className="text-gray-600 mb-4 leading-relaxed">Metal reinforced holes for hanging</p>
              <div className="bg-green-50 text-green-700 font-bold py-2 px-4 rounded-lg">
                Included Free
              </div>
            </div>
            <div className="text-center p-6 border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all duration-300">
              <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Columns3 className="h-6 w-6 text-blue-600" />
              </div>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">Pole Pockets</h4>
              <p className="text-gray-600 mb-4 leading-relaxed">Sewn pockets for pole mounting (1", 2", 3", 4" sizes)</p>
              <div className="bg-blue-50 text-blue-700 font-bold py-2 px-4 rounded-lg">
                <div>$15 setup fee</div>
                <div className="text-sm">+$2.00/linear ft</div>
              </div>
            </div>
            <div className="text-center p-6 border border-gray-200 rounded-xl hover:border-blue-300 hover:shadow-sm transition-all duration-300">
              <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Cable className="h-6 w-6 text-orange-600" />
              </div>
              <h4 className="font-bold text-gray-900 mb-3 text-lg">Rope</h4>
              <p className="text-gray-600 mb-4 leading-relaxed">Nylon rope for secure mounting</p>
              <div className="bg-orange-50 text-orange-700 font-bold py-2 px-4 rounded-lg">
                +$2.00/linear ft
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PricingTable;
