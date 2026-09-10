import React from 'react';
export const AIBannerPreview = ({ store }: any) => (
  <div className="rounded-2xl border border-[#2a2a2a] bg-[#0d0d0d] p-4 flex flex-col">
    <h2 className="text-xl font-semibold mb-3">Preview</h2>
    <div className="relative bg-black/50 border border-[#3d3d3d] rounded-lg aspect-[2/1] overflow-hidden">
      {store.imageUrl ? <img src={store.imageUrl} alt="AI banner preview" className="absolute inset-0 w-full h-full object-cover" /> : <div className="h-full w-full grid place-items-center text-gray-400">No design generated yet</div>}
    </div>
    <p className="text-xs text-gray-400 mt-2">{store.width}ft × {store.height}ft</p>
  </div>
);
