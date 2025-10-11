import type { Tier } from '@/types/ai-generation';
import type { AIProvider } from './types';
import { openaiProvider } from './openaiProvider';
import { falProvider } from './falProvider';

export function getProvider(tier: Tier): AIProvider {
  if (tier === 'premium') {
    return openaiProvider;
  }
  return falProvider;
}

export function getCostForTier(tier: Tier): number {
  return getProvider(tier).costPerImage;
}
