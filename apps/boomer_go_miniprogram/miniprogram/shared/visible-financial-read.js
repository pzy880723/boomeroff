function createVisibleRead({ enabled, key, read, setTimeout, clearTimeout }) {
  let epoch = 0, timer = null, flight = null;
  function cancelTimer() { if (timer !== null) clearTimeout(timer); timer = null; }
  function stop() { epoch++; cancelTimer(); }
  function refresh() {
    cancelTimer();
    if (!enabled()) return Promise.resolve();
    const identity = key();
    if (flight) {
      if (flight.identity === identity && flight.epoch === epoch) return flight.promise;
      // Replace logical ownership, not the old network request. Its callbacks must stay inactive.
      epoch++;
    }
    const generation = epoch;
    const current = () => enabled() && epoch === generation && key() === identity;
    const slot = { identity, epoch: generation };
    flight = slot;
    slot.promise = Promise.resolve().then(() => current() && read(current)).finally(() => {
      if (flight === slot) flight = null;
      if (current()) timer = setTimeout(() => { timer = null; if (current()) refresh(); }, 30000);
    });
    return slot.promise;
  }
  return { refresh, stop };
}
module.exports = { createVisibleRead };
