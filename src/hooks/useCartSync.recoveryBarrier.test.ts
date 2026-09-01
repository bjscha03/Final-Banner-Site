import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const source = readFileSync(fileURLToPath(new URL('./useCartSync.ts', import.meta.url)), 'utf8');

describe('useCartSync recovery startup barrier', () => {
  it('claims signed recovery before the account merge effect can run', () => {
    const prepareIndex = source.indexOf('prepareAbandonedCartRecoveryToken()');
    const beginIndex = source.indexOf('beginStartupCartRecovery()');
    const effectIndex = source.indexOf('useEffect(() => {');

    expect(prepareIndex).toBeGreaterThan(-1);
    expect(beginIndex).toBeGreaterThan(prepareIndex);
    expect(beginIndex).toBeLessThan(effectIndex);
    expect(source).toContain('isStartupCartRecoveryBlocking(startupRecovery)');
  });

  it('does not commit a login merge that recovery invalidated in flight', () => {
    const mergeIndex = source.indexOf('await cartSyncService.mergeGuestCartOnLogin');
    const commitGuardIndex = source.indexOf('if (!canCommitAccountCartHydration(hydrationTicket))');
    const setItemsIndex = source.indexOf('useCartStore.setState({ items: mergedItems })');

    expect(mergeIndex).toBeGreaterThan(-1);
    expect(commitGuardIndex).toBeGreaterThan(mergeIndex);
    expect(setItemsIndex).toBeGreaterThan(commitGuardIndex);
  });

  it('consumes a restored snapshot without loading the old account cart over it', () => {
    expect(source).toContain("startupRecovery.phase === 'restored'");
    expect(source).toContain('handledRestoredRevisionRef.current = startupRecovery.revision');
    expect(source).toContain('hasMergedRef.current = true');
  });

  it('revokes recovered cart ownership when the authenticated identity changes', () => {
    expect(source).toContain('recoveryIdentityRef');
    expect(source).toContain('claimedIdentity.userId !== currentUserId');
    expect(source).toContain('writeStoredAbandonedCartRecoveryAttribution(null)');
    expect(source).toContain('terminateCurrentStartupCartRecovery()');
  });
});
