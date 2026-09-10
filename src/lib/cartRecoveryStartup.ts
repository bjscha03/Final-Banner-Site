export type StartupCartRecoveryPhase =
  | 'idle'
  | 'pending'
  | 'retryable'
  | 'restored'
  | 'terminal';

export interface StartupCartRecoverySnapshot {
  phase: StartupCartRecoveryPhase;
  revision: number;
}

export interface AccountCartHydrationTicket {
  revision: number;
  phase: StartupCartRecoveryPhase;
}

let snapshot: StartupCartRecoverySnapshot = Object.freeze({
  phase: 'idle',
  revision: 0,
});

const listeners = new Set<() => void>();

function publish(next: StartupCartRecoverySnapshot): void {
  snapshot = Object.freeze(next);
  listeners.forEach((listener) => listener());
}

export function getStartupCartRecoverySnapshot(): StartupCartRecoverySnapshot {
  return snapshot;
}

export function subscribeToStartupCartRecovery(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * Claims startup cart ownership for a signed recovery attempt. Repeated calls
 * during the same in-flight attempt are idempotent; an explicit retry receives
 * a new revision so stale account-cart requests cannot commit afterward.
 */
export function beginStartupCartRecovery(): number {
  if (snapshot.phase === 'pending') return snapshot.revision;
  const revision = snapshot.revision + 1;
  publish({ phase: 'pending', revision });
  return revision;
}

export function finishStartupCartRecovery(
  revision: number,
  phase: Extract<StartupCartRecoveryPhase, 'retryable' | 'restored' | 'terminal'>,
): boolean {
  if (snapshot.revision !== revision || snapshot.phase !== 'pending') return false;
  publish({ phase, revision });
  return true;
}

export function isStartupCartRecoveryAttemptCurrent(revision: number): boolean {
  return snapshot.phase === 'pending' && snapshot.revision === revision;
}

/** Ends a deferred recovery when an already-started payment wins the race. */
export function terminateCurrentStartupCartRecovery(): void {
  if (snapshot.phase === 'idle' || snapshot.phase === 'terminal') return;
  publish({ phase: 'terminal', revision: snapshot.revision });
}

export function isStartupCartRecoveryBlocking(
  value: StartupCartRecoverySnapshot = snapshot,
): boolean {
  return value.phase === 'pending' || value.phase === 'retryable';
}

export function captureAccountCartHydrationTicket(): AccountCartHydrationTicket {
  return { revision: snapshot.revision, phase: snapshot.phase };
}

/**
 * Account hydration may start only outside recovery ownership and may commit
 * only if no recovery attempt began while its network request was in flight.
 */
export function canStartAccountCartHydration(
  ticket: AccountCartHydrationTicket = captureAccountCartHydrationTicket(),
): boolean {
  return ticket.phase === 'idle' || ticket.phase === 'terminal';
}

export function canCommitAccountCartHydration(ticket: AccountCartHydrationTicket): boolean {
  return canStartAccountCartHydration(ticket)
    && ticket.revision === snapshot.revision
    && !isStartupCartRecoveryBlocking(snapshot);
}

export function canStartCartRecoveryAttempt(input: {
  hasToken: boolean;
  cartIsLoading: boolean;
  hasActiveCheckout: boolean;
  needsStoredCheckoutRecovery: boolean;
  paymentRecoveryChecking: boolean;
  paymentAlreadySucceeded: boolean;
}): boolean {
  return input.hasToken
    && !input.cartIsLoading
    && !input.hasActiveCheckout
    && !input.needsStoredCheckoutRecovery
    && !input.paymentRecoveryChecking
    && !input.paymentAlreadySucceeded;
}

/** Test-only reset for this module-level startup coordinator. */
export function resetStartupCartRecoveryForTests(): void {
  publish({ phase: 'idle', revision: 0 });
}
