import React from 'react';
import { Check, Upload, Settings, ShoppingCart } from 'lucide-react';
import { useQuoteStore } from '@/store/quote';

const ProgressIndicator: React.FC = () => {
  const { file, widthIn, heightIn, material } = useQuoteStore();
  const hasUpload = !!file;
  const hasConfiguration = hasUpload && widthIn > 0 && heightIn > 0;
  
  const steps = [
    { number: 1, label: 'Upload Artwork', icon: Upload, completed: hasUpload, active: !hasUpload },
    { number: 2, label: 'Configure Size & Options', icon: Settings, completed: hasConfiguration, active: hasUpload && !hasConfiguration },
    { number: 3, label: 'Add to Cart', icon: ShoppingCart, completed: false, active: hasConfiguration },
  ];

  return (
    <div className="bg-white rounded-lg shadow-md p-4 md:p-6 sticky top-0 z-40 transition-all duration-300">
      <div className="flex items-center justify-between max-w-4xl mx-auto">
        {steps.map((step, index) => {
          const Icon = step.icon;
          const isLast = index === steps.length - 1;
          return (
            <React.Fragment key={step.number}>
              <div className="flex flex-col items-center flex-shrink-0">
                <div className={`w-10 h-10 md:w-12 md:h-12 rounded-full flex items-center justify-center transition-all duration-300 mb-2 ${step.completed ? 'bg-green-500 text-white shadow-lg' : step.active ? 'bg-[#18448D] text-white shadow-lg ring-4 ring-blue-200' : 'bg-gray-200 text-gray-500'}`}>
                  {step.completed ? <Check className="h-5 w-5 md:h-6 md:w-6" /> : <Icon className="h-5 w-5 md:h-6 md:w-6" />}
                </div>
                <span className={`text-xs md:text-sm font-medium text-center max-w-[80px] md:max-w-none ${step.active || step.completed ? 'text-gray-900' : 'text-gray-500'}`}>{step.label}</span>
              </div>
              {!isLast && (
                <div className="flex-1 h-1 mx-2 md:mx-4 relative">
                  <div className="absolute inset-0 bg-gray-200 rounded"></div>
                  <div className={`absolute inset-0 rounded transition-all duration-500 ${step.completed ? 'bg-green-500' : 'bg-gray-200'}`} style={{ width: step.completed ? '100%' : '0%' }}></div>
                </div>
              )}
            </React.Fragment>
          );
        })}
      </div>
      <div className="mt-4 text-center">
        {!hasUpload && <p className="text-sm text-gray-600">👆 <span className="font-semibold">Step 1:</span> Upload your artwork to get started</p>}
        {hasUpload && !hasConfiguration && <p className="text-sm text-gray-600">✅ Artwork uploaded! <span className="font-semibold">Step 2:</span> Configure your banner size and material below</p>}
        {hasConfiguration && <p className="text-sm text-gray-600">🎉 Almost done! Review your design and pricing, then add to cart</p>}
      </div>
    </div>
  );
};

export default ProgressIndicator;
