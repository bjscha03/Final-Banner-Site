import type { Grommets } from '@/store/quote';

export type DesignGrommetOption = Extract<Grommets, 'none' | '4-corners' | 'every-2-3ft'>;

export const DESIGN_GROMMET_OPTIONS: ReadonlyArray<{
  value: DesignGrommetOption;
  label: string;
  description: string;
}> = [
  { value: 'none', label: 'None', description: 'No grommets' },
  { value: '4-corners', label: '4 Corners', description: 'One grommet in each corner' },
  { value: 'every-2-3ft', label: 'Every 2 Feet', description: 'Spaced along edges' },
] as const;

const GROMMET_LABELS: Record<Grommets, string> = {
  none: 'None',
  '4-corners': '4 Corners',
  'every-2-3ft': 'Every 2 Feet',
  'every-1-2ft': 'Every 1–2 Feet',
  'top-corners': 'Top Corners',
  'right-corners': 'Right Corners',
  'left-corners': 'Left Corners',
};

export function getGrommetLabel(grommets?: string | null): string {
  if (!grommets) return 'None';
  return GROMMET_LABELS[grommets as Grommets] ?? grommets;
}
