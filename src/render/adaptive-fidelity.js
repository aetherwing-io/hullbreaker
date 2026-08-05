import {
  ADAPTIVE_FIDELITY_TUNE, createAdaptiveFidelityController,
} from '../pure/adaptive-fidelity.js';
import { QUERY } from '../mode.js';
import { setAdaptiveShadowMapSize } from './lights.js';
import { setAdaptiveBloomEnabled, syncPostSize } from './post.js';
import { rendererResourceSnapshot, setAdaptiveRenderScale } from './scene.js';

// An iGPU is the one environment this machine cannot emulate honestly. Keep
// the controller opt-in until the operator judges the fixed-ratio captures;
// `?adaptive=1` enables the measured ladder without changing shipped art.
export const ADAPTIVE_FIDELITY_ON = QUERY.get('adaptive') === '1';
const controller = createAdaptiveFidelityController();
const history = [];

function applyLevel(event) {
  const scaleChanged = setAdaptiveRenderScale(event.level >= 1 ? 0.80 : 1);
  if (scaleChanged) syncPostSize();
  setAdaptiveBloomEnabled(event.level < 2);
  setAdaptiveShadowMapSize(event.level >= 3 ? 1024 : 2048);
  if (event.level === 0) return 'restore-full';
  if (event.level === 1) return 'supersample-0.80';
  if (event.level === 2) return 'bloom-bypass';
  return 'shadow-1024';
}

export function sampleAdaptiveFidelity(frameMs) {
  if (!ADAPTIVE_FIDELITY_ON) return null;
  const event = controller.sample(frameMs);
  if (!event) return null;
  const applied = Object.freeze({ ...event, action: applyLevel(event) });
  history.push(applied);
  console.info('HULLBREAKER adaptive fidelity ' + JSON.stringify(applied));
  return applied;
}

export function adaptiveFidelitySnapshot() {
  return {
    enabled: ADAPTIVE_FIDELITY_ON,
    tune: { ...ADAPTIVE_FIDELITY_TUNE },
    ...controller.snapshot(),
    history: [...history],
    resources: rendererResourceSnapshot(),
  };
}
