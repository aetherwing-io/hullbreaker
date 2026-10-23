import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
const [vpName] = process.argv.slice(2);
const proof = await import(pathToFileURL(join(new URL('.', import.meta.url).pathname, 'tools/simlab/lib/turn-proof.mjs')).href);
const res = await proof.runTurnProof({ policy: 'run', viewport: proof.VIEWPORTS[vpName], gunnerMode: 'paced', paceMs: 1400, maxTicks: 60 * 900 });
const r = globalThis.__RETIRED || [];
const by = {};
for (const x of r) { const key = `gate${x.k}:${x.kind}${x.gating ? '(gating)' : ''}`; by[key] = (by[key] || 0) + 1; }
console.log(JSON.stringify({ viewport: vpName, endState: res.endState, corners: res.finishedCorners, retiredTotal: r.length, by, sample: r.slice(0, 4) }));
