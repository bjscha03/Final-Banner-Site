import { Flag, Sparkles } from 'lucide-react';

export const INDEPENDENCE_DAY_NOTICE =
  'Independence Day schedule: Orders placed July 2–5 will ship Monday, July 6, for delivery Tuesday, July 7.';

interface IndependenceDayNoticeProps {
  className?: string;
}

const IndependenceDayNotice = ({ className = '' }: IndependenceDayNoticeProps) => {
  return (
    <aside
      className={`relative overflow-hidden rounded-2xl border border-[#18448D]/20 bg-white shadow-sm ${className}`}
      aria-label="Independence Day shipping schedule notice"
    >
      <div className="absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b from-[#B91C1C] via-white to-[#18448D]" aria-hidden="true" />
      <div className="absolute -right-8 -top-10 h-24 w-24 rounded-full bg-[#18448D]/10 blur-2xl" aria-hidden="true" />
      <div className="absolute right-6 top-4 hidden text-[#B91C1C]/15 sm:block" aria-hidden="true">
        <Sparkles className="h-10 w-10" />
      </div>
      <div className="flex flex-col gap-3 px-5 py-4 pl-7 sm:flex-row sm:items-center sm:gap-4 sm:px-6 sm:py-5 sm:pl-8">
        <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-[#18448D] text-white shadow-sm ring-4 ring-[#18448D]/10">
          <Flag className="h-5 w-5" aria-hidden="true" />
        </div>
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#B91C1C]">Holiday shipping notice</p>
          <p className="text-sm font-semibold leading-6 text-[#0B1F3A] sm:text-base">
            {INDEPENDENCE_DAY_NOTICE}
          </p>
        </div>
      </div>
    </aside>
  );
};

export default IndependenceDayNotice;
