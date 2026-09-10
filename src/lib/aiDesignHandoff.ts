import { loadDraft, saveDraft } from '@/components/design/ai/draftStore';
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

export async function createAIHandoff(result: CreateWithAIResult, configurator: AIConfiguratorHandoff): Promise<string> {
  const id = createId();
  pending = { id, createdAt: Date.now(), result, configurator };
  await saveDraft(`handoff:${id}`, pending);
  return id;
}

// Reads are repeatable across route effects and reloads until upload succeeds.
export async function readAIHandoff(id: string): Promise<PendingHandoff | null> {
  const current = pending?.id === id ? pending : await loadDraft<PendingHandoff>(`handoff:${id}`);
  if (!current || current.id !== id || Date.now() - current.createdAt > 24 * 60 * 60 * 1000) return null;
  return current;
}

export async function completeAIHandoff(id: string): Promise<void> {
  if (pending?.id === id) pending = null;
  await saveDraft(`handoff:${id}`, null);
}
