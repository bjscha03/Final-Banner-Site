import type { YardSignDesign } from './yard-sign-pricing';

export type SavedYardSignDesign = Partial<YardSignDesign>;
export type YardSignLine = {
  product_type?: string;
  quantity?: number;
  width_in?: number;
  height_in?: number;
  yard_sign_design_count?: number | null;
  yard_sign_designs?: unknown;
  canvas_state_json?: unknown;
};

function readJson(value: unknown) {
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

export function getYardSignDesigns(item: YardSignLine): SavedYardSignDesign[] {
  if (item.product_type !== 'yard_sign') return [];
  const saved = readJson(item.yard_sign_designs);
  const designs = Array.isArray(saved) && saved.length
    ? saved : readJson(item.canvas_state_json)?.yardSignMetadata?.designs;
  // Keep each page in position even if an old entry is incomplete.
  return Array.isArray(designs) ? designs.map(design => design || {}) : [];
}

export function hasYardSignBreakdown(item: YardSignLine) {
  return item.product_type === 'yard_sign'
    && (Number(item.yard_sign_design_count) > 1 || getYardSignDesigns(item).length > 0);
}

export function yardSignCopiesMatch(item: YardSignLine, designs = getYardSignDesigns(item)) {
  if (!designs.length) return Number(item.yard_sign_design_count || 0) <= 1;
  return (!item.yard_sign_design_count || designs.length === Number(item.yard_sign_design_count))
    && designs.every(design => Number.isInteger(Number(design.quantity)) && Number(design.quantity) > 0)
    && designs.reduce((sum, design) => sum + Number(design.quantity), 0) === Number(item.quantity);
}
