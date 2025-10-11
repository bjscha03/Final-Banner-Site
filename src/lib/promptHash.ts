import crypto from 'crypto';
import type { AspectRatio, StyleOptions } from '@/types/ai-generation';

export function normalizePrompt(prompt: string): string {
  const noiseWords = ['banner', 'background', 'image', 'for', 'a', 'an', 'the'];
  
  return prompt
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter(word => !noiseWords.includes(word))
    .sort()
    .join(' ');
}

export function generatePromptHash(
  prompt: string,
  aspect: AspectRatio,
  style: StyleOptions = {},
  size: string = '768x768'
): string {
  const normalized = normalizePrompt(prompt);
  const styleStr = JSON.stringify(style);
  const combined = `${normalized}|${aspect}|${styleStr}|${size}`;
  
  return crypto
    .createHash('sha256')
    .update(combined)
    .digest('hex');
}

export function generateId(): string {
  return `gen_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}

export function generateSelectionId(): string {
  return `sel_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
}
