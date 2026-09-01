import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginStartupCartRecovery,
  canCommitAccountCartHydration,
  canStartAccountCartHydration,
  canStartCartRecoveryAttempt,
  captureAccountCartHydrationTicket,
  finishStartupCartRecovery,
  getStartupCartRecoverySnapshot,
  isStartupCartRecoveryAttemptCurrent,
  resetStartupCartRecoveryForTests,
  subscribeToStartupCartRecovery,
  terminateCurrentStartupCartRecovery,
} from './cartRecoveryStartup';

describe('startup cart recovery coordinator', () => {
  beforeEach(() => resetStartupCartRecoveryForTests());

  it('blocks account hydration while recovery is pending or waiting for retry', () => {
    const idleTicket = captureAccountCartHydrationTicket();
    expect(canStartAccountCartHydration(idleTicket)).toBe(true);

    const revision = beginStartupCartRecovery();
    expect(canStartAccountCartHydration(captureAccountCartHydrationTicket())).toBe(false);
    expect(canCommitAccountCartHydration(idleTicket)).toBe(false);

    expect(finishStartupCartRecovery(revision, 'retryable')).toBe(true);
    expect(canStartAccountCartHydration(captureAccountCartHydrationTicket())).toBe(false);
  });

  it('invalidates a late account response and gives an explicit retry a new revision', () => {
    const staleAccountRequest = captureAccountCartHydrationTicket();
    const firstRevision = beginStartupCartRecovery();
    expect(isStartupCartRecoveryAttemptCurrent(firstRevision)).toBe(true);
    finishStartupCartRecovery(firstRevision, 'retryable');
    expect(isStartupCartRecoveryAttemptCurrent(firstRevision)).toBe(false);
    const retryRevision = beginStartupCartRecovery();

    expect(retryRevision).toBe(firstRevision + 1);
    expect(canCommitAccountCartHydration(staleAccountRequest)).toBe(false);
    expect(finishStartupCartRecovery(firstRevision, 'restored')).toBe(false);
    expect(finishStartupCartRecovery(retryRevision, 'restored')).toBe(true);
    expect(getStartupCartRecoverySnapshot()).toEqual({
      phase: 'restored',
      revision: retryRevision,
    });
    expect(canStartAccountCartHydration(captureAccountCartHydrationTicket())).toBe(false);
  });

  it('releases a deferred barrier when an existing checkout finishes first', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToStartupCartRecovery(listener);
    beginStartupCartRecovery();
    terminateCurrentStartupCartRecovery();

    expect(getStartupCartRecoverySnapshot().phase).toBe('terminal');
    expect(canStartAccountCartHydration(captureAccountCartHydrationTicket())).toBe(true);
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });

  it('releases a restored cart only when checkout is finished or abandoned', () => {
    const revision = beginStartupCartRecovery();
    finishStartupCartRecovery(revision, 'restored');
    expect(canStartAccountCartHydration(captureAccountCartHydrationTicket())).toBe(false);

    terminateCurrentStartupCartRecovery();
    expect(canStartAccountCartHydration(captureAccountCartHydrationTicket())).toBe(true);
  });

  it.each(['stripe', 'paypal'])('defers recovery behind an unresolved %s checkout marker', () => {
    expect(canStartCartRecoveryAttempt({
      hasToken: true,
      cartIsLoading: false,
      hasActiveCheckout: true,
      needsStoredCheckoutRecovery: true,
      paymentRecoveryChecking: false,
      paymentAlreadySucceeded: false,
    })).toBe(false);
  });

  it('allows recovery only after payment reconciliation clears every lock', () => {
    expect(canStartCartRecoveryAttempt({
      hasToken: true,
      cartIsLoading: false,
      hasActiveCheckout: false,
      needsStoredCheckoutRecovery: false,
      paymentRecoveryChecking: false,
      paymentAlreadySucceeded: false,
    })).toBe(true);
    expect(canStartCartRecoveryAttempt({
      hasToken: true,
      cartIsLoading: false,
      hasActiveCheckout: false,
      needsStoredCheckoutRecovery: false,
      paymentRecoveryChecking: false,
      paymentAlreadySucceeded: true,
    })).toBe(false);
  });
});
