import React, { useMemo } from 'react';
import BannerPreview from '@/components/cart/BannerPreview';
import ThumbnailPreviewWrapper from '@/components/preview/ThumbnailPreviewWrapper';
import { getGrommetModeForPreview } from '@/lib/cartGrommet';
import {
  getItemDisplayName,
  normalizeOrderItemDisplay,
  type NormalizableOrderItem,
} from '@/lib/product-display';
import {
  getExpandedPreviewSelection,
  getSmallPreviewSelection,
  type PreviewableItem,
} from '@/lib/previewSelection';

export type OrderPreviewItem = NormalizableOrderItem & PreviewableItem & {
  grommetOption?: string | null;
  grommetOptionLabel?: string | null;
  text_elements?: any[];
  overlay_image?: any;
  image_scale?: number | null;
  image_scale_y?: number | null;
  image_position?: { x?: number; y?: number } | null;
  fit_mode?: 'fill' | 'fit' | 'stretch' | null;
  design_service_enabled?: boolean | null;
  source?: string | null;
};

export interface OrderItemPreviewProps {
  item: OrderPreviewItem;
  compactMaxSize?: number;
  expandedMaxSize?: number;
  className?: string;
  ariaLabel?: string;
  title?: string;
  details?: Array<{ label: string; value: string }>;
  showResolutionStatus?: boolean;
}

const OrderItemPreview: React.FC<OrderItemPreviewProps> = ({
  item,
  compactMaxSize = 150,
  expandedMaxSize = 820,
  className = '',
  ariaLabel,
  title,
  details,
  showResolutionStatus = true,
}) => {
  const normalized = normalizeOrderItemDisplay(item);
  const smallPreview = getSmallPreviewSelection(item);
  const expandedPreview = getExpandedPreviewSelection(item);
  const widthIn = Number(item.width_in) > 0 ? Number(item.width_in) : 24;
  const heightIn = Number(item.height_in) > 0 ? Number(item.height_in) : 18;
  const grommets = getGrommetModeForPreview(item);
  const imagePosition = {
    x: Number(item.image_position?.x || 0),
    y: Number(item.image_position?.y || 0),
  };

  const defaultDetails = useMemo(() => [
    { label: 'Size', value: normalized.sizeDisplay || `${widthIn}" × ${heightIn}"` },
    { label: 'Material', value: normalized.materialDisplay || 'Not specified' },
    { label: 'Print', value: normalized.printDisplay || 'Single-Sided' },
    { label: 'Qty', value: normalized.qtyDisplay || String(item.quantity || 0) },
    ...(normalized.uploadedDesignsCount
      ? [{ label: 'Uploaded Designs', value: String(normalized.uploadedDesignsCount) }]
      : []),
    ...(normalized.stepStakesQty
      ? [{ label: 'Step Stakes', value: String(normalized.stepStakesQty) }]
      : []),
    ...(normalized.grommetsDisplay
      ? [{ label: 'Grommets', value: normalized.grommetsDisplay }]
      : []),
  ], [
    normalized.sizeDisplay,
    normalized.materialDisplay,
    normalized.printDisplay,
    normalized.qtyDisplay,
    normalized.uploadedDesignsCount,
    normalized.stepStakesQty,
    normalized.grommetsDisplay,
    widthIn,
    heightIn,
    item.quantity,
  ]);

  const renderPreview = (url: string | null, maxSize: number, exactComposition: boolean) => (
    <BannerPreview
      widthIn={widthIn}
      heightIn={heightIn}
      grommets={grommets}
      imageUrl={url}
      material={item.material}
      textElements={item.text_elements as any}
      overlayImage={item.overlay_image as any}
      imageScale={Number(item.image_scale || 1)}
      imageScaleY={Number(item.image_scale_y ?? item.image_scale ?? 1)}
      imagePosition={imagePosition}
      fitMode={item.fit_mode || 'fill'}
      className="flex-shrink-0"
      designServiceEnabled={Boolean(item.design_service_enabled)}
      source={item.source || undefined}
      isFinalizedSnapshot={exactComposition}
      maxSize={maxSize}
    />
  );

  return (
    <div className={className} data-order-item-preview="true">
      <ThumbnailPreviewWrapper
        ariaLabel={ariaLabel || `Open expanded ${normalized.productLabel} preview`}
        title={title || getItemDisplayName(item)}
        widthIn={widthIn}
        heightIn={heightIn}
        details={details || defaultDetails}
        renderLargePreview={() => (
          <div className="space-y-2" data-order-item-expanded-preview="true">
            {showResolutionStatus && expandedPreview.isPreparingHighResolution ? (
              <p className="text-center text-xs font-medium text-amber-700">
                Preparing high-resolution preview…
              </p>
            ) : null}
            {showResolutionStatus && expandedPreview.isLowResolutionFallback ? (
              <p className="text-center text-xs text-amber-700">
                A temporary preview is shown while the permanent proof finishes.
              </p>
            ) : null}
            {renderPreview(
              expandedPreview.url,
              expandedMaxSize,
              expandedPreview.isExactComposition,
            )}
          </div>
        )}
      >
        {renderPreview(
          smallPreview.url,
          compactMaxSize,
          smallPreview.isExactComposition,
        )}
      </ThumbnailPreviewWrapper>
    </div>
  );
};

export default OrderItemPreview;
