import type { CreateWithAIResult } from '@/components/design/ai/types';
import type { MaterialKey } from '@/store/quote';

export type AIConfiguratorHandoff = {
  widthIn: number;
  heightIn: number;
  material: MaterialKey;
  quantity: number;
};

type PendingHandoff = {
  id: string;
  createdAt: number;
  result: CreateWithAIResult;
  configurator: AIConfiguratorHandoff;
};

let pending: PendingHandoff | null = null;

function createId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `ai-handoff-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function createAIHandoff(result: CreateWithAIResult, configurator: AIConfiguratorHandoff): string {
  const id = createId();
  pending = { id, createdAt: Date.now(), result, configurator };
  return id;
}

export function consumeAIHandoff(id: string): Omit<PendingHandoff, 'id' | 'createdAt'> | null {
  const current = pending;
  pending = null;
  if (!current || current.id !== id || Date.now() - current.createdAt > 5 * 60 * 1000) return null;
  return { result: current.result, configurator: current.configurator };
}
