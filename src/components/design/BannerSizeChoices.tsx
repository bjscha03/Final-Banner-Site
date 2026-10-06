import BannerSizeComparison from './BannerSizeComparison';

interface Props {
  sizes: readonly { w: number; h: number }[];
  widthIn: number;
  heightIn: number;
  unit: 'in' | 'ft';
  onSelect: (index: number) => void;
}

const benefits: Record<string, string> = {
  '48x24': 'Compact spaces',
  '72x24': 'Tables & railings',
  '72x36': 'Everyday displays',
  '96x36': 'Wider displays',
  '96x48': 'Bigger presence',
  '120x48': 'Largest preset',
};

export default function BannerSizeChoices({ sizes, widthIn, heightIn, unit, onSelect }: Props) {
  return <div>
    <p className="mb-3 text-sm text-slate-600">Choose how big you want to be seen.</p>
    <p className="mb-2 text-sm font-semibold text-slate-700">Find your fit</p>
    <div className="grid grid-cols-2 gap-2.5">
      {sizes.map((size, index) => {
        const selected = widthIn === size.w && heightIn === size.h;
        const featured = size.w === 96 && size.h === 48;
        const label = unit === 'ft' ? `${size.w / 12}' × ${size.h / 12}'` : `${size.w}" × ${size.h}"`;
        const benefit = benefits[`${size.w}x${size.h}`];
        return <button key={`${size.w}x${size.h}`} type="button" data-preset-label={label}
          aria-label={`${label} — ${benefit}`} aria-pressed={selected} onClick={() => onSelect(index)}
          className={`relative min-w-0 rounded-xl border px-2 py-3 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${selected ? 'border-orange-500 bg-orange-50 text-orange-800 shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-orange-400'}`}>
          <span className="block text-sm font-bold">{label}</span>
          <span className="mt-0.5 block text-xs">{benefit}</span>
          {featured && <span className="mt-1.5 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase text-orange-800">More display space</span>}
        </button>;
      })}
    </div>
    <BannerSizeComparison />
  </div>;
}
