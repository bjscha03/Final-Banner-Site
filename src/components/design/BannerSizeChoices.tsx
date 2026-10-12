interface Props {
  sizes: readonly { w: number; h: number }[];
  widthIn: number;
  heightIn: number;
  unit: 'in' | 'ft';
  onSelect: (index: number) => void;
  prices?: readonly { amount: string; originalAmount?: string }[];
}

const benefits: Record<string, string> = {
  '48x24': 'Compact spaces',
  '72x24': 'Tables & railings',
  '72x36': 'Everyday displays',
  '96x36': 'Wider displays',
  '96x48': 'Bigger presence',
  '120x48': 'High-impact displays',
};

export default function BannerSizeChoices({ sizes, widthIn, heightIn, unit, onSelect, prices }: Props) {
  return <div>
    {!prices && <><p className="mb-3 text-sm text-slate-600">Choose how big you want to be seen.</p>
    <p className="mb-2 text-sm font-semibold text-slate-700">Find your fit</p></>}
    <div className="grid grid-cols-2 gap-2.5">
      {sizes.map((size, index) => {
        const selected = widthIn === size.w && heightIn === size.h;
        const featured = size.w === 96 && size.h === 48;
        const label = unit === 'ft' ? `${size.w / 12}' × ${size.h / 12}'` : `${size.w}" × ${size.h}"`;
        const benefit = benefits[`${size.w}x${size.h}`];
        return <button key={`${size.w}x${size.h}`} type="button" data-preset-label={label}
          aria-label={`${label} — ${prices ? prices[index].amount : benefit}`} aria-pressed={selected} onClick={() => onSelect(index)}
          className={`relative min-w-0 rounded-xl border px-2 py-3 text-center transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${selected ? 'border-orange-500 bg-orange-50 text-orange-800 shadow-sm' : 'border-slate-200 bg-white text-slate-700 hover:border-orange-400'}`}>
          <span data-banner-dimensions className={`block font-bold ${prices ? 'text-base text-[#061A31]' : 'text-sm'}`}>{label}</span>
          {prices ? <><span className="mt-0.5 flex flex-wrap items-baseline justify-center gap-x-1.5">
            <span data-banner-current-price className="text-base font-extrabold text-emerald-700">{prices[index].amount}</span>
            {prices[index].originalAmount && <del className="text-xs text-slate-500">{prices[index].originalAmount}</del>}
          </span>{selected && <span className="absolute right-2 top-2 flex h-4 w-4 items-center justify-center rounded-full bg-orange-600 text-[10px] text-white" aria-hidden="true">✓</span>}</> : <>
            <span className="mt-0.5 block text-xs">{benefit}</span>
            {featured && <span className="mt-1.5 inline-block rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase text-orange-800">More display space</span>}
          </>}
        </button>;
      })}
    </div>
  </div>;
}
