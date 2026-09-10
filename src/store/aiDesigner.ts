import { create } from 'zustand';

type Snapshot = any;

type State = {
  width: number; height: number; material: string; finishing: string; quantity: number; price: number;
  originalPrompt: string; enhancedPrompt: string; editInstruction: string;
  imageUrl: string | null; isLoading: boolean; history: Snapshot[];
  set: (p: Partial<State>) => void;
  pushHistory: () => void;
  revert: () => void;
};

export const useAIDesignerStore = create<State>((set, get) => ({
  width: 8, height: 4, material: '13oz Standard Vinyl', finishing: 'None', quantity: 1, price: 0,
  originalPrompt: '', enhancedPrompt: '', editInstruction: '', imageUrl: null, isLoading: false, history: [],
  set: (p) => set(p as any),
  pushHistory: () => {
    const cur = get();
    set({ history: [...cur.history, { ...cur, history: undefined }] as Snapshot[] });
  },
  revert: () => {
    const h = [...get().history];
    const prev = h.pop();
    if (prev) set({ ...(prev as any), history: h });
  },
}));
