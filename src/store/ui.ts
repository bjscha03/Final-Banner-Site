import { create } from 'zustand';

interface UIState {
  isCartOpen: boolean;
  setIsCartOpen: (isOpen: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isCartOpen: false,
  setIsCartOpen: (isOpen: boolean) => set({ isCartOpen: isOpen }),
}));
