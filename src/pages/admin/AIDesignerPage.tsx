import React, { useMemo, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { ArrowRight, Ruler, ShieldCheck } from 'lucide-react';
import Layout from '@/components/Layout';
import AIWorkspace from '@/components/design/ai/AIWorkspace';
import type { CreateWithAIResult } from '@/components/design/CreateWithAIModal';
import { useAuth } from '@/lib/auth';
import { useAIAdminAccess } from '@/hooks/useAIAdminAccess';
import { calculateBannerPricing } from '@/lib/bannerPricingEngine';
import { usd } from '@/lib/pricing';
import type { MaterialKey } from '@/store/quote';
import { createAIHandoff } from '@/lib/aiDesignHandoff';
import { canUseAIAdminPreview } from '@/lib/aiAdminVisibility';

const PRESETS = [
  { label: `4' × 2'`, width: 48, height: 24 },
  { label: `6' × 2'`, width: 72, height: 24 },
  { label: `6' × 3'`, width: 72, height: 36 },
  { label: `8' × 3'`, width: 96, height: 36 },
  { label: `8' × 4'`, width: 96, height: 48 },
  { label: `10' × 4'`, width: 120, height: 48 },
];

const MATERIALS: Array<{ value: MaterialKey; label: string }> = [
  { value: '13oz', label: '13oz Standard Vinyl' },
  { value: '15oz', label: '15oz Premium Vinyl' },
  { value: '18oz', label: '18oz Heavy-Duty Vinyl' },
];

export default function AIDesignerPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const access = useAIAdminAccess(Boolean(user));
  const [sizeMode, setSizeMode] = useState<'preset' | 'custom'>('preset');
  const [presetIndex, setPresetIndex] = useState(4);
  const [customWidth, setCustomWidth] = useState(96);
  const [customHeight, setCustomHeight] = useState(48);
  const [material, setMaterial] = useState<MaterialKey>('13oz');
  const [quantity, setQuantity] = useState(1);

  const selectedPreset = PRESETS[presetIndex] || PRESETS[0];
  const widthIn = sizeMode === 'preset' ? selectedPreset.width : Math.max(6, Number(customWidth) || 6);
  const heightIn = sizeMode === 'preset' ? selectedPreset.height : Math.max(6, Number(customHeight) || 6);
  const pricing = useMemo(() => calculateBannerPricing({ widthIn, heightIn, quantity, material, addRope: false }), [widthIn, heightIn, quantity, material]);
  const materialLabel = MATERIALS.find((item) => item.value === material)?.label || material;

  // Do not redirect while the readiness request is merely loading or failed
  // for a non-auth reason. Only the local admin identity/signed session gate,
  // or an explicit server 401, may revoke route access.
  if (!loading && !canUseAIAdminPreview(user, access.authenticationFailed)) {
    return <Navigate to={access.authenticationFailed ? '/admin/setup?session=expired' : '/admin/setup'} replace />;
  }

  const useInConfigurator = (result: CreateWithAIResult) => {
    const aiHandoffId = createAIHandoff(result, { widthIn, heightIn, material, quantity });
    navigate('/design?product=banner', {
      state: { aiHandoffId },
    });
  };

  return (
    <Layout>
      <main className="min-h-screen bg-[#f3f5f7]">
        <section className="border-b border-slate-200 bg-[#0b1f3a] px-4 py-5 text-white sm:px-6">
          <div className="mx-auto flex max-w-[1800px] flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-300"><ShieldCheck className="h-4 w-4" /> Admin-only testing workspace</div>
              <h1 className="mt-1 text-2xl font-black sm:text-3xl">Production AI Banner Designer</h1>
              <p className="mt-1 text-sm text-slate-300">Create, validate, and send approved flat artwork into the normal banner configurator.</p>
            </div>
            <a href="/admin/orders" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/30 px-4 text-sm font-bold hover:bg-white/10">Return to admin <ArrowRight className="h-4 w-4" /></a>
          </div>
        </section>

        <section className="mx-auto max-w-[1800px] p-4 sm:p-6">
          <div className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-end gap-3">
              <div className="mr-auto">
                <div className="flex items-center gap-2 text-sm font-black text-[#0b1f3a]"><Ruler className="h-4 w-4 text-orange-600" /> Production specifications</div>
                <p className="mt-1 text-xs text-slate-500">These exact values are passed to the storefront configurator; AI does not maintain separate pricing.</p>
              </div>
              <label className="text-sm font-semibold text-slate-700">Size type<select value={sizeMode} onChange={(event) => setSizeMode(event.target.value as 'preset' | 'custom')} className="ml-2 min-h-11 rounded-lg border border-slate-300 bg-white px-3"><option value="preset">Popular size</option><option value="custom">Custom inches</option></select></label>
              {sizeMode === 'preset' ? (
                <label className="text-sm font-semibold text-slate-700">Size<select value={presetIndex} onChange={(event) => setPresetIndex(Number(event.target.value))} className="ml-2 min-h-11 rounded-lg border border-slate-300 bg-white px-3">{PRESETS.map((preset, index) => <option key={preset.label} value={index}>{preset.label}</option>)}</select></label>
              ) : (
                <><label className="text-sm font-semibold text-slate-700">Width (in)<input type="number" min={6} max={600} value={customWidth} onChange={(event) => setCustomWidth(Number(event.target.value))} className="ml-2 min-h-11 w-24 rounded-lg border border-slate-300 px-3" /></label><label className="text-sm font-semibold text-slate-700">Height (in)<input type="number" min={6} max={600} value={customHeight} onChange={(event) => setCustomHeight(Number(event.target.value))} className="ml-2 min-h-11 w-24 rounded-lg border border-slate-300 px-3" /></label></>
              )}
              <label className="text-sm font-semibold text-slate-700">Material<select value={material} onChange={(event) => setMaterial(event.target.value as MaterialKey)} className="ml-2 min-h-11 rounded-lg border border-slate-300 bg-white px-3">{MATERIALS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
              <label className="text-sm font-semibold text-slate-700">Quantity<input type="number" min={1} max={999} value={quantity} onChange={(event) => setQuantity(Math.max(1, Number(event.target.value) || 1))} className="ml-2 min-h-11 w-20 rounded-lg border border-slate-300 px-3" /></label>
              <div className="rounded-lg bg-slate-100 px-4 py-2 text-right"><div className="text-xs font-semibold text-slate-500">Pre-tax subtotal</div><div className="text-lg font-black text-[#0b1f3a]">{usd(pricing.subtotalCents / 100)}</div></div>
            </div>
          </div>

          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <AIWorkspace
              key={`${widthIn}-${heightIn}-${material}-${quantity}`}
              productType="banner"
              widthIn={widthIn}
              heightIn={heightIn}
              material={material}
              materialLabel={materialLabel}
              quantity={quantity}
              onGenerated={useInConfigurator}
            />
          </div>
        </section>
      </main>
    </Layout>
  );
}
