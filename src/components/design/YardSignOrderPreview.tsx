import React, { useState } from 'react';
import { Check } from 'lucide-react';
import type { YardSignDesign } from '@/lib/yard-sign-pricing';
import YardSignMockup from './YardSignMockup';

export default function YardSignOrderPreview({ designs, withStakes }: { designs: YardSignDesign[]; withStakes: boolean }) {
  const [selectedId, setSelectedId] = useState('');
  const design = designs.find(item => item.id === selectedId) || designs[0];
  return (
    <section className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Yard sign product preview">
      <h3 className="mb-3 text-base font-bold text-[#0B1F3A]">Your sign preview</h3>
      {designs.length > 1 && (
        <label className="mb-3 block text-xs text-slate-600">Preview design
          <select value={design?.id} onChange={event => setSelectedId(event.target.value)} className="mt-1 block min-h-11 w-full min-w-0 rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-800">
            {designs.map(item => <option key={item.id} value={item.id}>{item.fileName}</option>)}
          </select>
        </label>
      )}
      <div className="mx-auto max-w-[320px]"><YardSignMockup withStakes={withStakes} design={design} /></div>
      <p className="mt-3 flex items-center justify-center gap-1.5 text-xs font-semibold text-orange-700" aria-live="polite"><Check className="h-4 w-4" />{withStakes ? 'With stakes selected' : 'Without stakes · Printed signs only'}</p>
      {!design && <p className="mt-2 text-center text-xs text-slate-500">Example artwork · Your upload appears here</p>}
      {design && <p className="mt-2 truncate text-center text-xs text-slate-500">{design.fileName} · 24&quot; × 18&quot;</p>}
    </section>
  );
}
