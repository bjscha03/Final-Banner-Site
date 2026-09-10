import { describe, expect, it, vi } from 'vitest';
import {
  ORDER_CONFIRMATION_TOKEN_TTL_MS,
  readOrderConfirmationToken,
  removeOrderConfirmationToken,
  storeOrderConfirmationToken,
} from './orderConfirmationStorage';

const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn((key: string) => values.get(key) || null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
  };
};

describe('order confirmation token storage', () => {
  it('is scoped by order, expires, and can be removed after canonical loading', () => {
    const target = storage();
    storeOrderConfirmationToken('order-1', 'signed-confirmation-token', target, 10);
    expect(readOrderConfirmationToken('order-2', target, 11)).toBeNull();
    expect(readOrderConfirmationToken('order-1', target, 11)).toBe('signed-confirmation-token');
    expect(readOrderConfirmationToken('order-1', target, 10 + ORDER_CONFIRMATION_TOKEN_TTL_MS + 1)).toBeNull();

    storeOrderConfirmationToken('order-1', 'signed-confirmation-token', target, 20);
    removeOrderConfirmationToken('order-1', target);
    expect(readOrderConfirmationToken('order-1', target, 21)).toBeNull();
  });
});
