#!/usr/bin/env node
// Focused falsifier for the old-only asset collision that pairwise
// current-vs-retained comparison misses.

import { findAssetConflicts } from './build-pages-site.mjs';

function entry(ref, pairs) {
  return { ref, assets: new Map(pairs) };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const oldOnlyPath = 'assets/generated/sprites/retired-v1.png';
const current = entry('current', []); // pathname was deleted from current
const oldA = entry('refs/tags/v0.1.0', [[oldOnlyPath, 'aaaaaaaa']]);
const oldBConflict = entry('refs/tags/v0.2.0', [[oldOnlyPath, 'bbbbbbbb']]);
const oldBSame = entry('refs/tags/v0.2.0', [[oldOnlyPath, 'aaaaaaaa']]);

const brokenUnion = findAssetConflicts([current, oldA, oldBConflict]);
assert(brokenUnion.conflicts.length === 1,
  'two retained refs disagreeing on a current-deleted pathname must conflict');
assert(brokenUnion.conflicts[0].path === oldOnlyPath,
  'the conflict must name the old-only pathname');
assert(brokenUnion.conflicts[0].variants.length === 2,
  'the conflict must retain both blob variants');

const validUnion = findAssetConflicts([current, oldA, oldBSame]);
assert(validUnion.conflicts.length === 0,
  'two retained refs sharing one old-only blob must be accepted');
assert(validUnion.byPath.get(oldOnlyPath)?.size === 1,
  'the accepted old-only pathname must have one canonical blob');

console.log('asset-union-selftest: PASS (old-only disagreement rejected; canonical old-only blob accepted)');
