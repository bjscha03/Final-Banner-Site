import React from 'react';
import { Truck, ExternalLink } from 'lucide-react';
import { TrackingCarrier, fedexUrl } from '../../lib/orders/types';
import { Button } from '@/components/ui/button';

interface TrackingBadgeProps {
  carrier?: TrackingCarrier | null;
  trackingNumber?: string | null;
}

const TrackingBadge: React.FC<TrackingBadgeProps> = ({ carrier, trackingNumber }) => {
  if (!carrier || !trackingNumber) {
    return (
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
        <Truck className="h-3 w-3 mr-1" />
        Not Shipped
      </span>
    );
  }

  const getTrackingUrl = (carrier: TrackingCarrier, number: string): string => {
    switch (carrier) {
      case 'fedex':
        return fedexUrl(number);
      default:
        return '#';
    }
  };

  const getCarrierName = (carrier: TrackingCarrier): string => {
    switch (carrier) {
      case 'fedex':
        return 'FedEx';
      default:
        return carrier;
    }
  };

  return (
    <div className="flex items-center space-x-2">
      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
        <Truck className="h-3 w-3 mr-1" />
        Shipped via {getCarrierName(carrier)}
      </span>
      <Button
        variant="ghost"
        size="sm"
        asChild
        className="h-6 px-2 text-xs"
      >
        <a
          href={getTrackingUrl(carrier, trackingNumber)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center"
        >
          Track
          <ExternalLink className="h-3 w-3 ml-1" />
        </a>
      </Button>
    </div>
  );
};

export default TrackingBadge;
