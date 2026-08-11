'use strict';

const DISPATCH_STALL_MS = 90 * 1000;
const FINALIZER_STALL_MS = 6 * 60 * 1000;
const IMPORT_STALL_MS = 16 * 60 * 1000;

function parsedTime(value) {
  const time = Date.parse(String(value || ''));
  return Number.isFinite(time) ? time : null;
}

function eventPreparationStall(row, nowMs = Date.now()) {
  if (!row) return { stalled: false, reason: null };
  const metadata = row.run_metadata || row.runMetadata || {};
  const status = String(row.status || '');
  const targetCount = Number(row.target_count ?? row.targetCount) || 70;
  const readyCount = Number(row.mockup_ready_count ?? row.mockupReadyCount) || 0;
  if (status === 'ready' && readyCount >= targetCount) {
    return { stalled: false, reason: null };
  }

  const dispatchReferenceAt = parsedTime(
    metadata.dispatchAcknowledgedAt || row.updated_at || row.updatedAt,
  );
  const waitingForBackground = metadata.dispatchState === 'acknowledged'
    || ['queued', 'dispatching', 'dispatched'].includes(String(metadata.phase || ''));
  if (waitingForBackground && !metadata.backgroundReceivedAt
      && dispatchReferenceAt !== null && nowMs - dispatchReferenceAt >= DISPATCH_STALL_MS) {
    return { stalled: true, reason: 'handoff' };
  }

  const action = ['import', 'finalize'].includes(metadata.backgroundAction)
    ? metadata.backgroundAction : null;
  const state = ['running', 'claim_deferred'].includes(metadata.backgroundState)
    ? metadata.backgroundState : null;
  if (!action || !state) return { stalled: false, reason: null };
  const workerReferenceAt = Math.max(
    parsedTime(metadata.backgroundReceivedAt) ?? 0,
    parsedTime(row.updated_at || row.updatedAt) ?? 0,
  );
  if (!workerReferenceAt) return { stalled: false, reason: null };
  const threshold = action === 'finalize' ? FINALIZER_STALL_MS : IMPORT_STALL_MS;
  return nowMs - workerReferenceAt >= threshold
    ? { stalled: true, reason: action }
    : { stalled: false, reason: null };
}

module.exports = {
  DISPATCH_STALL_MS,
  FINALIZER_STALL_MS,
  IMPORT_STALL_MS,
  eventPreparationStall,
};
