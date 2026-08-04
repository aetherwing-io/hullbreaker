#!/usr/bin/env node
// Cheap ownership gate for render captures. New capture tools may not create
// their own browser/server pair or point at a fixed localhost origin. The
// central exemption table makes pre-existing migration debt explicit instead
// of silently grandfathering every unsafe file forever.

import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const DIR = resolve(ROOT, 'tools/playtest');

const REQUIRED_ISOLATED = new Set([
  'crown-finale-capture.mjs',
  'crown-mechanical-capture.mjs',
  'depth-composition-capture.mjs',
  'final-ecology-fixture-capture.mjs',
  'hostile-motion-death-capture.mjs',
  'hound-motion-v2-capture.mjs',
  'rig-presentation-capture.mjs',
  'scatterbloom-clarity-capture.mjs',
  'warden-deployment-capture.mjs',
  'world-detail-capture.mjs',
]);

// Existing lower-frequency rigs. Every entry is named so a newly introduced
// direct launcher fails this contract. Actor/limb are active concurrent lanes;
// comparative rigs need follow-up conversion because several intentionally
// create more than one measured browser lifecycle today.
const LEGACY_EXEMPT = new Map(Object.entries({
  'actor-motion-capture.mjs': 'active actor-motion owner; migrate after freeze',
  'limb-silhouette-capture.mjs': 'active limb-silhouette owner; migrate after freeze',
  'backdrop-capture.mjs': 'legacy paired art rig',
  'fogband-capture.mjs': 'legacy multi-variant atmosphere rig',
  'g1-capture.mjs': 'legacy transform proof',
  'g2-capture.mjs': 'legacy transform proof',
  'hulltex-capture.mjs': 'legacy multi-browser texture comparison',
  'legibility-capture.mjs': 'legacy screenshot analysis rig',
  'lightrig-capture.mjs': 'legacy multi-browser light comparison',
  'palette-capture.mjs': 'legacy palette comparison',
  'post-capture.mjs': 'legacy multi-browser post-process comparison',
  'scale-capture.mjs': 'legacy scale comparison',
  'sprite-capture.mjs': 'legacy sprite comparison',
  't044-capture.mjs': 'legacy checkpoint capture',
  'transform-capture.mjs': 'legacy transformation capture',
  'viewscale-capture.mjs': 'legacy camera-scale comparison',
}));

const FORBIDDEN = [
  { label: 'direct chromium.launch', regex: /\bchromium\.launch\s*\(/ },
  { label: 'direct launchBrowser', regex: /\blaunchBrowser\s*\(/ },
  { label: 'private startStaticServer', regex: /\bstartStaticServer\s*\(/ },
  { label: 'fixed localhost capture origin',
    regex: /https?:\/\/(?:127\.0\.0\.1|localhost):\d+/ },
];

const names = (await readdir(DIR)).filter((name) => name.endsWith('capture.mjs')).sort();
// Capsule/projectile presentation rigs are high-frequency by policy whenever
// they become repository-owned. None exists today; discovery makes a future
// addition isolated by default instead of requiring this list to be updated.
for (const name of names) {
  if (/(?:capsule|projectile).*capture\.mjs$/.test(name)) REQUIRED_ISOLATED.add(name);
}

const failures = [];
const exempt = [];
for (const name of names) {
  const source = await readFile(resolve(DIR, name), 'utf8');
  const violations = FORBIDDEN.filter((rule) => rule.regex.test(source)).map((rule) => rule.label);
  const isolated = /from ['"]\.\/lib\/isolated-browser\.mjs['"]/.test(source) &&
    /\bwithIsolatedBrowser\s*\(/.test(source);

  if (REQUIRED_ISOLATED.has(name)) {
    if (!isolated) failures.push(`${name}: does not use withIsolatedBrowser`);
    if (violations.length) failures.push(`${name}: ${violations.join(', ')}`);
    continue;
  }

  if (!violations.length) {
    if (LEGACY_EXEMPT.has(name)) failures.push(`${name}: stale legacy exemption`);
    continue;
  }
  const reason = LEGACY_EXEMPT.get(name);
  if (!reason) failures.push(`${name}: unregistered unsafe capture (${violations.join(', ')})`);
  else exempt.push({ name, reason, violations });
}

for (const name of REQUIRED_ISOLATED) {
  assert.ok(names.includes(name), `required capture missing: ${name}`);
}
for (const name of LEGACY_EXEMPT.keys()) {
  assert.ok(names.includes(name), `legacy exemption names missing capture: ${name}`);
}

if (failures.length) throw new Error(failures.join('\n'));
console.log(JSON.stringify({
  ok: true,
  isolated: [...REQUIRED_ISOLATED].sort(),
  legacyExemptions: exempt,
  captureCount: names.length,
}, null, 2));
