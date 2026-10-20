import React, { useSyncExternalStore } from 'react';
import DeliveryDateCard from './DeliveryDateCard';
import { useDeliveryCountdown } from '@/hooks/useDeliveryCountdown';
import { type ETParts } from '@/lib/delivery';

interface HeroDeliveryStatusProps {
  className?: string;
  variant?: 'compact' | 'editorial' | 'light' | 'arrival' | 'featured';
  condensed?: boolean;
}

const LiveHeroDeliveryStatus: React.FC<HeroDeliveryStatusProps> = ({ className, variant = 'compact', condensed = false }) => {
  const { estimate } = useDeliveryCountdown({ isHitSelected: false });
  const light = variant === 'light' || variant === 'arrival';
  const dateLabel = (parts: ETParts) => new Intl.DateTimeFormat('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(parts.year, parts.month - 1, parts.day)));
  if (variant === 'featured') {
    return <div data-hero-delivery-status data-state={estimate.state} data-variant={variant} className={className}>
      <DeliveryDateCard shipDate={estimate.shipDate} deliveryDate={estimate.deliveryDate} />
    </div>;
  }

  return (
    <div data-hero-delivery-status data-state={estimate.state} data-variant={variant}
      className={`rounded-xl border px-3 ${condensed ? 'py-2' : 'py-3 sm:px-4'} ${light ? 'border-[#e5dfd6] bg-white text-[#061A31]' : 'border-white/20 bg-[#061A31] text-white'} ${className || ''}`}
      aria-label="Shipping and delivery dates">
      <div className={`grid grid-cols-2 divide-x ${light ? 'divide-[#e5dfd6]' : 'divide-white/20'}`}>
        <div className="min-w-0 pr-3">
          <p className="text-[10px] font-bold uppercase tracking-wide">Shipping date</p>
          <p className="mt-1 text-sm font-bold sm:text-base">{dateLabel(estimate.shipDate)}</p>
        </div>
        <div className="min-w-0 pl-3">
          <p className="text-[10px] font-bold uppercase tracking-wide">Delivery date</p>
          <p className="mt-1 text-sm font-bold sm:text-base">{dateLabel(estimate.deliveryDate)}</p>
        </div>
      </div>
    </div>
  );
};

const subscribeToClient = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

const HeroDeliveryStatus: React.FC<HeroDeliveryStatusProps> = (props) => {
  // Build-time HTML can be days old. Hydrate stable shipping copy first, then
  // mount the current dates. Ordinary client navigation renders dates directly.
  const ready = useSyncExternalStore(subscribeToClient, clientReady, serverReady);
  if (ready) return <LiveHeroDeliveryStatus {...props} />;
  const light = props.variant === 'light' || props.variant === 'arrival';
  return (
    <div data-hero-delivery-status data-state="pending" data-variant={props.variant || 'compact'}
      className={`${props.condensed ? 'min-h-[68px] py-2' : 'min-h-[94px] py-4'} rounded-md border px-3 ${light ? 'border-[#e5dfd6] bg-white text-[#061A31]' : 'border-white/20 bg-[#061A31] text-white'} ${props.className || ''}`}
      aria-label="Production and shipping">
      <p className="text-sm font-bold">24-hour standard production</p>
      <p className="mt-1 text-xs">Free next-day air after production</p>
    </div>
  );
};

export default HeroDeliveryStatus;
