'use strict';

// Progress is informational. Serialize writes and keep only the newest pending
// update, without making the image pipeline wait for each storage round trip.
// Drain before the terminal record so an old progress write cannot overwrite it.
function createProgressWriter(write) {
  let latest = null;
  let running = null;
  let closed = false;
  function pump() {
    if (running || !latest) return;
    running = (async () => {
      while (latest) {
        const record = latest;
        latest = null;
        try { await write(record); } catch { /* Terminal writes remain mandatory. */ }
      }
    })().finally(() => { running = null; if (latest) pump(); });
  }
  return {
    publish(record) {
      if (closed) return;
      latest = record;
      pump();
    },
    async close() {
      closed = true;
      // The terminal result supersedes any progress not yet being uploaded.
      latest = null;
      while (running) await running;
    },
  };
}

module.exports = { createProgressWriter };
