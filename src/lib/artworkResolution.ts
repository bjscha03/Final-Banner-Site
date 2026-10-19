export function artworkResolution(widthPx: number, heightPx: number, widthIn: number, heightIn: number, scaleX = 1, scaleY = 1) {
  const dimensions = [widthPx, heightPx, widthIn, heightIn, scaleX, scaleY];
  if (!dimensions.every(value => Number.isFinite(value) && value > 0)) return null;
  const containScale = Math.min(widthIn / widthPx, heightIn / heightPx);
  const ppi = 1 / (containScale * Math.max(scaleX, scaleY));
  return { ppi, meetsMinimum: ppi >= 200, meetsPreferred: ppi >= 300,
    minimumWidth: Math.ceil(widthIn * 200), minimumHeight: Math.ceil(heightIn * 200),
    preferredWidth: Math.ceil(widthIn * 300), preferredHeight: Math.ceil(heightIn * 300) };
}

export function orderArtworkResolution(item: any) {
  let state: any = {};
  try { state = typeof item.canvas_state_json === 'string' ? JSON.parse(item.canvas_state_json) : item.canvas_state_json || {}; } catch { /* Missing resolution remains unknown. */ }
  return artworkResolution(Number(item.artwork_manifest?.width || state.originalWidth), Number(item.artwork_manifest?.height || state.originalHeight),
    Number(item.width_in), Number(item.height_in), Number(state.imgScale ?? 1), Number(state.imgScaleY ?? state.imgScale ?? 1));
}
