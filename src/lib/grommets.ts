import type { Grommets } from '@/store/quote';

export type DesignGrommetOption = Grommets;

export const DESIGN_GROMMET_OPTIONS: ReadonlyArray<{
  value: DesignGrommetOption;
  label: string;
  description: string;
}> = [
  { value: 'none', label: 'None', description: 'No grommets' },
  { value: 'every-2-3ft', label: 'Every 2–3 Feet', description: 'Spaced along edges' },
  { value: 'every-1-2ft', label: 'Every 1–2 Feet', description: 'Closer spacing' },
  { value: '4-corners', label: '4 Corners Only', description: 'One grommet in each corner' },
  { value: 'top-corners', label: 'Top Corners Only', description: 'Top two corners' },
  { value: 'right-corners', label: 'Right Corners Only', description: 'Right two corners' },
  { value: 'left-corners', label: 'Left Corners Only', description: 'Left two corners' },
] as const;

const GROMMET_LABELS: Record<Grommets, string> = {
  none: 'None',
  '4-corners': '4 Corners Only',
  'every-2-3ft': 'Every 2–3 Feet',
  'every-1-2ft': 'Every 1–2 Feet',
  'top-corners': 'Top Corners Only',
  'right-corners': 'Right Corners Only',
  'left-corners': 'Left Corners Only',
};

export function getGrommetLabel(grommets?: string | null): string {
  if (!grommets) return 'None';
  return GROMMET_LABELS[grommets as Grommets] ?? grommets;
}
