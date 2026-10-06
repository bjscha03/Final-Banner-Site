import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';

export default function CustomBannerSize({ hasCustomSize, children }: { hasCustomSize: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(hasCustomSize);
  // Show dimensions restored from a custom link/cart item without hiding them.
  // Do not collapse while typing if an intermediate value matches a preset.
  useEffect(() => { if (hasCustomSize) setOpen(true); }, [hasCustomSize]);
  return (
    <div className="mt-3">
      <button type="button" aria-expanded={open} aria-controls="custom-banner-dimensions" onClick={() => setOpen(value => !value)}
        className="flex min-h-11 w-full items-center justify-between rounded-xl border border-slate-300 bg-white px-3 text-sm font-semibold text-[#0B1F3A] hover:border-orange-500">
        Custom size <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div id="custom-banner-dimensions" className="mt-3 rounded-xl bg-slate-50 p-3">{children}</div>}
    </div>
  );
}
