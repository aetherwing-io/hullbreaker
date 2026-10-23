// QA (T-101 gate): independent layout sweep over phone viewports, using the
// deck's own pure layout + hit-test functions (the same code the browser runs).
// Judges what a thumb can do at each size: targets inside the safe area, the
// two right-thumb buttons separated, chips >= 44 px, no hit-zone conflicts
// between the stick zone and the right cluster, and how high the cluster reaches.
// Path handling (T-101 QA copy): the tree under test is HB_TREE (default: this repo checkout, i.e. five
// directories above this file). To test an unmerged worktree: HB_TREE=<worktree> node <script> ...
import * as _path from 'node:path';
import { fileURLToPath as _fileURLToPath, pathToFileURL as _pathToFileURL } from 'node:url';
const TREE = process.env.HB_TREE || _path.resolve(_path.dirname(_fileURLToPath(import.meta.url)), '../../../../..');
const tree = (p) => _pathToFileURL(_path.join(TREE, p)).href;
const { touchDeckLayout, deckZone, clusterHitBits, newDeckLayout } = await import(tree('src/pure/touch-stick.js'));
const { CONFIG } = await import(tree('src/config.js'));

const phones = [
  // [name, cssW, cssH] landscape; portrait is the transpose
  ['iPhone SE1 / 5s', 568, 320], ['iPhone SE2/3 / 8', 667, 375], ['iPhone 8 Plus', 736, 414],
  ['iPhone X/XS/11 Pro', 812, 375], ['iPhone 12/13/14', 844, 390], ['iPhone 14 Pro', 852, 393],
  ['iPhone 11 / XR', 896, 414], ['iPhone 12/13 Pro Max', 926, 428], ['iPhone 14/15 Pro Max', 932, 430],
  ['Pixel 7', 915, 412], ['Galaxy S20 (360x800)', 800, 360], ['iPad mini', 1133, 744],
];
const insets = [
  { name: 'none', t: 0, r: 0, b: 0, l: 0 },
  { name: 'notch-left', t: 0, r: 0, b: 21, l: 47 },      // landscape: notch on the left side
  { name: 'notch-right', t: 0, r: 47, b: 21, l: 0 },     // landscape: notch on the right side
];
// Safari shrinks the landscape visual viewport when its toolbar appears
const heightPenalties = [0, 50];

const issues = [];
const rows = [];
function judge(label, W, H, safe, topReserve) {
  const L = touchDeckLayout(W, H, safe, topReserve, CONFIG.touch.layout, CONFIG.touch.stick, newDeckLayout());
  const problems = [];
  const J = L.jump, F = L.fire, G = L.ghost;
  const inside = (cx, cy, r, name) => {
    if (cx - r < safe.left - 0.5 || cx + r > W - safe.right + 0.5 || cy - r < safe.top - 0.5 || cy + r > H - safe.bottom + 0.5)
      problems.push(`${name} circle leaves the safe area`);
  };
  inside(J.cx, J.cy, J.r, 'JUMP'); inside(F.cx, F.cy, F.r, 'FIRE'); inside(G.cx, G.cy, G.r, 'stick ghost');
  const boxInside = (b, name) => {
    if (b.x < safe.left - 0.5 || b.x + b.w > W - safe.right + 0.5 || b.y < safe.top - 0.5 || b.y + b.h > H - safe.bottom + 0.5)
      problems.push(`${name} chip leaves the safe area`);
  };
  boxInside(L.swap, 'SWAP'); boxInside(L.pause, 'PAUSE'); boxInside(L.auto, 'AUTO');
  const gap = Math.hypot(J.cx - F.cx, J.cy - F.cy) - J.r - F.r;
  if (gap < 6) problems.push(`JUMP/FIRE visual gap ${gap.toFixed(1)} px < 6`);
  for (const [n, b] of [['SWAP', L.swap], ['PAUSE', L.pause], ['AUTO', L.auto]]) {
    if (b.w < 44 - 0.01 || b.h < 44 - 0.01) problems.push(`${n} chip ${b.w.toFixed(1)}x${b.h.toFixed(1)} < 44 px`);
  }
  if (J.r * 2 < 64 - 0.01) problems.push(`JUMP diameter ${(J.r * 2).toFixed(1)} < 64`);
  // SWAP must not sit inside either button's HIT circle (a mis-swap throws away a rolled gun)
  const rectCircle = (b, c, r) => {
    const nx = Math.max(b.x, Math.min(c.cx, b.x + b.w)), ny = Math.max(b.y, Math.min(c.cy, b.y + b.h));
    return Math.hypot(nx - c.cx, ny - c.cy) < r;
  };
  if (rectCircle(L.swap, F, F.r * L.slop)) problems.push('SWAP chip overlaps the FIRE hit circle');
  if (rectCircle(L.swap, J, J.r * L.slop)) problems.push('SWAP chip overlaps the JUMP hit circle');
  // chips vs each other
  const rr = (a, b) => !(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y);
  if (rr(L.pause, L.auto)) problems.push('PAUSE overlaps AUTO');
  if (rr(L.swap, L.pause) || rr(L.swap, L.auto)) problems.push('SWAP overlaps a top chip');
  // zones: the right cluster's hit circles must not extend into the stick zone (split); the ghost must not reach the cluster
  if (F.cx - F.r * L.slop < L.split - 0.5) problems.push(`FIRE hit circle reaches into the stick zone by ${(L.split - (F.cx - F.r * L.slop)).toFixed(1)} px`);
  if (G.cx + G.r > L.split + 0.5) problems.push('stick ghost pokes past the stick zone split');
  if (Math.hypot(G.cx - F.cx, G.cy - F.cy) < G.r + F.r * L.slop) problems.push('stick ghost overlaps the FIRE hit circle');
  // the stick's whole throw (anchor + rim) from the ghost centre must stay on the glass
  if (G.cx - G.r < 0 || G.cy + G.r > H) problems.push('stick throw leaves the glass');
  // a touch exactly at each control centre must resolve to that control
  const at = (x, y) => ({ zone: deckZone(L, x), bits: clusterHitBits(L, x, y) });
  if (at(J.cx, J.cy).bits !== 16 && at(J.cx, J.cy).bits !== 48) problems.push('JUMP centre does not hit JUMP');
  if ((at(F.cx, F.cy).bits & 32) === 0) problems.push('FIRE centre does not hit FIRE');
  if (at(G.cx, G.cy).zone !== 'stick') problems.push('ghost centre is not in the stick zone');
  const clusterTopFrac = L.cluster.y / H;
  const lensPx = (J.r + F.r) * L.slop - Math.hypot(J.cx - F.cx, J.cy - F.cy);
  rows.push({ label, W, H, safe: safe.name || '', jump: +(J.r * 2).toFixed(1), fire: +(F.r * 2).toFixed(1), chip: +L.swap.w.toFixed(1),
    gap: +gap.toFixed(1), lens: +lensPx.toFixed(1), rim: +L.rim.toFixed(1), clusterTopPct: +(clusterTopFrac * 100).toFixed(1),
    clusterLeftPct: +((L.cluster.x / W) * 100).toFixed(1), problems });
  if (problems.length) issues.push({ label, W, H, problems });
}

for (const [name, w, h] of phones) {
  for (const hp of heightPenalties) {
    for (const ins of insets) {
      // landscape
      const Hl = h - hp;
      judge(`${name} landscape h-${hp} ${ins.name}`, w, Hl, { top: 0, right: ins.r, bottom: ins.b, left: ins.l }, 48);
    }
  }
  // portrait (no Safari toolbar penalty modelled; bottom inset for the home indicator, top for the notch)
  judge(`${name} portrait`, h, w, { top: 47, right: 0, bottom: 34, left: 0 }, 170);
  judge(`${name} portrait no-insets`, h, w, { top: 0, right: 0, bottom: 0, left: 0 }, 170);
}

console.log(`${rows.length} layouts swept`);
const worst = (k, f) => rows.reduce((a, b) => (f(b[k], a[k]) ? b : a));
const land = rows.filter((r) => r.W > r.H), port = rows.filter((r) => r.W <= r.H);
const stat = (arr, k) => { const v = arr.map((r) => r[k]); return `${Math.min(...v)}..${Math.max(...v)}`; };
console.log(`landscape: JUMP ${stat(land, 'jump')} px, FIRE ${stat(land, 'fire')} px, chip ${stat(land, 'chip')} px, JUMP-FIRE gap ${stat(land, 'gap')} px, lens ${stat(land, 'lens')} px, cluster top at ${stat(land, 'clusterTopPct')} % of height`);
console.log(`portrait : JUMP ${stat(port, 'jump')} px, FIRE ${stat(port, 'fire')} px, chip ${stat(port, 'chip')} px, JUMP-FIRE gap ${stat(port, 'gap')} px, lens ${stat(port, 'lens')} px, cluster top at ${stat(port, 'clusterTopPct')} % of height`);
// the lowest cluster tops
const lowTop = [...land].sort((a, b) => a.clusterTopPct - b.clusterTopPct).slice(0, 4);
console.log('landscape layouts whose cluster reaches highest (smallest top %):');
for (const r of lowTop) console.log(`  ${r.label}: top ${r.clusterTopPct}% (viewport ${r.W}x${r.H})`);
const lowTopP = [...port].sort((a, b) => a.clusterTopPct - b.clusterTopPct).slice(0, 3);
console.log('portrait layouts whose cluster reaches highest:');
for (const r of lowTopP) console.log(`  ${r.label}: top ${r.clusterTopPct}% (viewport ${r.W}x${r.H})`);
if (issues.length) {
  console.log(`\n${issues.length} layouts with problems:`);
  const byProblem = new Map();
  for (const i of issues) for (const p of i.problems) { if (!byProblem.has(p)) byProblem.set(p, []); byProblem.get(p).push(`${i.label} (${i.W}x${i.H})`); }
  for (const [p, where] of byProblem) console.log(`  - ${p}: ${where.length} layouts, e.g. ${where.slice(0, 3).join('; ')}`);
} else {
  console.log('\nno problems in any layout');
}
