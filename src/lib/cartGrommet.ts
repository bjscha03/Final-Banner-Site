import type { Grommets } from '@/store/quote';

export const AI_GROMMET_LABELS: Record<string, string> = {
  none: 'None',
  every_2_3_feet: 'Every 2–3 Feet',
  every_1_2_feet: 'Every 1–2 Feet',
  four_corners: '4 Corners Only',
  top_corners: 'Top Corners Only',
  bottom_corners: 'Bottom Corners Only',
  left_side: 'Left Side Only',
  right_side: 'Right Side Only',
};

export const normalizeGrommetOption = (value: unknown): string => String(value || '').toLowerCase();

export const getGrommetModeForPreview = (item: any): Grommets => {
  const option = normalizeGrommetOption(item?.grommetOption);
  switch (option) {
    case 'every_2_3_feet': return 'every-2-3ft';
    case 'every_1_2_feet': return 'every-1-2ft';
    case 'four_corners': return '4-corners';
    case 'top_corners': return 'top-corners';
    case 'bottom_corners': return 'bottom-corners';
    case 'left_side': return 'left-corners';
    case 'right_side': return 'right-corners';
    case 'none': return 'none';
    default: return (item?.grommets as Grommets) || 'none';
  }
};

export const getGrommetLabelForDisplay = (item: any, fallback: string): string => {
  if (typeof item?.grommetOptionLabel === 'string' && item.grommetOptionLabel.trim()) return item.grommetOptionLabel;
  const option = normalizeGrommetOption(item?.grommetOption);
  if (AI_GROMMET_LABELS[option]) return AI_GROMMET_LABELS[option];
  return fallback;
};
