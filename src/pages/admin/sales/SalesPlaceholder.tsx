import { Construction, FileDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface SalesPlaceholderProps {
  title: string;
  description: string;
  features: string[];
  phase: string;
  exportLabel?: string;
}

export default function SalesPlaceholder({ title, description, features, phase, exportLabel }: SalesPlaceholderProps) {
  return (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-gradient-to-r from-white to-slate-50 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge variant="outline">{phase}</Badge>
            <h2 className="mt-3 text-2xl font-black text-slate-950">{title}</h2>
            <p className="mt-2 max-w-3xl text-slate-600">{description}</p>
          </div>
          {exportLabel && <Button disabled variant="outline"><FileDown className="mr-2 h-4 w-4" /> Export {exportLabel} CSV</Button>}
        </div>
      </div>
      <div className="grid gap-4 p-6 md:grid-cols-2 xl:grid-cols-3">
        {features.map((feature) => (
          <div key={feature} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <Construction className="h-5 w-5 text-[#18448D]" />
            <p className="mt-3 font-bold text-slate-900">{feature}</p>
            <p className="mt-1 text-xs text-slate-500">Foundation schema and navigation are ready; operational data is intentionally inactive.</p>
          </div>
        ))}
      </div>
    </section>
  );
}
