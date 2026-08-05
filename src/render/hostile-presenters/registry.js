/* Hostile body presentation is selected once, when the sim row enters the
 * render world.  The registry owns priority and lifecycle dispatch; the
 * large hostile renderer continues to own shared attachments, contact,
 * tower placement, death pools and telemetry.  A new atlas presentation is
 * therefore one descriptor module plus one entry in index.js, not another
 * branch in hostiles.js's per-frame sync. */

const REQUIRED = Object.freeze([
  'id', 'matches', 'spawn', 'syncPose', 'ownsSilhouette',
  'usesLegacyPose', 'syncMaterial', 'syncTransform', 'prepareRemoval',
]);

function validate(presenter) {
  if (!presenter || typeof presenter !== 'object')
    throw new TypeError('hostile presenter must be an object');
  if (!presenter.id || typeof presenter.id !== 'string')
    throw new TypeError('hostile presenter requires a stable string id');
  for (const key of REQUIRED.slice(1)) {
    if (typeof presenter[key] !== 'function')
      throw new TypeError(`hostile presenter ${presenter.id} requires ${key}()`);
  }
  return presenter;
}

export function makeHostilePresenterRegistry(presenters) {
  const ordered = presenters.map(validate);
  const ids = new Set();
  for (const presenter of ordered) {
    if (ids.has(presenter.id))
      throw new Error(`duplicate hostile presenter id: ${presenter.id}`);
    ids.add(presenter.id);
  }
  const frozen = Object.freeze([...ordered]);
  return Object.freeze({
    ordered: frozen,
    select(assets) {
      for (const presenter of frozen)
        if (presenter.matches(assets)) return presenter;
      throw new Error('hostile presenter registry has no fallback');
    },
    get(id) { return frozen.find((presenter) => presenter.id === id) || null; },
  });
}
