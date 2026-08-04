#!/usr/bin/env node
/* Focused, browser-free contract for the five projectile families.
   Runtime screenshots prove the pixels; this gate protects the architecture
   that makes those pixels deterministic and collision-honest. */

import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { CONFIG } from '../src/config.js';
import { decodePng } from './assets/lib/png.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
const main = read('src/main.js');
const boot = read('src/render/projectile-art.js');
const bullets = read('src/render/bullets.js');
const weapons = read('src/sim/weapons.js');
let passed = 0;

function ok(value, message) {
  if (!value) throw new Error(`PROJECTILE PRESENTATION FAIL: ${message}`);
  passed++;
  console.log(`ok ${passed} - ${message}`);
}

function occurrences(text, pattern) {
  return (text.match(pattern) || []).length;
}

function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

function rgbaCellSha(png, column) {
  const hash = createHash('sha256');
  for (let y = 0; y < 256; y++) {
    const from = (y * png.width + column * 256) * 4;
    hash.update(png.rgba.subarray(from, from + 256 * 4));
  }
  return hash.digest('hex');
}

function cellAlphaBounds(png, column, threshold = 12) {
  let minX = 256, minY = 256, maxX = -1, maxY = -1, ink = 0, partial = 0;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const alpha = png.rgba[(y * png.width + column * 256 + x) * 4 + 3];
    if (alpha > 0 && alpha < 255) partial++;
    if (alpha <= threshold) continue;
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y); ink++;
  }
  return {
    x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1,
    ink, partial,
  };
}

function cellComponents(png, column, threshold = 24) {
  const mask = new Uint8Array(256 * 256);
  let greenLeak = 0;
  for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) {
    const src = (y * png.width + column * 256 + x) * 4;
    const alpha = png.rgba[src + 3];
    if (alpha <= threshold) continue;
    mask[y * 256 + x] = 1;
    const r = png.rgba[src], g = png.rgba[src + 1], b = png.rgba[src + 2];
    if (g > 90 && g > r * 1.35 && g > b * 1.35 && g - Math.max(r, b) > 30)
      greenLeak++;
  }
  const queue = new Int32Array(mask.length);
  const sizes = [];
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start]) continue;
    let head = 0, tail = 0, size = 0;
    queue[tail++] = start; mask[start] = 0;
    while (head < tail) {
      const p = queue[head++], x = p & 255, y = p >> 8; size++;
      if (x > 0 && mask[p - 1]) { mask[p - 1] = 0; queue[tail++] = p - 1; }
      if (x < 255 && mask[p + 1]) { mask[p + 1] = 0; queue[tail++] = p + 1; }
      if (y > 0 && mask[p - 256]) { mask[p - 256] = 0; queue[tail++] = p - 256; }
      if (y < 255 && mask[p + 256]) { mask[p + 256] = 0; queue[tail++] = p + 256; }
    }
    sizes.push(size);
  }
  sizes.sort((a, b) => b - a);
  return { sizes, greenLeak };
}

// Exact area-average alpha reduction of the decoded S silhouette. This is a
// deliberately tiny mip proxy: it judges the 6/10/20px ammunition shapes the
// operator actually sees, not the pleasant 230px source painting.
function downsampleAlpha(png, column, bounds, width) {
  const height = Math.max(2, Math.round(width * bounds.height / bounds.width));
  const pixels = new Float64Array(width * height);
  let maxAlpha = 0;
  for (let dy = 0; dy < height; dy++) for (let dx = 0; dx < width; dx++) {
    const sx0 = bounds.x + dx * bounds.width / width;
    const sx1 = bounds.x + (dx + 1) * bounds.width / width;
    const sy0 = bounds.y + dy * bounds.height / height;
    const sy1 = bounds.y + (dy + 1) * bounds.height / height;
    let weighted = 0, area = 0;
    for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) {
      const oy = Math.max(0, Math.min(sy + 1, sy1) - Math.max(sy, sy0));
      for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
        const ox = Math.max(0, Math.min(sx + 1, sx1) - Math.max(sx, sx0));
        const weight = ox * oy;
        weighted += png.rgba[(sy * png.width + column * 256 + sx) * 4 + 3] * weight;
        area += weight;
      }
    }
    const alpha = area ? weighted / area : 0;
    pixels[dy * width + dx] = alpha;
    maxAlpha = Math.max(maxAlpha, alpha);
  }
  let activeColumns = 0, activePixels = 0;
  for (let x = 0; x < width; x++) {
    let columnActive = false;
    for (let y = 0; y < height; y++) {
      if (pixels[y * width + x] >= 24) { columnActive = true; activePixels++; }
    }
    if (columnActive) activeColumns++;
  }
  return { width, height, activeColumns, activePixels, maxAlpha };
}

const bootAt = main.indexOf("import './render/projectile-art.js'");
const postAt = main.indexOf("from './render/post.js'");
const hostilesAt = main.indexOf("from './render/hostiles.js'");
const backdropAt = main.indexOf("import './render/backdrop.js'");
ok(bootAt >= 0 && bootAt < postAt && bootAt < hostilesAt && bootAt < backdropAt,
  'dependency-light projectile owner is imported before every heavy asset sibling');
ok(occurrences(boot, /preloadTexture\s*\(/g) === 1 &&
   occurrences(bullets, /preloadTexture\s*\(/g) === 0,
  'the atlas registers exactly once, in its dedicated boot owner');
ok(/await\s+awaitPreloads\(\)/.test(boot) &&
   /PROJECTILE_ART_SLOT\s*=\s*Object\.freeze/.test(boot),
  'one shared gate settles before the immutable consumer contract is exported');
ok(!/TextureLoader|setTimeout|Promise\.race/.test(boot + bullets),
  'projectiles define no second loader, timer, race, or post-frame swap');
ok(/state:\s*PROJECTILE_ART_ON\s*\?\s*\(ready\s*\?\s*'ready'\s*:\s*'failed'\)/.test(boot) &&
   /tex:\s*ready\s*\?\s*entry\.tex\s*:\s*null/.test(boot) &&
   /if\s*\(artSlot\.state\s*===\s*'ready'\s*&&\s*artSlot\.tex\)/.test(bullets),
  'failed or disabled art selects the complete geometry fallback before pools build');

ok(/canvas:\s*Object\.freeze\(\[1536,\s*256\]\)/.test(boot) &&
   /order:\s*Object\.freeze\(\['R',\s*'S',\s*'L',\s*'H',\s*'F',\s*'G'\]\)/.test(boot),
  'one production atlas exposes five chassis plus Cindermouth ground fire');
ok(occurrences(bullets, /new THREE\.InstancedMesh\s*\(/g) >= 8 &&
   /const historyX = new Float32Array/.test(bullets) &&
   /const terminalReasonCounts = \{/.test(bullets) &&
   /const lastEndpoint = \{/.test(bullets),
  'chassis, wakes, traits, history, and endpoint diagnostics remain fixed-capacity pools');

const syncStart = bullets.indexOf('function syncSlot(');
const syncEnd = bullets.indexOf('/* ------------------- departing tracers', syncStart);
const sync = stripComments(bullets.slice(syncStart, syncEnd));
ok(syncStart >= 0 && syncEnd > syncStart && !/\bnew\s+/.test(sync),
  'the per-projectile hot loop performs no object or geometry allocation');
ok(!/Math\.sin\(b\.(?:x|y)/.test(sync) && !/markPulse/.test(sync) &&
   /const pulse = 1;/.test(sync),
  'chassis and trait silhouettes do not scale-pump between pixel shapes');
ok(/const front = Math\.min\(nose \* look\.front, look\.frontCap\)/.test(sync) &&
   /const artFront = Math\.min\(front, artLook\.frontCap\)/.test(sync) &&
   /addScaledVector\(_flight, -back\)/.test(bullets),
  'painted noses stay inside the sanctioned point-collision cap and traits live behind it');

ok(/case 'S':/.test(bullets) && /case 'L':/.test(bullets) &&
   /case 'H':/.test(bullets) && /case 'F':/.test(bullets) &&
   /default:\s*\/\/ Rivet/.test(bullets),
  'all five weapon families own a distinct terminal impact sentence');
ok(!/fxRing\s*\(/.test(bullets) && /circularRings:\s*false/.test(bullets),
  'projectile flight and impacts introduce no circular blob/radius glyph');
ok(/view\.bullets\.hideSlot\(i, b, reason\)/.test(weapons) &&
   /killBullet\(b, i, gone \? goneReason : 'lifetime'\)/.test(weapons),
  'simulation hands the renderer its exact terminal row and classified reason');
ok(/const s = b\.x, y = b\.y/.test(bullets) &&
   /fxDirectedBurst\([^;]*b\.x, b\.y/s.test(bullets) &&
   !/slotLastS|slotLastY|slotSampled|slotTravel/.test(bullets),
  'endpoint effects use exact terminal coordinates with no prior-frame inference');
ok(/reason === 'hostile' \|\| reason === 'terrain'/.test(bullets) &&
   /reason === 'lifetime'/.test(bullets) &&
   /terminalSputter\(i, b\)/.test(bullets),
  'full impacts are collision-only while lifetime owns a small sputter');
ok(/projectileOnVisibleFacet\(b\.x\)/.test(bullets) &&
   /hideSlot\(i, null, 'reset'\)/.test(bullets) &&
   !/reason === 'bend'[^}]*terminalImpact/s.test(bullets),
  'fold, bend, pool replacement, and reset paths conceal without false hits');

const png = readFileSync(join(root,
  'assets/generated/projectiles/projectile-chassis-atlas-v2.png'));
ok(png.readUInt32BE(16) === 1536 && png.readUInt32BE(20) === 256,
  'the shipped atlas binary matches its 1536x256 runtime contract');

const atlasPath = join(root, 'assets/generated/projectiles/projectile-chassis-atlas-v2.png');
const decoded = decodePng(atlasPath);
const expectedCells = [
  '766890aed993ed9ad95ddfbf76968c8b766e8ccd15d95db9a87e054f07f72a9a',
  '5a1153d591bb503ffbc08f6a2e4f5352278298a31f3b2242a441fafe2aa29581',
  'ec75b00bd5e52e09a1666dfdb534b69fa0cc42136c681b07aae6c9fd7785b77c',
  'c9ceef8facf45816ba145feed6e0284bdf8f8266835f93a60a9423fc879f81f1',
  '80939cd0872e55aca5435ee2c3ce24ec16c2811ce6bead51d5855d065adc398b',
  '2f47851ef8157714bd62009b5fc04b2697a27b7c00e922bd411ca05cea5c4fa8',
];
const actualCells = expectedCells.map((_, column) => rgbaCellSha(decoded, column));
ok(actualCells.every((hash, column) => hash === expectedCells[column]),
  'decoded RGBA locks five proven chassis plus the painted ground-fire wave');

const groundBounds = cellAlphaBounds(decoded, 5);
const groundComponents = cellComponents(decoded, 5);
ok(groundBounds.x === 13 && groundBounds.y === 109 &&
   groundBounds.width === 230 && groundBounds.height === 37 &&
   groundBounds.width / groundBounds.height >= 6 &&
   groundBounds.partial >= 900 && groundComponents.greenLeak === 0,
  'ground fire is a narrow antialiased 230x37 painted wave with no key fringe');
ok(/const groundArtMesh = artMeshes\.G \|\| null/.test(bullets) &&
   /groundArtMesh\.setMatrixAt\(i, _bm\)/.test(bullets) &&
   /paintedWave:\s*!!groundArtMesh/.test(bullets) &&
   /groundFireMesh\.setMatrixAt\(i, HIDE\)/.test(bullets),
  'deck ignition swaps the rigid chassis for one pooled painted ground wave');

const scatterBounds = cellAlphaBounds(decoded, 1);
ok(scatterBounds.x === 13 && scatterBounds.y === 101 &&
   scatterBounds.width === 230 && scatterBounds.height === 53 &&
   scatterBounds.width / scatterBounds.height >= 3.5 &&
   scatterBounds.partial >= 1000,
  'Scatterbloom is one antialiased 230x53 narrow flechette with safe cell guards');

const scatterComponents = cellComponents(decoded, 1);
ok(scatterComponents.sizes.length === 1 && scatterComponents.sizes[0] >= 8000 &&
   scatterComponents.greenLeak === 0,
  'the flechette has one continuous manufactured body and no chroma-key fringe');

const tinyScatter = [6, 10, 20].map((width) =>
  downsampleAlpha(decoded, 1, scatterBounds, width));
ok(tinyScatter.every((sample) => sample.activeColumns >= sample.width - 1 &&
   sample.activePixels >= sample.width && sample.maxAlpha >= 220),
  'area-average 6/10/20px reductions retain a continuous pointed shot sentence');

ok(/S:\s*Object\.freeze\(\{\s*frontCap:\s*Infinity,\s*tail:\s*0\.55,\s*thickness:\s*0\.90\s*\}\)/.test(bullets) &&
   /S:\s*\{[^}]*wakeW:\s*0\.040,[^}]*trail:\s*0\.016/s.test(bullets) &&
   /syncTraitMark\(i, 'rapid', rapid, tail \+ 0\.28, 0\.54, 0\.16\)/.test(bullets) &&
   /syncStackMark\(i, 'rapid', rapid, tail \+ 0\.82, 0\.54, 0\.13\)/.test(bullets),
  'Scatterbloom keeps a 14-18x3-5px FAR chassis; wake and RAPID ticks stay sub-body');

const provenance = JSON.parse(read('assets/generated/projectiles/projectile-scatterbloom-flechette-provenance-v1.json'));
// Scatterbloom's provenance remains a truthful record of the v1 five-cell
// packing operation. The v2 check above independently proves that exact cell
// survived unchanged when the sixth ground-fire column was appended.
const atlasSha = createHash('sha256').update(readFileSync(join(root,
  'assets/generated/projectiles/projectile-chassis-atlas-v1.png'))).digest('hex');
const farPxPerTile = ((7 / CONFIG.viewScales.far.depthMult) / 100) * 800 /
  CONFIG.player.height;
const scatterArtLength = 0.36 + 0.55;
const PROJECTED_SCATTER_FAR = {
  width: scatterArtLength * farPxPerTile,
  height: scatterArtLength / (230 / 256) * (scatterBounds.height / 256) *
    0.90 * 1.24 * farPxPerTile,
};
ok(provenance.promptSummary.verbatim === false &&
   provenance.selection.index === 15 &&
   provenance.packing.atlasSha256 === atlasSha &&
   PROJECTED_SCATTER_FAR.width >= 14 && PROJECTED_SCATTER_FAR.width <= 18 &&
   PROJECTED_SCATTER_FAR.height >= 3 && PROJECTED_SCATTER_FAR.height <= 5,
  'provenance is honest and decoded FAR projection lands inside the 14-18x3-5px target');

console.log(`PROJECTILE PRESENTATION: ${passed}/${passed} contracts passed`);
