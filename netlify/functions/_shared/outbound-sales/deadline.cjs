'use strict';

function deadlineError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

async function withAbortableDeadline(task, {
  timeoutMs = 50_000,
  errorCode = 'OPERATION_TIMEOUT',
  message = 'The operation exceeded its safe execution deadline.',
} = {}) {
  if (typeof task !== 'function') throw new TypeError('A deadline task function is required.');
  const safeTimeout = Math.max(1, Math.min(10 * 60 * 1000, Number(timeoutMs) || 50_000));
  const controller = new AbortController();
  let timer;
  const work = Promise.resolve().then(() => task(controller.signal));
  // A timed-out task can still unwind asynchronously after its network work is
  // aborted. Attach a handler now so that late cleanup never becomes an
  // unhandled rejection in a background function.
  work.catch(() => null);
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(deadlineError(errorCode, message));
    }, safeTimeout);
    timer.unref?.();
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { deadlineError, withAbortableDeadline };
