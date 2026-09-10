import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Cross-browser compatible UUID generation
 * Falls back to a secure random implementation if crypto.randomUUID() is not available
 */
export function generateUUID(): string {
  // Try modern crypto.randomUUID() first (available in modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (error) {
      console.warn('crypto.randomUUID() failed, falling back to manual generation:', error);
    }
  }

  // Fallback implementation for older browsers and mobile Safari
  // This uses crypto.getRandomValues() which has better browser support
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    try {
      const array = new Uint8Array(16);
      crypto.getRandomValues(array);

      // Set version (4) and variant bits according to RFC 4122
      array[6] = (array[6] & 0x0f) | 0x40; // Version 4
      array[8] = (array[8] & 0x3f) | 0x80; // Variant 10

      // Convert to hex string with proper formatting
      const hex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
      return [
        hex.slice(0, 8),
        hex.slice(8, 12),
        hex.slice(12, 16),
        hex.slice(16, 20),
        hex.slice(20, 32)
      ].join('-');
    } catch (error) {
      console.warn('crypto.getRandomValues() failed, falling back to Math.random():', error);
    }
  }

  // Final fallback using Math.random() (less secure but works everywhere)
  console.warn('Using Math.random() for UUID generation - not cryptographically secure');
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Cross-browser compatible localStorage operations with fallbacks
 */
export const safeStorage = {
  // In-memory fallback for when localStorage is not available
  memoryStorage: new Map<string, string>(),

  /**
   * Check if localStorage is available and working
   */
  isAvailable(): boolean {
    try {
      if (typeof window === 'undefined' || !window.localStorage) {
        return false;
      }

      // Test if we can actually write to localStorage
      const testKey = '__storage_test__';
      window.localStorage.setItem(testKey, 'test');
      window.localStorage.removeItem(testKey);
      return true;
    } catch (error) {
      console.warn('localStorage not available:', error);
      return false;
    }
  },

  /**
   * Get item from localStorage with fallback to memory storage
   */
  getItem(key: string): string | null {
    try {
      if (this.isAvailable()) {
        return window.localStorage.getItem(key);
      }
    } catch (error) {
      console.warn('Error reading from localStorage:', error);
    }

    // Fallback to memory storage
    return this.memoryStorage.get(key) || null;
  },

  /**
   * Set item in localStorage with fallback to memory storage
   */
  setItem(key: string, value: string): void {
    try {
      if (this.isAvailable()) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch (error) {
      console.warn('Error writing to localStorage:', error);
    }

    // Fallback to memory storage
    this.memoryStorage.set(key, value);
  },

  /**
   * Remove item from localStorage with fallback to memory storage
   */
  removeItem(key: string): void {
    try {
      if (this.isAvailable()) {
        window.localStorage.removeItem(key);
        return;
      }
    } catch (error) {
      console.warn('Error removing from localStorage:', error);
    }

    // Fallback to memory storage
    this.memoryStorage.delete(key);
  },

  /**
   * Clear all items from localStorage with fallback to memory storage
   */
  clear(): void {
    try {
      if (this.isAvailable()) {
        window.localStorage.clear();
        return;
      }
    } catch (error) {
      console.warn('Error clearing localStorage:', error);
    }

    // Fallback to memory storage
    this.memoryStorage.clear();
  }
};
