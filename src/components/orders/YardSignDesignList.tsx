import { useState } from 'react';
import StablePreviewImage from '@/components/preview/StablePreviewImage';
import ThumbnailPreviewWrapper from '@/components/preview/StableThumbnailPreviewWrapper';
import { buildCloudinaryUrlFromFileKey, getPreviewSourceCandidates } from '@/lib/previewSelection';
import { getYardSignDesigns, yardSignCopiesMatch, type YardSignLine } from '@/lib/yardSignDesigns';

type Props = { item: YardSignLine; production?: boolean };

function DesignImage({ sources, label }: { sources: string[]; label: string }) {
  const [failed, setFailed] = useState(false);
  return sources.length && !failed
    ? <StablePreviewImage sources={sources} alt={label} onExhausted={() => setFailed(true)}
        className="absolute inset-0 h-full w-full object-contain" />
    : <span className="text-xs text-gray-500">Preview unavailable</span>;
}

function designFileUrl(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return undefined;
    if (url.hostname === 'res.cloudinary.com') return url.href;
    const siteHost = ['bannersonthefly.com', 'www.bannersonthefly.com'].includes(url.hostname)
      || /^(?:[a-z0-9-]+--)?bannersonthefly\.netlify\.app$/.test(url.hostname);
    if (siteHost && url.pathname.startsWith('/artwork-original/')) return url.href;
  } catch { /* Legacy rows can contain only a storage key. */ }
  return undefined;
}

export default function YardSignDesignList({ item, production = false }: Props) {
  const designs = getYardSignDesigns(item);
  const width = Number(item.width_in) || 24;
  const height = Number(item.height_in) || 18;
  const count = Math.max(Number(item.yard_sign_design_count) || 0, designs.length);
  return (
    <section aria-label="Yard sign designs" className="w-full min-w-0 rounded-lg border border-slate-200 bg-white p-3">
      <h4 className="text-sm font-bold text-slate-900">{item.quantity} yard signs · {count} {count === 1 ? 'design' : 'designs'}</h4>
      <p className="mb-2 text-xs text-slate-600">{width}″ × {height}″</p>
      <ol className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 135px), 1fr))' }}>
        {designs.map((design, index) => {
          const label = `Design ${index + 1}`;
          const qty = Number(design.quantity);
          const copies = Number.isInteger(qty) && qty > 0 ? `${qty} ${qty === 1 ? 'copy' : 'copies'}` : 'Copies unspecified';
          // A design can only fall back to its own artwork, never the item's cover image.
          const sources = getPreviewSourceCandidates({ product_type: 'yard_sign', width_in: width,
            height_in: height, yard_sign_designs: [design] });
          const artworkUrl = production && designFileUrl(design.fileUrl || buildCloudinaryUrlFromFileKey(
            design.fileKey, { fileName: design.fileName, isPdf: design.isPdf }) || undefined);
          const preview = <div className="relative flex w-full items-center justify-center overflow-hidden rounded-md bg-slate-50"
            style={{ aspectRatio: `${width}/${height}` }}><DesignImage key={sources.join('|')} sources={sources} label={label} /></div>;
          return (
            <li key={design.id || index} className="min-w-0">
              {sources.length ? <ThumbnailPreviewWrapper className="w-full" title={`${label} · ${copies}`}
                ariaLabel={`Enlarge yard sign design ${index + 1}`} widthIn={width} heightIn={height}
                renderLargePreview={() => preview}>{preview}</ThumbnailPreviewWrapper> : preview}
              <p className="mt-1 text-sm font-semibold text-slate-900">{label} · {copies}</p>
              {design.fileName && <p className="truncate text-xs text-slate-600" title={design.fileName}>{design.fileName}</p>}
              {production && <p className="text-xs text-slate-600">Print PDF page {index + 1}</p>}
              {artworkUrl && <a className="text-xs font-semibold text-blue-800 underline" href={artworkUrl} target="_blank"
                rel="noreferrer" aria-label={`Open artwork for design ${index + 1}`}>Open artwork</a>}
            </li>
          );
        })}
      </ol>
      {!yardSignCopiesMatch(item, designs) && <p className="mt-2 text-sm font-semibold text-amber-800">
        Review the design quantities. The saved breakdown is incomplete.</p>}
    </section>
  );
}
