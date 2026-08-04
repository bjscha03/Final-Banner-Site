import React from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { Link } from 'react-router-dom';

const materials = [
  {
    name: '13oz Vinyl',
    profile: 'Lightweight vinyl',
    use: 'Indoor displays and short-term outdoor campaigns',
    traits: ['Smooth finish', 'Easy to handle', 'Short-term versatility'],
  },
  {
    name: '15oz Vinyl',
    profile: 'Versatile outdoor vinyl',
    use: 'Everyday outdoor promotions, events, and storefronts',
    traits: ['Outdoor-ready', 'Added durability', 'Versatile choice'],
    recommended: true,
  },
  {
    name: '18oz Vinyl',
    profile: 'Heavy-duty vinyl',
    use: 'Heavy-duty and longer-term outdoor display needs',
    traits: ['Heaviest vinyl', 'High durability', 'Longer-term use'],
  },
  {
    name: 'Mesh Banner',
    profile: 'Wind-permeable mesh',
    use: 'Fences and outdoor placements where wind can pass through',
    traits: ['Wind-permeable', 'Fence-friendly', 'Outdoor use'],
  },
];

const PricingTable: React.FC = () => (
  <section className="brand-section bg-white" aria-labelledby="material-heading">
    <div className="brand-shell">
      <div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <p className="brand-eyebrow">Vinyl banner materials</p>
          <h2 id="material-heading" className="brand-title mt-3">Pick the material for the environment.</h2>
          <p className="brand-copy mt-4">Compare finish, durability, and the environment where the banner will hang. The configurator calculates the exact current total for your size, quantity, and finishing choices.</p>
          <p className="mt-3 text-sm font-semibold leading-6 text-[#0B1F3A]">Every displayed banner total includes free next-day air shipping after production.</p>
        </div>
        <Link to="/vinyl-banners" className="inline-flex items-center gap-2 font-bold text-[#0B1F3A] underline decoration-[#FF6A00] decoration-2 underline-offset-4">
          Full banner buying guide <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>

      <div className="mt-10 grid border border-slate-200 lg:grid-cols-4">
        {materials.map((material, index) => (
          <article key={material.name} className={`relative p-6 sm:p-7 ${index > 0 ? 'border-t border-slate-200 lg:border-l lg:border-t-0' : ''} ${material.recommended ? 'bg-[#FFF7F1]' : 'bg-white'}`}>
            {material.recommended && <div className="absolute inset-x-0 top-0 h-1 bg-[#FF6A00]" aria-hidden="true" />}
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#A63C00]">{material.recommended ? 'Most versatile' : 'Material'}</p>
            <h3 className="mt-3 font-display text-2xl font-bold text-[#0B1F3A]">{material.name}</h3>
            <p className="mt-2 text-sm font-bold uppercase tracking-[0.08em] text-[#A63C00]">{material.profile}</p>
            <p className="mt-5 min-h-[72px] text-sm leading-6 text-slate-600">{material.use}</p>
            <ul className="mt-5 space-y-2 border-t border-slate-200 pt-5 text-sm text-slate-700">
              {material.traits.map((trait) => (
                <li key={trait} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 flex-none text-[#FF6A00]" aria-hidden="true" />{trait}</li>
              ))}
            </ul>
          </article>
        ))}
      </div>

      <div className="grid border-x border-b border-slate-200 bg-[#F7F7F7] sm:grid-cols-3">
        {[
          ['Grommets', 'Available placements · no separate charge'],
          ['Pole pockets', '$15 setup + $2 per linear foot'],
          ['Rope', '$2 per linear foot'],
        ].map(([title, detail], index) => (
          <div key={title} className={`p-5 sm:p-6 ${index > 0 ? 'border-t border-slate-200 sm:border-l sm:border-t-0' : ''}`}>
            <p className="font-display font-bold text-[#0B1F3A]">{title}</p>
            <p className="mt-1 text-sm text-slate-600">{detail}</p>
          </div>
        ))}
      </div>
    </div>
  </section>
);

export default PricingTable;
