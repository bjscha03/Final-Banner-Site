import React, { useEffect, useRef } from 'react';
import { Info } from 'lucide-react';
import {
  POLE_POCKET_SETUP_FEE_CENTS,
  POLE_POCKET_PRICE_PER_LINEAR_FOOT_CENTS,
  ROPE_PRICE_PER_LINEAR_FOOT_CENTS,
  type RopePlacement,
} from '@/lib/bannerPricingEngine';
import { DESIGN_GROMMET_OPTIONS } from '@/lib/grommets';

// ---------------------------------------------------------------------------
// Image constants — swap these Cloudinary URLs when new assets are available
// ---------------------------------------------------------------------------
const FINISHING_IMAGES = {
  grommets: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1777828366/4479a8a7-6471-4d11-9e85-c26aeb0b39ad_h1a5aj.png',
  polePockets: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1777828413/88544e95-745f-4931-9639-78ff1ac25311_e3o666.png',
  rope: 'https://res.cloudinary.com/dtrxl120u/image/upload/v1777828503/6380a760-4b47-40c1-8d3a-8a78b8210e13_kwcxsd.png',
  hemming: '', // placeholder — set to Cloudinary URL when available
} as const;

const FINISHING_CALLOUTS = {
  grommets: 'Metal grommets',
  polePockets: 'Pocket fits over pole',
  rope: 'Rope sewn into the banner edge',
} as const;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export type FinishingType = 'none' | 'grommets' | 'pole_pockets' | 'rope';

const POLE_POCKET_PLACEMENTS = [
  { value: 'top', label: 'Top Only' },
  { value: 'bottom', label: 'Bottom Only' },
  { value: 'top-bottom', label: 'Top & Bottom' },
] as const;

const ROPE_PLACEMENTS: { value: RopePlacement; label: string }[] = [
  { value: 'top', label: 'Top Only' },
  { value: 'bottom', label: 'Bottom Only' },
  { value: 'top-bottom', label: 'Top & Bottom' },
];

export interface FinishingOptionsCardProps {
  finishingType: FinishingType;
  setFinishingType: (v: FinishingType) => void;
  /** Grommet placement value — can be 'none' when type is 'grommets' but user hasn't chosen */
  grommets: string;
  setGrommets: (v: string) => void;
  /** Pole pocket position — 'none' when type is not 'pole_pockets' */
  polePockets: string;
  setPolePockets: (v: string) => void;
  addRope: boolean;
  setAddRope: (v: boolean) => void;
  ropePlacement: RopePlacement;
  setRopePlacement: (v: RopePlacement) => void;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
const FinishingOptionsCard: React.FC<FinishingOptionsCardProps> = ({
  finishingType,
  setFinishingType,
  grommets,
  setGrommets,
  polePockets,
  setPolePockets,
  addRope,
  setAddRope,
  ropePlacement,
  setRopePlacement,
}) => {
  const polePocketSetupFee = POLE_POCKET_SETUP_FEE_CENTS / 100;
  const polePocketPerFt = POLE_POCKET_PRICE_PER_LINEAR_FOOT_CENTS / 100;
  const ropePerFt = ROPE_PRICE_PER_LINEAR_FOOT_CENTS / 100;

  // Remember the last non-'none' grommet placement so switching to Pole
  // Pockets / Rope and back to Grommets restores the previous selection
  // (preview re-appears immediately). Falls back to 'every-2-3ft' the first
  // time the user picks Grommets without ever choosing a placement.
  const lastGrommetRef = useRef<string>(
    grommets && grommets !== 'none' ? grommets : 'every-2-3ft'
  );
  useEffect(() => {
    if (grommets && grommets !== 'none') {
      lastGrommetRef.current = grommets;
    }
  }, [grommets]);

  const selectGrommets = () => {
    setFinishingType('grommets');
    setPolePockets('none');
    setAddRope(false);
    // Restore the last grommet placement so the live preview shows
    // grommets immediately when switching back from Pole Pockets / Rope.
    if (!grommets || grommets === 'none') {
      setGrommets(lastGrommetRef.current);
    }
  };

  const selectPolePockets = () => {
    setFinishingType('pole_pockets');
    setGrommets('none');
    setAddRope(false);
    // Default to 'top' if not already set to a valid pocket position
    if (polePockets === 'none') setPolePockets('top');
  };

  const selectRope = () => {
    setFinishingType('rope');
    setGrommets('none');
    setPolePockets('none');
    setAddRope(true);
  };

  // Grommet dropdown options from the canonical list
  const grommetOptions = DESIGN_GROMMET_OPTIONS;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm text-gray-600 mt-0.5">
          Choose how you would like your banner finished.{' '}
          <span className="text-blue-600 font-medium">Select one option only.</span>
        </p>
      </div>

      {/* ── Grommets ─────────────────────────────────────────────── */}
      <FinishingCard
        active={finishingType === 'grommets'}
        onClick={selectGrommets}
        title="Grommets"
        badge="Included Free"
        badgeColor="green"
        description="Metal reinforced holes are placed around the edges for easy hanging."
        imageSrc={FINISHING_IMAGES.grommets}
        calloutText={FINISHING_CALLOUTS.grommets}
      >
        {finishingType === 'grommets' && (
          <div className="mt-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-semibold text-blue-700 mb-1">Grommet Placement:</p>
            <select
              value={grommets}
              onChange={(e) => setGrommets(e.target.value)}
              className="w-52 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {grommetOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </FinishingCard>

      {/* ── Pole Pockets ─────────────────────────────────────────── */}
      <FinishingCard
        active={finishingType === 'pole_pockets'}
        onClick={selectPolePockets}
        title="Pole Pockets"
        priceLabel={`$${polePocketSetupFee.toFixed(0)} setup fee + $${polePocketPerFt.toFixed(2)} / linear ft`}
        description="Fabric pockets are sewn on the top and bottom to slide over a pole."
        imageSrc={FINISHING_IMAGES.polePockets}
        calloutText={FINISHING_CALLOUTS.polePockets}
      >
        {finishingType === 'pole_pockets' && (
          <div className="mt-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-semibold text-blue-700 mb-1">Pole Pocket Placement:</p>
            <select
              value={polePockets === 'none' ? 'top' : polePockets}
              onChange={(e) => setPolePockets(e.target.value)}
              className="w-52 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {POLE_POCKET_PLACEMENTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </FinishingCard>

      {/* ── Rope (Sewn In) ───────────────────────────────────────── */}
      <FinishingCard
        active={finishingType === 'rope'}
        onClick={selectRope}
        title="Rope (Sewn In)"
        priceLabel={`$${ropePerFt.toFixed(2)} / linear ft`}
        description="Rope is sewn into the edges of the banner for secure tying."
        imageSrc={FINISHING_IMAGES.rope}
        calloutText={FINISHING_CALLOUTS.rope}
      >
        {finishingType === 'rope' && (
          <div className="mt-3" onClick={(e) => e.stopPropagation()}>
            <p className="text-xs font-semibold text-blue-700 mb-1">Choose Rope Placement:</p>
            <select
              value={ropePlacement}
              onChange={(e) => setRopePlacement(e.target.value as RopePlacement)}
              className="w-52 border border-gray-300 rounded-lg px-3 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              {ROPE_PLACEMENTS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </FinishingCard>

      {/* ── Hemming footer ───────────────────────────────────────── */}
      <div className="flex items-center gap-3 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">Hemming is always included.</p>
          <p className="text-xs text-gray-500">
            All banners are finished with a folded and heat-sealed hem for added strength.
          </p>
        </div>
        {FINISHING_IMAGES.hemming && (
          <img
            src={FINISHING_IMAGES.hemming}
            alt="Hemming detail"
            className="w-16 h-10 object-cover rounded-md flex-shrink-0 opacity-90"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Internal FinishingCard sub-component
// ---------------------------------------------------------------------------
interface FinishingCardProps {
  active: boolean;
  onClick: () => void;
  title: string;
  badge?: string;
  badgeColor?: 'green';
  priceLabel?: string;
  description: string;
  imageSrc: string;
  calloutText: string;
  children?: React.ReactNode;
}

const FinishingCard: React.FC<FinishingCardProps> = ({
  active,
  onClick,
  title,
  badge,
  badgeColor,
  priceLabel,
  description,
  imageSrc,
  calloutText,
  children,
}) => (
  <div
    onClick={onClick}
    className={`relative flex rounded-xl border cursor-pointer transition-all duration-150 overflow-hidden ${
      active
        ? 'border-blue-500 ring-2 ring-blue-500 bg-white shadow-md'
        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
    }`}
  >
    {/* Left: radio + text */}
    <div className="flex-1 p-4 min-w-0">
      <div className="flex items-start gap-3">
        {/* Radio circle */}
        <div
          className={`mt-0.5 flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
            active ? 'border-blue-500 bg-blue-500' : 'border-gray-300 bg-white'
          }`}
        >
          {active && <div className="w-2 h-2 rounded-full bg-white" />}
        </div>

        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-gray-900 text-base">{title}</span>
            {badge && (
              <span
                className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                  badgeColor === 'green'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-600'
                }`}
              >
                {badge}
              </span>
            )}
          </div>
          {priceLabel && (
            <p className="text-xs font-semibold text-green-600 mt-0.5">{priceLabel}</p>
          )}
          <p className="text-sm text-gray-500 mt-1 leading-snug">{description}</p>
          {children}
        </div>
      </div>
    </div>

    {/* Right: large product photo + callout annotation */}
    <div className="flex items-stretch flex-shrink-0 self-stretch">
      {/* Main photo */}
      <div className="relative w-36 sm:w-48 md:w-56 self-stretch overflow-hidden">
        <img
          src={imageSrc}
          alt={title}
          className="absolute inset-0 w-full h-full object-cover"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </div>

      {/* Callout annotation */}
      <div className="flex flex-col items-center justify-center gap-1.5 pr-3 pl-2 py-3 w-20 sm:w-24 flex-shrink-0">
        {/* Annotation text */}
        <p className="text-[10px] text-blue-600 font-medium text-center leading-tight">
          {calloutText}
        </p>
        {/* Circular callout spot */}
        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full border-2 border-blue-400 overflow-hidden flex-shrink-0 shadow-sm bg-white">
          <img
            src={imageSrc}
            alt={`${title} detail`}
            className="w-full h-full object-cover scale-150"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        </div>
      </div>
    </div>
  </div>
);

export default FinishingOptionsCard;

