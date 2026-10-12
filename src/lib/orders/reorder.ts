import type { OrderItem } from './types';
import type { QuoteState } from '@/store/quote';
import { isReadyPlacementPreview } from '@/lib/previewLifecycle';

/** Preserve the saved artwork and composition when converting an order to a new quote. */
export function orderItemToReorderQuote(item: OrderItem & Record<string, any>): QuoteState {
  const manifest = item.artwork_manifest;
  const fileKey = manifest?.publicId || item.file_key;
  const originalUrl = manifest?.originalUrl || item.file_url;
  const hasDesign = Boolean(fileKey || originalUrl || item.final_render_url
    || item.final_render_file_key || item.print_ready_url || item.final_print_pdf_url
    || item.text_elements?.length || item.overlay_image || item.overlay_images?.length
    || item.yard_sign_designs?.length || item.design_service_enabled);
  if (!hasDesign) {
    throw new Error('This order is missing its saved artwork. Please upload the artwork again before reordering.');
  }
  if (item.placement_preview && (!isReadyPlacementPreview(item.placement_preview)
    || item.placement_preview.productType !== (item.product_type || 'banner')
    || item.placement_preview.widthIn !== item.width_in
    || item.placement_preview.heightIn !== item.height_in)) {
    throw new Error('This order needs its artwork preview rebuilt. Please open the design before reordering.');
  }

  // Clone nested design data so edits to the new cart cannot change the order.
  const saved = JSON.parse(JSON.stringify(item));
  const source = originalUrl || item.final_print_pdf_url;
  const isPdf = manifest?.format === 'pdf' || manifest?.mimeType === 'application/pdf'
    || /\.pdf(?:$|[?#])/i.test(source || '') || Boolean(item.is_pdf);
  const pocketPosition = typeof item.pole_pockets === 'string' && item.pole_pockets !== 'none'
    ? item.pole_pockets : item.pole_pocket_position || 'none';

  return {
    widthIn: item.width_in,
    heightIn: item.height_in,
    quantity: item.quantity,
    material: item.material,
    product_type: item.product_type || 'banner',
    grommets: item.grommets || 'none',
    polePockets: pocketPosition,
    polePocketSize: item.pole_pocket_size || '2',
    addRope: Number(item.rope_feet || 0) > 0,
    ropePlacement: item.rope_placement || 'top',
    rounded_corners: item.rounded_corners,
    previewScalePct: 150,
    file: fileKey || source ? {
      name: manifest?.originalFilename || item.original_filename || item.file_name || fileKey || 'Artwork',
      fileKey,
      url: source,
      productionUrl: source,
      productionPublicId: fileKey,
      type: manifest?.mimeType || (isPdf ? 'application/pdf' : 'image/*'),
      size: manifest?.bytes || 0,
      isPdf,
      resourceType: manifest?.resourceType,
      originalFormat: manifest?.format,
      artworkWidth: manifest?.width,
      artworkHeight: manifest?.height,
    } : undefined,
    fileUrl: source,
    thumbnailUrl: item.thumbnail_url,
    webPreviewUrl: item.web_preview_url,
    printReadyUrl: item.print_ready_url,
    artworkManifest: saved.artwork_manifest,
    placementPreview: saved.placement_preview || undefined,
    canvasStateJson: typeof item.canvas_state_json === 'object' && item.canvas_state_json
      ? JSON.stringify(item.canvas_state_json) : item.canvas_state_json,
    textElements: saved.text_elements || [],
    overlayImage: saved.overlay_image,
    overlayImages: saved.overlay_images,
    canvasBackgroundColor: item.canvas_background_color,
    imageScale: item.image_scale ?? 1,
    imageScaleY: item.image_scale_y ?? item.image_scale ?? 1,
    imagePosition: saved.image_position || { x: 0, y: 0 },
    fitMode: item.fit_mode || 'fill',
    finalRenderUrl: item.final_render_url,
    finalRenderFileKey: item.final_render_file_key,
    finalRenderWidthPx: item.final_render_width_px,
    finalRenderHeightPx: item.final_render_height_px,
    finalRenderDpi: item.final_render_dpi,
    yard_sign_metadata: item.product_type === 'yard_sign' ? {
      sidedness: item.yard_sign_sidedness,
      addStepStakes: item.yard_sign_step_stakes_enabled,
      stepStakeQty: item.yard_sign_step_stakes_qty,
      designCount: item.yard_sign_design_count || item.yard_sign_designs?.length,
      designs: saved.yard_sign_designs,
      signSubtotalCents: item.yard_sign_signs_subtotal_cents,
      stakeSubtotalCents: item.yard_sign_stakes_subtotal_cents,
    } : undefined,
    design_service_enabled: item.design_service_enabled,
    design_request_text: item.design_request_text,
    design_draft_preference: item.design_draft_preference,
    design_draft_contact: item.design_draft_contact,
    design_uploaded_assets: saved.design_uploaded_assets,
    set: () => {},
  } as unknown as QuoteState;
}
