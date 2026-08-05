#!/usr/bin/env node
/* Extract two reviewed ImageGen component boards into one runtime atlas.
 *
 * Square source cells are authoring/storage only. Each assembly is keyed,
 * trimmed to native visible bounds, proportionally scaled into a guarded cell,
 * and accompanied by actual atlas bounds, pivot, transform, attachment,
 * response-socket, phase/state and rarity metadata. Runtime planes sample the
 * measured rect—not the padded cell—so no component can become a square card. */

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(new URL('../..', import.meta.url).pathname);
const sourceDir = join(root, 'assets/generated/environment/foreground-pack-sources');
const output = resolve(process.argv[2] ||
  join(root, 'assets/generated/environment/meridian-component-atlas-v1.png'));
const manifestFile = output.replace(/\.png$/i, '.manifest.json');
const edgeProofFile = output.replace(/\.png$/i, '.edge-proof.png');
const moduleFile = join(root, 'src/render/foreground-component-spec.generated.js');
const work = mkdtempSync(join(tmpdir(), 'hullbreaker-component-pack-'));
const CELL = 256;
const INNER = 220;
const GRID = [8, 4];

const statePhase = Object.freeze({
  observe: 0, intercept: 1, contain: 2, quarantine: 3, sterilize: 4, scuttle: 5,
});
const part = (id, category, options = {}) => ({
  id, category,
  stretchAxes: options.stretchAxes || [],
  rotations: options.rotations || [0],
  mirrorX: options.mirrorX || false,
  pivot: options.pivot || [0.5, 0.5],
  anchors: options.anchors || [{ name: 'structure', x: 0.5, y: 0.5 }],
  sockets: options.sockets || [],
  depthBand: options.depthBand || 'proud',
  state: options.state || null,
  phaseRange: options.phaseRange || (options.state ? [statePhase[options.state], 5] : [0, 5]),
  rarity: options.rarity ?? 1,
  stateHooks: options.stateHooks || ['dormant'],
  gameplayRole: options.gameplayRole || 'structure-read',
  emissive: false,
});

const SOURCES = [
  {
    id: 'structure', file: 'meridian-components-structure-pixel-v2.png', colOffset: 0,
    keyMode: 'alpha',
    components: [
      part('route-cap-long', 'trim-cap', { stretchAxes: ['x'], rotations: [0, 2],
        anchors: [{ name: 'route-edge', x: 0.5, y: 0.82 }] }),
      part('scute-edge', 'trim-cap', { stretchAxes: ['x'], rotations: [0, 2], mirrorX: true,
        anchors: [{ name: 'scute-edge', x: 0.5, y: 0.78 }] }),
      part('i-girder', 'beam-brace', { stretchAxes: ['x'], rotations: [0, 2],
        anchors: [{ name: 'load-path', x: 0.5, y: 0.5 }] }),
      part('guard-rail', 'ladder-rail', { stretchAxes: ['x'], mirrorX: true,
        pivot: [0.5, 0.82], anchors: [{ name: 'deck-edge', x: 0.5, y: 0.82 }],
        sockets: [{ kind: 'traversal', x: 0.5, y: 0.82 }] }),
      part('diagonal-brace', 'beam-brace', { stretchAxes: ['x'], rotations: [0, 2], mirrorX: true,
        anchors: [{ name: 'bay-corners', x: 0.5, y: 0.5 }] }),
      part('cross-brace', 'beam-brace', { rotations: [0, 1, 2, 3], mirrorX: true,
        anchors: [{ name: 'bay-corners', x: 0.5, y: 0.5 }], rarity: 0.8 }),
      part('ladder-rail', 'ladder-rail', { stretchAxes: ['y'], rotations: [0, 2],
        pivot: [0.5, 0.92], anchors: [{ name: 'ladder-base', x: 0.5, y: 0.92 }],
        sockets: [{ kind: 'traversal', x: 0.5, y: 0.5 }] }),
      part('broken-guard', 'ladder-rail', { stretchAxes: ['x'], rotations: [0, 2], mirrorX: true,
        pivot: [0.5, 0.82], anchors: [{ name: 'deck-edge', x: 0.5, y: 0.82 }] }),
      part('pressure-pipe', 'pipe-conduit', { stretchAxes: ['x'], rotations: [0, 1, 2, 3],
        sockets: [{ kind: 'pressure', x: 0.5, y: 0.5 }] }),
      part('pipe-elbow', 'pipe-conduit', { rotations: [0, 1, 2, 3], mirrorX: true,
        sockets: [{ kind: 'pressure', x: 0.28, y: 0.72 }, { kind: 'pressure', x: 0.72, y: 0.28 }] }),
      part('conduit-tee', 'pipe-conduit', { rotations: [0, 1, 2, 3],
        sockets: [{ kind: 'power', x: 0.5, y: 0.5 }, { kind: 'defense', x: 0.5, y: 0.15 }] }),
      part('cable-bundle', 'pipe-conduit', { stretchAxes: ['x'], rotations: [0, 2], mirrorX: true,
        sockets: [{ kind: 'power', x: 0.5, y: 0.5 }] }),
      part('keel-fin', 'near-silhouette', { rotations: [0, 2], mirrorX: true,
        pivot: [0.5, 0.94], depthBand: 'near', rarity: 0.7 }),
      part('armor-shoulder', 'near-silhouette', { rotations: [0, 2], mirrorX: true,
        pivot: [0.5, 0.92], depthBand: 'near' }),
      part('vent-hood', 'service-organ', { mirrorX: true, depthBand: 'near',
        sockets: [{ kind: 'vent', x: 0.5, y: 0.56 }], gameplayRole: 'purge-origin' }),
      part('sheared-scute', 'scuttle-damage', { rotations: [0, 2], mirrorX: true,
        state: 'scuttle', phaseRange: [5, 5], stateHooks: ['active', 'spent', 'damaged'],
        sockets: [{ kind: 'rupture', x: 0.72, y: 0.54 }], gameplayRole: 'route-damage-read' }),
    ],
  },
  {
    id: 'defense', file: 'meridian-components-defense-chroma-v1.png', colOffset: 4,
    keyMode: 'green',
    components: [
      part('observe-sensor-hood', 'defense-state', { state: 'observe', mirrorX: true,
        sockets: [{ kind: 'spawn', x: 0.5, y: 0.56 }], stateHooks: ['dormant', 'armed'],
        gameplayRole: 'defense-wake-tell' }),
      part('observe-shutter-blade', 'defense-state', { state: 'observe', stretchAxes: ['x'],
        rotations: [0, 2], mirrorX: true, sockets: [{ kind: 'interlock', x: 0.14, y: 0.5 }],
        stateHooks: ['dormant', 'armed'], gameplayRole: 'defense-wake-tell' }),
      part('observe-scan-iris', 'defense-state', { state: 'observe', rotations: [0],
        sockets: [{ kind: 'spawn', x: 0.5, y: 0.5 }], stateHooks: ['dormant', 'armed'],
        gameplayRole: 'defense-wake-tell' }),
      part('observe-wake-relay', 'defense-state', { state: 'observe', mirrorX: true,
        sockets: [{ kind: 'spawn', x: 0.5, y: 0.68 }], stateHooks: ['dormant', 'armed'],
        gameplayRole: 'defense-wake-tell' }),
      part('intercept-route-clamp', 'defense-state', { state: 'intercept', mirrorX: true,
        sockets: [{ kind: 'clamp', x: 0.5, y: 0.5 }], stateHooks: ['dormant', 'armed', 'active'],
        gameplayRole: 'route-clamp-tell' }),
      part('intercept-lock-rail', 'defense-state', { state: 'intercept', stretchAxes: ['x'],
        rotations: [0, 2], sockets: [{ kind: 'interlock', x: 0.5, y: 0.5 }],
        stateHooks: ['dormant', 'armed', 'active'], gameplayRole: 'route-lock-tell' }),
      part('contain-pressure-brace', 'defense-state', { state: 'contain', rotations: [0, 1, 2, 3],
        mirrorX: true, sockets: [{ kind: 'interlock', x: 0.5, y: 0.5 }],
        stateHooks: ['dormant', 'armed', 'active'], gameplayRole: 'containment-tell' }),
      part('contain-defense-socket', 'defense-state', { state: 'contain', rotations: [0],
        sockets: [{ kind: 'defense', x: 0.5, y: 0.5 }],
        stateHooks: ['dormant', 'armed', 'active'], gameplayRole: 'defense-deploy-origin' }),
      part('quarantine-bulkhead-seal', 'defense-state', { state: 'quarantine', stretchAxes: ['x'],
        rotations: [0, 2], mirrorX: true, sockets: [{ kind: 'interlock', x: 0.5, y: 0.5 }],
        stateHooks: ['dormant', 'armed', 'active'], gameplayRole: 'bulkhead-seal-tell' }),
      part('quarantine-denial-teeth', 'defense-state', { state: 'quarantine', stretchAxes: ['x'],
        rotations: [0, 2], sockets: [{ kind: 'clamp', x: 0.5, y: 0.34 }],
        stateHooks: ['dormant', 'armed', 'active'], gameplayRole: 'landing-denial-tell' }),
      part('quarantine-purge-nozzle', 'defense-state', { state: 'quarantine', mirrorX: true,
        sockets: [{ kind: 'vent', x: 0.24, y: 0.5 }], stateHooks: ['dormant', 'armed', 'active'],
        gameplayRole: 'purge-tell' }),
      part('sterilize-power-junction', 'defense-state', { state: 'sterilize', rotations: [0, 1, 2, 3],
        sockets: [{ kind: 'defense', x: 0.5, y: 0.5 }], stateHooks: ['dormant', 'armed', 'active'],
        gameplayRole: 'kill-lattice-tell' }),
      part('scuttle-overdriven-clamp', 'scuttle-damage', { state: 'scuttle', rotations: [0, 2],
        mirrorX: true, sockets: [{ kind: 'clamp', x: 0.5, y: 0.5 }],
        stateHooks: ['armed', 'active', 'spent', 'damaged'], gameplayRole: 'self-damage-tell' }),
      part('scuttle-exposed-ribs', 'scuttle-damage', { state: 'scuttle', rotations: [0, 2],
        mirrorX: true, sockets: [{ kind: 'rupture', x: 0.72, y: 0.55 }],
        stateHooks: ['active', 'spent', 'damaged'], gameplayRole: 'route-damage-read' }),
      part('scuttle-severed-conduit', 'scuttle-damage', { state: 'scuttle', rotations: [0, 1, 2, 3],
        mirrorX: true, sockets: [{ kind: 'rupture', x: 0.5, y: 0.5 }],
        stateHooks: ['active', 'spent', 'damaged'], gameplayRole: 'excision-read' }),
      part('scuttle-spent-purge-ring', 'scuttle-damage', { state: 'scuttle', rotations: [0],
        sockets: [{ kind: 'rupture', x: 0.5, y: 0.5 }],
        stateHooks: ['active', 'spent', 'damaged'], gameplayRole: 'spent-response-read' }),
    ],
  },
];

function magick(args) {
  const result = spawnSync('magick', args, { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout ||
    `magick ${args[0]} failed with ${result.status}`);
  return result.stdout;
}

function dimensions(file) {
  const [width, height] = magick(['identify', '-format', '%w %h', file])
    .trim().split(/\s+/).map(Number);
  return { width, height };
}

function box(text) {
  const match = text.trim().match(/(\d+)x(\d+)\+(\d+)\+(\d+)/);
  if (!match) throw new Error(`could not parse trim box: ${text}`);
  return { x: +match[3], y: +match[4], w: +match[1], h: +match[2] };
}

function sourceAssemblies(file, width, height) {
  const verbose = magick([
    file, '-alpha', 'extract', '-threshold', '8%',
    '-define', 'connected-components:verbose=true',
    '-connected-components', '8', 'null:',
  ]);
  const found = [];
  for (const line of verbose.split('\n')) {
    const match = line.match(
      /^\s*\d+:\s+(\d+)x(\d+)\+(\d+)\+(\d+)\s+([\d.]+),([\d.]+)\s+([\deE+.-]+)\s+srgb\(255,255,255\)/,
    );
    if (!match || Number(match[7]) < 5000) continue;
    const component = {
      x: +match[3], y: +match[4], w: +match[1], h: +match[2],
      cx: +match[5], cy: +match[6], area: +match[7],
    };
    const col = Math.max(0, Math.min(3, Math.floor(component.cx / width * 4)));
    const row = Math.max(0, Math.min(3, Math.floor(component.cy / height * 4)));
    component.local = row * 4 + col;
    found.push(component);
  }
  // Broken rails, open clamp jaws and sheared armour can be authored as two
  // deliberately separated silhouettes inside one storage cell. Treat the
  // cell—not connected-component count—as the extraction unit, then union its
  // islands into one guarded native crop. This keeps the negative space that
  // makes a broken component readable at gameplay scale without permitting an
  // island to leak across a neighboring cell.
  const byCell = new Map();
  for (const entry of found) {
    if (!byCell.has(entry.local)) byCell.set(entry.local, []);
    byCell.get(entry.local).push(entry);
  }
  if (byCell.size !== 16)
    throw new Error(`${file}: expected visible machinery in every cell, got ` +
      JSON.stringify([...byCell].map(([local, entries]) => ({
        local, parts: entries.length, area: entries.reduce((sum, row) => sum + row.area, 0),
      }))));
  const assemblies = new Map();
  for (let local = 0; local < 16; local++) {
    const entries = byCell.get(local) || [];
    if (!entries.length || entries.length > 4)
      throw new Error(`${file}: cell ${local} has ${entries.length} extraction islands`);
    const x = Math.min(...entries.map((entry) => entry.x));
    const y = Math.min(...entries.map((entry) => entry.y));
    const right = Math.max(...entries.map((entry) => entry.x + entry.w));
    const bottom = Math.max(...entries.map((entry) => entry.y + entry.h));
    assemblies.set(local, {
      local, x, y, w: right - x, h: bottom - y,
      cx: (x + right) / 2, cy: (y + bottom) / 2,
      area: entries.reduce((sum, entry) => sum + entry.area, 0),
      connectedParts: entries.length,
    });
  }
  return assemblies;
}

try {
  mkdirSync(dirname(output), { recursive: true });
  const cells = new Array(GRID[0] * GRID[1]);
  const sourceStats = [];

  for (const source of SOURCES) {
    const sourceFile = join(sourceDir, source.file);
    const size = dimensions(sourceFile);
    if (size.width !== size.height || size.width < 1024)
      throw new Error(`${source.file}: expected square >=1024px, got ${size.width}x${size.height}`);
    const keyed = join(work, `${source.id}-keyed.png`);
    if (source.keyMode === 'alpha') {
      // Pixel-native boards arrive from the shared ImageGen key-removal tool
      // with a hard, reviewed alpha contour. Preserve their authored teal and
      // copper palette instead of running the old green-dominance heuristic,
      // which necessarily mistakes legitimate teal clusters for key spill.
      magick([
        sourceFile, '-alpha', 'set',
        '-channel', 'RGB', '-fx', 'a<0.02?0:u', '+channel', `PNG32:${keyed}`,
      ]);
    } else {
      // Dominance-derived alpha tolerates ImageGen's green gradient; partial
      // edge pixels have green spill clamped toward their non-green channels.
      magick([
        sourceFile, '-alpha', 'set', '-channel', 'A',
        '-fx', 'max(0,min(1,(0.588235-(g-max(r,b)))/0.490196))', '+channel',
        '-channel', 'G', '-fx', 'min(g,max(r,b)*1.035)', '+channel',
        '-channel', 'RGB', '-fx', 'a<0.02?0:u', '+channel', `PNG32:${keyed}`,
      ]);
    }
    const assemblies = sourceAssemblies(keyed, size.width, size.height);
    for (let local = 0; local < 16; local++) {
      const sourceCol = local % 4;
      const sourceRow = Math.floor(local / 4);
      const assembly = assemblies.get(local);
      const pad = 6;
      const sourceRect = {
        x: Math.max(0, assembly.x - pad),
        y: Math.max(0, assembly.y - pad),
        w: Math.min(size.width, assembly.x + assembly.w + pad) - Math.max(0, assembly.x - pad),
        h: Math.min(size.height, assembly.y + assembly.h + pad) - Math.max(0, assembly.y - pad),
      };
      const nativeText = magick([
        keyed, '-crop', `${sourceRect.w}x${sourceRect.h}+${sourceRect.x}+${sourceRect.y}`,
        '+repage', '-format', '%@', 'info:',
      ]);
      const nativeBounds = box(nativeText);
      const atlasCol = source.colOffset + sourceCol;
      const atlasRow = sourceRow;
      const cellIndex = atlasRow * GRID[0] + atlasCol;
      const cellFile = join(work, `cell-${String(cellIndex).padStart(2, '0')}.png`);
      const finishColor = source.keyMode === 'green' ? [
        // Resampling can reintroduce a one-byte green excess from neighboring
        // matte samples. Pixel-alpha sources deliberately keep their authored
        // teal instead of entering this branch.
        '-channel', 'G', '-fx', 'min(g,max(r,b))', '+channel',
      ] : [];
      magick([
        keyed, '-crop', `${sourceRect.w}x${sourceRect.h}+${sourceRect.x}+${sourceRect.y}`,
        '+repage',
        // Discard the chroma-mixed contour at source resolution, then let the
        // proportional Lanczos downsample rebuild a clean antialiased edge out
        // of opaque hull color plus transparent black. One source pixel is
        // <0.4 output pixels and does not alter the authored silhouette.
        '-channel', 'A', '-threshold', '35%', '-morphology', 'Erode', 'Diamond:1', '+channel',
        '-channel', 'RGB', '-fx', 'a<0.01?0:u', '+channel',
        '-trim', '+repage', '-filter', 'Lanczos', '-resize', `${INNER}x${INNER}`,
        ...finishColor,
        '-channel', 'RGB', '-fx', 'a<0.01?0:u', '+channel',
        '-gravity', 'center', '-background', 'none', '-extent', `${CELL}x${CELL}`,
        `PNG32:${cellFile}`,
      ]);
      const localVisible = box(magick([cellFile, '-format', '%@', 'info:']));
      const guard = {
        left: localVisible.x, top: localVisible.y,
        right: CELL - localVisible.x - localVisible.w,
        bottom: CELL - localVisible.y - localVisible.h,
      };
      if (Math.min(...Object.values(guard)) < 16)
        throw new Error(`${source.id}/${source.components[local].id}: guard ${JSON.stringify(guard)}`);
      const spec = source.components[local];
      const globalVisible = {
        x: atlasCol * CELL + localVisible.x,
        y: atlasRow * CELL + localVisible.y,
        w: localVisible.w, h: localVisible.h,
      };
      cells[cellIndex] = {
        ...spec, source: source.id, sourceCell: local,
        sourceRect, sourceConnectedArea: assembly.area,
        sourceConnectedParts: assembly.connectedParts, nativeBounds,
        nativeAspect: Math.round(nativeBounds.w / nativeBounds.h * 10000) / 10000,
        atlasCell: { index: cellIndex, col: atlasCol, row: atlasRow },
        visibleRect: globalVisible,
        uvRect: [
          globalVisible.x / (GRID[0] * CELL),
          globalVisible.y / (GRID[1] * CELL),
          (globalVisible.x + globalVisible.w) / (GRID[0] * CELL),
          (globalVisible.y + globalVisible.h) / (GRID[1] * CELL),
        ],
        guard,
      };
    }
    sourceStats.push({ id: source.id, file: source.file, keyMode: source.keyMode, ...size,
      approvedComponents: 16, rejectedComponents: [] });
  }

  const rowFiles = [];
  for (let row = 0; row < GRID[1]; row++) {
    const rowFile = join(work, `row-${row}.png`);
    const args = [];
    for (let col = 0; col < GRID[0]; col++)
      args.push(join(work, `cell-${String(row * GRID[0] + col).padStart(2, '0')}.png`));
    args.push('+append', `PNG32:${rowFile}`);
    magick(args);
    rowFiles.push(rowFile);
  }
  magick([...rowFiles, '-append', '+repage', '-define', 'png:compression-level=9', `PNG32:${output}`]);

  const packed = dimensions(output);
  if (packed.width !== 2048 || packed.height !== 1024)
    throw new Error(`component atlas must be 2048x1024, got ${packed.width}x${packed.height}`);
  const alphaMean = Number(magick([
    output, '-channel', 'A', '-separate', '-format', '%[fx:mean]', 'info:',
  ]).trim());
  // Only the legacy defense board is green-keyed. Measuring the pixel-native
  // structure half as "green spill" would reject its intentional oxidized
  // teal palette, so chroma proofs operate on the defense half alone.
  const greenProof = `${CELL * 4}x${CELL * 4}+${CELL * 4}+0`;
  const greenRemnant = Number(magick([
    output, '-crop', greenProof, '+repage',
    '-fx', '(a>0.01 && g>max(r,b)*1.08 && g>0.18)?1:0',
    '-alpha', 'off', '-format', '%[fx:mean]', 'info:',
  ]).trim());
  // Lanczos minification deliberately blends a few opaque teal edge pixels
  // with transparent neighbors. Track that separate stress proof without
  // misreporting it as full-resolution chroma residue.
  const minifiedGreenRemnant = Number(magick([
    output, '-crop', greenProof, '+repage', '-resize', '512x512!',
    '-fx', '(a>0.01 && g>max(r,b)*1.08 && g>0.18)?1:0',
    '-alpha', 'off', '-format', '%[fx:mean]', 'info:',
  ]).trim());
  const edgeGreenRemnant = Number(magick([
    output, '-crop', greenProof, '+repage',
    '-fx', '(a>0.01 && a<0.99 && g>max(r,b)*1.04 && g>0.12)?1:0',
    '-alpha', 'off', '-format', '%[fx:mean]', 'info:',
  ]).trim());
  if (!(alphaMean > 0.12 && alphaMean < 0.58))
    throw new Error(`implausible component alpha coverage ${alphaMean}`);
  if (greenRemnant > 0.0003)
    throw new Error(`green-key remnant ${greenRemnant} exceeds 0.0003`);
  if (minifiedGreenRemnant > 0.0003)
    throw new Error(`minified green-key remnant ${minifiedGreenRemnant} exceeds 0.0003`);
  if (edgeGreenRemnant > 0.00002)
    throw new Error(`green alpha-edge remnant ${edgeGreenRemnant} exceeds 0.00002`);

  // 1:1 contour proof: eight stress cells (thin rail, lens, pipe, magenta
  // junction, silhouette and two torn states) over black, cold hull and warm
  // metal. This is review output only; runtime never requests it.
  const stressCells = [0, 3, 6, 16, 23, 24, 29, 30];
  const proofRows = [];
  for (const [index, background] of ['#050809', '#15313a', '#6b3d24'].entries()) {
    const cards = [];
    for (const cellIndex of stressCells) {
      const col = cellIndex % GRID[0];
      const row = Math.floor(cellIndex / GRID[0]);
      const card = join(work, `proof-${index}-${cellIndex}.png`);
      magick([
        '-size', `${CELL}x${CELL}`, `xc:${background}`,
        '(', output, '-crop', `${CELL}x${CELL}+${col * CELL}+${row * CELL}`, '+repage', ')',
        '-compose', 'over', '-composite', `PNG24:${card}`,
      ]);
      cards.push(card);
    }
    const proofRow = join(work, `proof-row-${index}.png`);
    magick([...cards, '+append', `PNG24:${proofRow}`]);
    proofRows.push(proofRow);
  }
  magick([...proofRows, '-append', `PNG24:${edgeProofFile}`]);

  const categories = Object.create(null);
  const sockets = Object.create(null);
  for (const entry of cells) {
    categories[entry.category] = (categories[entry.category] || 0) + 1;
    for (const s of entry.sockets) sockets[s.kind] = (sockets[s.kind] || 0) + 1;
  }
  const manifest = {
    version: 1,
    runtime: {
      file: output.slice(root.length + 1), width: 2048, height: 1024,
      grid: GRID, cell: [CELL, CELL], gpuTextures: 1, emissive: false,
      alphaTest: 0.035, minFilter: 'LinearMipmapLinearFilter',
    },
    review: {
      humanApproved: true, approvedComponents: 32, rejectedComponents: 0,
      alphaCoverage: Math.round(alphaMean * 10000) / 10000,
      greenRemnant: Math.round(greenRemnant * 1000000) / 1000000,
      minifiedGreenRemnant: Math.round(minifiedGreenRemnant * 1000000) / 1000000,
      alphaEdgeGreenRemnant: Math.round(edgeGreenRemnant * 1000000) / 1000000,
      edgeProof: edgeProofFile.slice(root.length + 1),
      nativeBoundsMeasured: true, nonUniformStretchRestricted: true,
    },
    categories, sockets, sources: sourceStats, components: cells,
  };
  writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
  const runtimeComponents = cells.map((entry) => ({
    id: entry.id, category: entry.category, renderKind: 'cutout',
    nativeAspect: entry.nativeAspect,
    visibleRect: entry.visibleRect, pivot: entry.pivot,
    stretchAxes: entry.stretchAxes, rotations: entry.rotations,
    mirrorX: entry.mirrorX, anchors: entry.anchors, sockets: entry.sockets,
    depthBand: entry.depthBand, state: entry.state,
    phaseRange: entry.phaseRange, rarity: entry.rarity,
    stateHooks: entry.stateHooks, gameplayRole: entry.gameplayRole,
    emissive: false,
  }));
  const generated = `/* AUTO-GENERATED by tools/assets/pack-foreground-components.mjs.\n` +
    ` * Source cells were chroma-keyed, connected-component extracted, trimmed\n` +
    ` * and padded offline. Edit the source boards/specs or packer, not this file. */\n\n` +
    `export const FOREGROUND_COMPONENT_ATLAS = Object.freeze(${JSON.stringify({
      file: '../../assets/generated/environment/meridian-component-atlas-v1.png',
      canvas: [2048, 1024], gpuTextures: 1, emissive: false, alphaTest: 0.035,
    }, null, 2)});\n\n` +
    `export const FOREGROUND_CUTOUT_COMPONENTS = Object.freeze(` +
    `${JSON.stringify(runtimeComponents, null, 2)}.map((entry) => Object.freeze(entry)));\n`;
  writeFileSync(moduleFile, generated);
  console.log(JSON.stringify({ output, manifest: manifestFile, edgeProof: edgeProofFile,
    module: moduleFile, categories, sockets,
    alphaCoverage: manifest.review.alphaCoverage,
    greenRemnant: manifest.review.greenRemnant,
    minifiedGreenRemnant: manifest.review.minifiedGreenRemnant,
    alphaEdgeGreenRemnant: manifest.review.alphaEdgeGreenRemnant }, null, 2));
} finally {
  rmSync(work, { recursive: true, force: true });
}
