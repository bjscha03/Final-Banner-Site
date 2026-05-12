import React from 'react';

type Props = { widthIn:number; heightIn:number; imageUrl:string|null; generating:boolean };
export const AdminAICanvasPreview: React.FC<Props> = ({widthIn,heightIn,imageUrl,generating}) => {
  const ratio = widthIn / heightIn;
  return <section className="rounded-xl border border-white/10 bg-[#151a23] p-5"><div className="flex justify-between text-white/80 mb-2"><h3 className="font-black">Preview</h3><span>{widthIn}' x {heightIn}'</span></div><div className="w-full bg-black/50 border border-white/15 rounded-lg overflow-hidden" style={{aspectRatio:`${ratio}`}}>{generating ? <div className="h-full w-full animate-pulse bg-white/10"/> : imageUrl ? <img src={imageUrl} className="w-full h-full object-cover"/> : <div className="h-full grid place-items-center text-white/50">Generate an image</div>}</div></section>
}
