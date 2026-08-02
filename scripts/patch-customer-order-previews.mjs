import fs from 'node:fs/promises';

function replaceOne(source, before, after, label) {
  const first = source.indexOf(before);
  if (first < 0) throw new Error(`${label}: target not found`);
  if (source.indexOf(before, first + before.length) >= 0) throw new Error(`${label}: target is not unique`);
  return source.slice(0, first) + after + source.slice(first + before.length);
}

async function update(path, transform) {
  const current = await fs.readFile(path, 'utf8');
  const next = transform(current);
  if (next === current) throw new Error(`${path}: no change`);
  await fs.writeFile(path, next, 'utf8');
  console.log(`updated ${path}`);
}

await update('src/lib/product-display.ts', (source) => {
  let next = replaceOne(
    source,
    "import { getCarMagnetRoundedCornersLabel } from './car-magnet-pricing';",
    "import { getCarMagnetRoundedCornersLabel } from './car-magnet-pricing';\nimport { getExpandedPreviewSelection, getSmallPreviewUrl } from './previewSelection';",
    'product-display import',
  );

  next = replaceOne(
    next,
    "  rounded_corners?: string | null;\n};",
    `  rounded_corners?: string | null;
  web_preview_url?: string | null;
  file_url?: string | null;
  file_key?: string | null;
  file_name?: string | null;
  is_pdf?: boolean | null;
  artwork_manifest?: Record<string, any> | null;
  placement_preview?: { url?: string | null; uploadStatus?: string | null } | null;
  yard_sign_designs?: Array<{
    previewThumbnailUrl?: string | null;
    thumbnailUrl?: string | null;
    fileUrl?: string | null;
    fileKey?: string | null;
    isPdf?: boolean | null;
  }> | null;
  design_uploaded_assets?: Array<{ url?: string | null; fileKey?: string | null }> | null;
  design_request_text?: string | null;
  canvas_state_json?: string | null;
  aiDesign?: { assets?: { proofUrl?: string | null; finalUrl?: string | null } } | null;
};`,
    'product-display type',
  );

  next = replaceOne(
    next,
    "  const uploadedDesignsCount = Number(item.yard_sign_design_count || 0);\n",
    `  const uploadedDesignsCount = Number(item.yard_sign_design_count || 0);
  const thumbnailUrl = getSmallPreviewUrl(item) || '';
  const finalizedPreviewUrl = getExpandedPreviewSelection(item).url || thumbnailUrl;
`,
    'product-display resolver',
  );

  return replaceOne(
    next,
    "    thumbnailUrl: String(item.thumbnail_url || ''),\n    finalizedPreviewUrl: String(item.final_render_url || item.thumbnail_url || ''),",
    "    thumbnailUrl,\n    finalizedPreviewUrl,",
    'product-display output',
  );
});

await update('src/pages/PaymentSuccess.tsx', (source) => {
  let next = replaceOne(
    source,
    "import { authorizedHeaders } from '@/lib/serverAuth';",
    "import { authorizedHeaders } from '@/lib/serverAuth';\nimport OrderItemPreview from '@/components/preview/OrderItemPreview';",
    'payment-success import',
  );

  return replaceOne(
    next,
    `                        {normalized.thumbnailUrl ? (
                          <img
                            src={normalized.thumbnailUrl}
                            alt={\`${'${normalized.productLabel}'} preview\`}
                            className="h-20 w-28 rounded-md border border-gray-200 object-cover flex-shrink-0"
                          />
                        ) : null}`,
    `                        <OrderItemPreview
                          item={item as any}
                          compactMaxSize={112}
                          expandedMaxSize={820}
                          ariaLabel={\`Open expanded ${'${normalized.productLabel}'} preview from payment confirmation\`}
                          className="flex-shrink-0"
                        />`,
    'payment-success preview',
  );
});

await update('src/pages/OrderDetail.tsx', (source) => {
  let next = replaceOne(
    source,
    "import { getFinalizedThumbnailUrl } from '@/lib/order-thumbnail';",
    "import OrderItemPreview from '@/components/preview/OrderItemPreview';",
    'order-detail import',
  );

  return replaceOne(
    next,
    `                      {getFinalizedThumbnailUrl(item) && (
                        <img
                          src={getFinalizedThumbnailUrl(item, 180) || undefined}
                          alt={\`${'${normalizeOrderItemDisplay(item as NormalizableOrderItem).productLabel}'} Preview\`}
                          className="w-28 h-20 object-contain bg-gray-50 rounded-md border border-gray-200 flex-shrink-0"
                        />
                      )}`,
    `                      <OrderItemPreview
                        item={item as any}
                        compactMaxSize={112}
                        expandedMaxSize={820}
                        ariaLabel={\`Open expanded ${'${normalized.productLabel}'} preview from order details\`}
                        className="flex-shrink-0"
                      />`,
    'order-detail preview',
  );
});

await update('src/components/orders/OrderDetails.tsx', (source) => {
  let next = replaceOne(
    source,
    "import { getFinalizedThumbnailUrl } from '@/lib/order-thumbnail';",
    "import OrderItemPreview from '@/components/preview/OrderItemPreview';",
    'shared-order-details import',
  );

  return replaceOne(
    next,
    `                      {getFinalizedThumbnailUrl(item) && (
                        <div className="flex-shrink-0">
                          <img
                            src={getFinalizedThumbnailUrl(item, 150)}
                            alt={\`${'${getProductLabel(item.product_type)} ${index + 1}'} preview\`}
                            className="w-28 h-20 object-contain bg-gray-50 rounded-lg border border-slate-200 shadow-sm"
                            onError={(e) => {
                              (e.target as HTMLImageElement).style.display = 'none';
                            }}
                          />
                        </div>
                      )}`,
    `                      <OrderItemPreview
                        item={item as any}
                        compactMaxSize={112}
                        expandedMaxSize={820}
                        ariaLabel={\`Open expanded ${'${getProductLabel(item.product_type)} ${index + 1}'} preview\`}
                        className="flex-shrink-0"
                      />`,
    'shared-order-details preview',
  );
});
