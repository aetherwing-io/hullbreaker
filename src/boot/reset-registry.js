/* Deterministic ordered teardown without import-time registration. Modules
 * export reset functions; the composition root declares ownership in one
 * manifest. A new subsystem cannot silently replace another reset, and a
 * failed reset names the owner that failed. */

export function makeResetRegistry(entries) {
  const ids = new Set();
  const ordered = entries.map((entry) => {
    if (!entry?.id || typeof entry.id !== 'string' || typeof entry.reset !== 'function')
      throw new TypeError('reset entries require { id, reset }');
    if (ids.has(entry.id)) throw new Error(`duplicate reset owner: ${entry.id}`);
    ids.add(entry.id);
    return Object.freeze({ id: entry.id, reset: entry.reset });
  });
  let running = false;
  let runs = 0;
  let last = Object.freeze([]);
  return Object.freeze({
    entries: Object.freeze(ordered),
    reset(context) {
      if (running) throw new Error('run reset is not reentrant');
      running = true;
      const completed = [];
      try {
        for (const entry of ordered) {
          try { entry.reset(context); }
          catch (error) {
            const wrapped = new Error(`reset owner ${entry.id} failed`, { cause: error });
            wrapped.owner = entry.id;
            throw wrapped;
          }
          completed.push(entry.id);
        }
        runs++;
        last = Object.freeze(completed);
        return last;
      } finally {
        running = false;
      }
    },
    snapshot() {
      return { owners: ordered.map((entry) => entry.id), runs, last: [...last] };
    },
  });
}
