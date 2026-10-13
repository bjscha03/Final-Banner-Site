import { Check } from 'lucide-react';

export default function MobileBannerSteps({ current, onDesign }: {
  current: 1 | 2;
  onDesign?: () => void;
}) {
  return <nav aria-label="Ordering steps" className="mx-auto flex max-w-sm items-start justify-between px-3 py-3">
    {['Design', 'Review'].map((label, index) => {
      const step = index + 1;
      const onClick = index === 0 ? onDesign : undefined;
      const content = <><span className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${step === current ? 'bg-orange-600 text-white' : step < current ? 'bg-slate-500 text-white' : 'border border-slate-300 bg-slate-100 text-slate-500'}`}>{step < current ? <Check className="h-4 w-4" aria-hidden="true" /> : step}</span><span className="mt-1 block text-xs">{label}</span></>;
      return <div key={label} className="flex flex-1 items-start last:flex-none">
        {onClick ? <button type="button" onClick={onClick} aria-label={`Back to ${label.toLowerCase()}`} className="min-h-11 min-w-14 text-slate-600 focus-visible:outline-orange-600">{content}</button> : <span aria-current={step === current ? 'step' : undefined} className={`min-h-11 min-w-14 text-center ${step === current ? 'font-semibold text-orange-700' : 'text-slate-500'}`}>{content}</span>}
        {index < 1 && <span className="mt-3 h-px flex-1 bg-slate-300" aria-hidden="true" />}
      </div>;
    })}
  </nav>;
}
