import React from 'react';
import { Info } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  POLE_POCKET_SETUP_FEE_CENTS,
  POLE_POCKET_PRICE_PER_LINEAR_FOOT_CENTS,
  ROPE_PRICE_PER_LINEAR_FOOT_CENTS,
  type RopePlacement,
} from '@/lib/bannerPricingEngine';

// ---------------------------------------------------------------------------
// Image URLs – replace with your actual Cloudinary uploads once available.
// Suggested upload path: res.cloudinary.com/dtrxl120u/image/upload/finishing/
// ---------------------------------------------------------------------------
const IMAGES = {
  grommets: {
    main: 'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_400,h_220,c_fill/finishing/grommets-main.jpg',
    callout: 'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_160,h_160,c_fill,r_max/finishing/grommets-callout.jpg',
    calloutLabel: 'Metal grommets every 2-3 feet',
  },
  polePockets: {
    main: 'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_400,h_220,c_fill/finishing/pole-pockets-main.jpg',
    callout: 'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_160,h_160,c_fill,r_max/finishing/pole-pockets-callout.jpg',
    calloutLabel: 'Pocket fits over pole',
  },
  rope: {
    main: 'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_400,h_220,c_fill/finishing/rope-main.jpg',
    callout: 'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_160,h_160,c_fill,r_max/finishing/rope-callout.jpg',
    calloutLabel: 'Rope sewn into the banner edge',
  },
  hemming: 'https://res.cloudinary.com/dtrxl120u/image/upload/f_auto,q_auto,w_160,h_80,c_fill/finishing/hemming.jpg',
};

const POLE_POCKET_POSITIONS = [
  { value: 'top', label: 'Top Only' },
  { value: 'bottom', label: 'Bottom Only' },
  { value: 'top-bottom', label: 'Top & Bottom' },
  { value: 'left', label: 'Left Only' },
  { value: 'right', label: 'Right Only' },
];

const ROPE_PLACEMENTS: { value: RopePlacement; label: string }[] = [
  { value: 'top', label: 'Top Only' },
  { value: 'bottom', label: 'Bottom Only' },
  { value: 'top-bottom', label: 'Top & Bottom' },
  { value: 'all', label: 'All 4 Sides' },
];

export interface FinishingOptionsCardProps {
  grommets: string;
  setGrommets: (v: string) => void;
  polePockets: string;
  setPolePockets: (v: string) => void;
  addRope: boolean;
  setAddRope: (v: boolean) => void;
  ropePlacement: RopePlacement;
  setRopePlacement: (v: RopePlacement) => void;
}

type FinishingType = 'grommets' | 'pole-pockets' | 'rope' | 'none';

const FinishingOptionsCard: React.FC<FinishingOptionsCardProps> = ({
  grommets,
  setGrommets,
  polePockets,
  setPolePockets,
  addRope,
  setAddRope,
  ropePlacement,
  setRopePlacement,
}) => {
  const activeType: FinishingType =
    grommets !== 'none'
      ? 'grommets'
      : polePockets !== 'none'
      ? 'pole-pockets'
      : addRope
      ? 'rope'
      : 'none';

  const selectGrommets = () => {
    setGrommets('every-2-3ft');
    setPolePockets('none');
    setAddRope(false);
  };

  const selectPolePockets = (position = 'top') => {
    setGrommets('none');
    setPolePockets(position);
    setAddRope(false);
  };

  const selectRope = () => {
    setGrommets('none');
    setPolePockets('none');
    setAddRope(true);
  };

  const polePocketSetupFee = POLE_POCKET_SETUP_FEE_CENTS / 100;
  const polePocketPerFt = POLE_POCKET_PRICE_PER_LINEAR_FOOT_CENTS / 100;
  const ropePerFt = ROPE_PRICE_PER_LINEAR_FOOT_CENTS / 100;

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-lg font-bold text-gray-900">Finishing Options</h3>
        <p className="text-sm text-gray-500 mt-0.5">
          Choose how you would like your banner finished.{' '}
          <span className="text-blue-600 font-medium">Select one option only.</span>
        </p>
      </div>

      {/* ── Grommets ──────────────────────────────────────────────── */}
      <FinishingCard
        active={activeType === 'grommets'}
        onClick={selectGrommets}
        title="Grommets"
        badge="Included Free"
        badgeColor="green"
        description="Metal reinforced holes are placed around the edges for easy hanging."
        images={IMAGES.grommets}
      />

      {/* ── Pole Pockets ─────────────────────────────────────────── */}
      <FinishingCard
        active={activeType === 'pole-pockets'}
        onClick={() => selectPolePockets(polePockets !== 'none' ? polePockets : 'top')}
        title="Pole Pockets"
        priceLabel={`$${polePocketSetupFee.toFixed(0)} setup fee + $${polePocketPerFt.toFixed(2)} / linear ft`}
        description="Fabric pockets are sewn on the top and bottom to slide over a pole."
        images={IMAGES.polePockets}
      >
        {activeType === 'pole-pockets' && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-blue-700 mb-1">Choose Position:</p>
            <Select
              value={polePockets}
              onValueChange={(v) => selectPolePockets(v)}
            >
              <SelectTrigger className="w-52 bg-white text-sm h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {POLE_POCKET_POSITIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </FinishingCard>

      {/* ── Rope (Sewn In) ───────────────────────────────────────── */}
      <FinishingCard
        active={activeType === 'rope'}
        onClick={selectRope}
        title="Rope (Sewn In)"
        priceLabel={`$${ropePerFt.toFixed(2)} / linear ft`}
        description="Rope is sewn into the edges of the banner for secure tying."
        images={IMAGES.rope}
      >
        {activeType === 'rope' && (
          <div className="mt-3">
            <p className="text-xs font-semibold text-blue-700 mb-1">Choose Rope Placement:</p>
            <Select
              value={ropePlacement}
              onValueChange={(v) => setRopePlacement(v as RopePlacement)}
            >
              <SelectTrigger className="w-52 bg-white text-sm h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROPE_PLACEMENTS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </FinishingCard>

      {/* ── Hemming footer ───────────────────────────────────────── */}
      <div className="flex items-center gap-4 rounded-xl bg-blue-50 border border-blue-100 px-4 py-3">
        <Info className="w-5 h-5 text-blue-500 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-800">Hemming is always included.</p>
          <p className="text-xs text-gray-500">
            All banners are finished with a folded and heat-sealed hem for added strength.
          </p>
        </div>
        <img
          src={IMAGES.hemming}
          alt="Hemming detail"
          className="w-16 h-10 object-cover rounded-md flex-shrink-0 opacity-90"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Internal card component
// ---------------------------------------------------------------------------
interface FinishingCardImages {
  main: string;
  callout: string;
  calloutLabel: string;
}

interface FinishingCardProps {
  active: boolean;
  onClick: () => void;
  title: string;
  badge?: string;
  badgeColor?: 'green';
  priceLabel?: string;
  description: string;
  images: FinishingCardImages;
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
  images,
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
        {/* Radio indicator */}
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
            <p className="text-xs font-semibold text-blue-600 mt-0.5">{priceLabel}</p>
          )}
          <p className="text-sm text-gray-500 mt-1 leading-snug">{description}</p>
          {children}
        </div>
      </div>
    </div>

    {/* Right: photos */}
    <div className="flex items-center gap-2 pr-3 py-3 flex-shrink-0">
      <img
        src={images.main}
        alt={title}
        className="w-28 h-20 sm:w-36 sm:h-24 object-cover rounded-lg"
        onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
      />
      <div className="flex flex-col items-center gap-1">
        <img
          src={images.callout}
          alt={`${title} detail`}
          className="w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 border-white shadow"
          onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
        />
        <p className="text-[10px] text-blue-600 font-medium text-center leading-tight max-w-[72px] sm:max-w-[80px]">
          {images.calloutLabel}
        </p>
      </div>
    </div>
  </div>
);

export default FinishingOptionsCard;
