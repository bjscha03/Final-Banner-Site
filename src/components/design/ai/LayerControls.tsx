import { useState } from 'react';
import type { AIConcept, CreativeBrief, ExactCopy } from './types';

type Props = { brief: CreativeBrief; concept: AIConcept; photoCount: number; busy: boolean; onChange: (brief: CreativeBrief) => void; onApply: () => void };
const FONTS = ['DejaVu Sans', 'DejaVu Serif'];
const LABELS: Record<string, string> = { headline: 'Headline', businessName: 'Business name', supportingText: 'Supporting text', offer: 'Offer', callToAction: 'Call to action', phone: 'Phone', website: 'Website', address: 'Address', date: 'Date', other: 'Other text', logo: 'Logo' };
export default function LayerControls({ brief, concept, photoCount, busy, onChange, onApply }: Props) {
  const [role, setRole] = useState('headline');
  const layer = brief.layers?.[role] || {};
  const imageLayer = role === 'logo' || role.startsWith('photo');
  const artisticText = brief.typographyMode === 'ai' && !imageLayer;
  const labels = { ...LABELS, ...Object.fromEntries(Array.from({ length: photoCount }, (_, index) => [`photo${index}`, `Photo ${index + 1}`])) };
  const rendered: Record<string, unknown> | undefined = imageLayer ? concept.photoLayers?.find(item => item.role === role) : concept.textLayers.find(item => item.role === role);
  const change = (patch: typeof layer) => onChange({ ...brief, layers: { ...brief.layers, [role]: { ...layer, ...patch } } });
  const input = 'mt-1 min-h-11 w-full rounded-lg border border-slate-300 bg-white px-3';
  return <details className="mt-4 rounded-xl border border-slate-200 p-3">
    <summary className="cursor-pointer py-2 text-sm font-bold text-[#0b1f3a]">Edit text, fonts & placement</summary>
    <fieldset disabled={busy} className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2 disabled:opacity-50">
      <label className="text-sm font-semibold">Choose an element<select className={input} value={role} onChange={event => setRole(event.target.value)}>{Object.entries(labels).filter(([key]) => key !== 'logo').map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {!imageLayer && <>
        <label className="text-sm font-semibold">Wording<input className={input} value={brief.copy[role as keyof ExactCopy] || ''} onChange={event => onChange({ ...brief, copy: { ...brief.copy, [role]: event.target.value } })} /></label>
        {!artisticText && <label className="text-sm font-semibold">Font<select className={input} value={layer.font === 'DejaVu Serif' || layer.font === 'Georgia' ? 'DejaVu Serif' : 'DejaVu Sans'} onChange={event => change({ font: event.target.value })}>{FONTS.map(font => <option key={font}>{font}</option>)}</select></label>}
        <label className="text-sm font-semibold">Color<input type="color" className={input} value={layer.color || String(rendered?.color || brief.textColor)} onChange={event => change({ color: event.target.value })} /></label>
      </>}
      <label className="text-sm font-semibold">Size: {Math.round((layer.scale || 1) * 100)}%<input aria-label="Element size" type="range" min="0.25" max="3" step="0.05" className="mt-2 h-11 w-full" value={layer.scale || 1} onChange={event => change({ scale: Number(event.target.value) })} /></label>
      {(['x', 'y'] as const).map(axis => <label key={axis} className="text-sm font-semibold">{axis === 'x' ? 'Move left / right' : 'Move up / down'}<input aria-label={axis === 'x' ? 'Horizontal position' : 'Vertical position'} type="range" min="0.05" max="0.95" step="0.01" className="mt-2 h-11 w-full" value={layer[axis] ?? Number(role === 'logo' ? concept.logoLayer?.[axis === 'x' ? 'left' : 'top'] || 0 : (imageLayer ? rendered?.[axis === 'x' ? 'left' : 'top'] : rendered?.[axis]) || 0) / (axis === 'x' ? concept.widthPx : concept.heightPx)} onChange={event => change({ [axis]: Number(event.target.value) })} /></label>)}
      {!imageLayer && <button type="button" onClick={() => onChange({ ...brief, copy: { ...brief.copy, [role]: '' } })} className="min-h-11 rounded-lg border border-slate-300 px-3 text-sm">Remove this text</button>}
      <button type="button" onClick={onApply} className="min-h-11 rounded-lg bg-[#0b1f3a] px-4 text-sm font-bold text-white">Apply changes</button>
    </fieldset>
    <p className="mt-2 text-xs text-slate-500">{brief.typographyMode === 'ai' ? 'AI applies text changes to the existing design. For a different lettering style, describe it in Edit with AI. Review the result before accepting.' : 'Applies to your current artwork. No new image generation. Placement stays inside the print-safe edges.'}</p>
  </details>;
}
