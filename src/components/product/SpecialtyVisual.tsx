import type { SpecialtyVisual as VisualKind } from '@/lib/specialtyProducts';

/** Product silhouettes keep the new catalog accurate without hotlinking reseller assets. */
export default function SpecialtyVisual({ kind, className = '' }: { kind: VisualKind; className?: string }) {
  const common = { stroke: '#dce9f5', strokeWidth: 3, strokeLinejoin: 'round' as const, strokeLinecap: 'round' as const };
  return (
    <div className={`relative overflow-hidden bg-[#0B1F3A] ${className}`} aria-hidden="true">
      <div className="absolute inset-0 opacity-40" style={{ backgroundImage: 'radial-gradient(circle at 76% 17%, #406489 0, transparent 38%), linear-gradient(145deg, transparent 42%, #173e64 43%, transparent 74%)' }} />
      <div className="absolute -bottom-20 -right-20 h-52 w-52 rounded-full border-[32px] border-[#FF6A00]/20" />
      <svg className="relative h-full w-full p-[12%]" viewBox="0 0 320 250" role="presentation">
        <ellipse cx="160" cy="224" rx="116" ry="12" fill="#07162a" opacity=".65" />
        {kind === 'retractable' && <>
          <path d="M94 18h132v189H94z" fill="#fff" {...common} />
          <path d="M100 25h120v170H100z" fill="#edf4fa" />
          <path d="M100 25h120v65H100z" fill="#f96821" />
          <path d="M117 116h85M117 134h70M117 152h76" stroke="#244466" strokeWidth="7" strokeLinecap="round" />
          <path d="M85 209h150l8 13H77z" fill="#778fa7" {...common} />
          <path d="M104 223l-26 7M216 223l26 7" fill="none" {...common} />
        </>}
        {kind === 'xstand' && <>
          <path d="M101 24h118v174H101z" fill="#f9fbfd" {...common} />
          <path d="M101 24h118v75H101z" fill="#f96821" />
          <path d="M118 125h84M118 142h69" stroke="#173e64" strokeWidth="7" strokeLinecap="round" />
          <path d="M106 29l108 184M214 29L106 213M160 209v15" fill="none" {...common} />
          <circle cx="160" cy="120" r="6" fill="#ff6a00" />
        </>}
        {kind === 'backdrop' && <>
          <path d="M35 31h250v172H35z" fill="#f7fafc" {...common} />
          <path d="M42 38h236v65H42z" fill="#ff6a00" />
          <path d="M72 132h176M86 152h148M108 173h104" stroke="#244466" strokeWidth="9" strokeLinecap="round" />
          <path d="M31 21v205m258-205v205M22 226h28m220 0h28" fill="none" {...common} />
        </>}
        {kind === 'flag' && <>
          <path d="M110 24v198" fill="none" {...common} />
          <path d="M110 24c119 12 128 41 113 87-14 42-69 46-113 63z" fill="#ff6a00" {...common} />
          <path d="M128 68c28 5 55 16 73 31M128 88c25 4 46 13 60 24" stroke="#fff" strokeWidth="8" strokeLinecap="round" />
          <path d="M74 225h76M110 222l-30 8m30-8l30 8" fill="none" {...common} />
        </>}
        {kind === 'table' && <>
          <path d="M41 76h238l-24 132H65z" fill="#f4f7fa" {...common} />
          <path d="M41 76h238l-14 58H55z" fill="#ff6a00" {...common} />
          <path d="M100 157h120M117 177h86" stroke="#244466" strokeWidth="9" strokeLinecap="round" />
          <path d="M54 76h212M65 208h190" fill="none" {...common} />
        </>}
        {kind === 'tent' && <>
          <path d="M26 110l134-80 134 80z" fill="#ff6a00" {...common} />
          <path d="M35 110h250v96H35z" fill="#f2f6fb" {...common} />
          <path d="M35 110v116m250-116v116M76 110v96m168-96v96" fill="none" {...common} />
          <path d="M76 206l33-56h102l33 56" fill="#dbe8f3" {...common} />
          <path d="M136 79h48" stroke="#fff" strokeWidth="9" strokeLinecap="round" />
        </>}
        {kind === 'sign' && <>
          <path d="M44 36h232v163H44z" fill="#d6e2ea" {...common} />
          <path d="M52 44h216v147H52z" fill="#f8fafc" />
          <path d="M52 44h216v58H52z" fill="#ff6a00" />
          <path d="M82 130h156M82 151h116" stroke="#244466" strokeWidth="9" strokeLinecap="round" />
          <circle cx="63" cy="55" r="4" fill="#66839e" /><circle cx="257" cy="55" r="4" fill="#66839e" />
          <circle cx="63" cy="180" r="4" fill="#66839e" /><circle cx="257" cy="180" r="4" fill="#66839e" />
        </>}
        {kind === 'poster' && <>
          <path d="M73 24h174v190H73z" fill="#f9fbfd" {...common} />
          <path d="M82 34h156v82H82z" fill="#ff6a00" />
          <path d="M104 143h112M104 161h92M104 179h104" stroke="#244466" strokeWidth="7" strokeLinecap="round" />
          <path d="M247 180v34l-25-14" fill="#d9e5ef" {...common} />
        </>}
      </svg>
    </div>
  );
}
