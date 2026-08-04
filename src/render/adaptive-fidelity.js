import {
  ADAPTIVE_FIDELITY_TUNE, createAdaptiveFidelityController,
} from '../pure/adaptive-fidelity.js';
import { QUERY } from '../mode.js';
import { setAdaptiveShadowMapSize } from './lights.js';
import { setAdaptiveBloomEnabled, syncPostSize } from './post.js';
import { rendererResourceSnapshot, setAdaptiveRenderScale } from './scene.js';

export const ADAPTIVE_FIDELITY_ON = QUERY.get('adaptive') !== '0';
const controller = createAdaptiveFidelityController();
const history = [];

function applyLevel(event) {
  if (event.level === 1) {
    setAdaptiveRenderScale(0.80);
    syncPostSize();
    return 'supersample-0.80';
  }
  if (event.level === 2) {
    setAdaptiveBloomEnabled(false);
    return 'bloom-bypass';
  }
  setAdaptiveShadowMapSize(1024);
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
