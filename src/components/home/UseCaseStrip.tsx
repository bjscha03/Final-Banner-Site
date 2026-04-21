import React from 'react';

const useCases = [
  { label: 'Real Estate', value: 'Yard Signs' },
  { label: 'Events', value: 'Banners' },
  { label: 'Contractors', value: 'Job Site Signage' },
  { label: 'Businesses', value: 'Promotional Displays' },
];

const UseCaseStrip: React.FC = () => {
  return (
    <section className="bg-slate-50 py-8 sm:py-10">
      <div className="max-w-6xl mx-auto px-3 sm:px-4 md:px-6">
        <div className="text-center mb-5 sm:mb-6">
          <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Built for Every Need</h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {useCases.map((item) => (
            <div
              key={item.label}
              className="rounded-xl border border-slate-200 bg-white p-4 text-center shadow-sm"
            >
              <p className="text-sm font-semibold text-slate-500">{item.label}</p>
              <p className="mt-1 text-sm sm:text-base font-bold text-slate-900">{item.value}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default UseCaseStrip;
