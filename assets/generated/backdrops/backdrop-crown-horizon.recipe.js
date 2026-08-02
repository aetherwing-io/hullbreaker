export const meta = {
  id: 'backdrop-crown-horizon',
  size: { w: 1024, h: 256 },
  seed: 161447,
  roles: ['deep-teal', 'haze', 'ink', 'hot-magenta'],
};

export function render(ctx, env) {
  const W = env.width;
  const H = env.height;

  const tealAnchor = env.PALETTE['deep-teal'];
  const hazeAnchor = env.PALETTE.haze;
  const inkAnchor = env.PALETTE.ink;
  const magentaAnchor = env.PALETTE['hot-magenta'];

  const tealDeep = env.shade(tealAnchor, -0.54);
  const tealDark = env.shade(tealAnchor, -0.42);
  const tealMid = env.shade(tealAnchor, -0.25);
  const tealSoft = env.shade(tealAnchor, -0.08);
  const hazeDark = env.shade(hazeAnchor, -0.22);
  const hazeMid = env.shade(hazeAnchor, -0.06);
  const hazeLight = env.shade(hazeAnchor, 0.08);
  const inkDeep = env.shade(inkAnchor, -0.18);
  const inkSoft = env.shade(inkAnchor, 0.08);
  const magentaCore = env.shade(magentaAnchor, 0);
  const magentaBloom = env.shade(magentaAnchor, 0.08);

  const geom = env.stream('crown-geometry');
  const texture = env.stream('crown-striation');
  const wear = env.stream('crown-wear');

  const foundation = [];
  let fx = 148;
  let lastFoundationY = 220;

  while (fx < 876) {
    const center = Math.max(0, 1 - Math.abs(fx - W * 0.5) / 382);
    const nextY = Math.round(
      (216 - 30 * Math.pow(center, 1.25) + (geom() - 0.5) * 9) / 4
    ) * 4;
    foundation.push({ x: fx, y: lastFoundationY });
    foundation.push({ x: fx, y: nextY });

    const run = 10 + Math.floor(geom() * 16);
    fx = Math.min(876, fx + run);
    foundation.push({ x: fx, y: nextY });
    lastFoundationY = nextY;
  }

  function foundationTopAt(x) {
    const center = Math.max(0, 1 - Math.abs(x - W * 0.5) / 382);
    return 216 - 30 * Math.pow(center, 1.25);
  }

  function makeTower(x, width, top, base, major, accent) {
    const ledges = [];
    const count = major ? 4 : 2 + Math.floor(geom() * 2);
    const usable = Math.max(24, base - top - 30);

    for (let i = 0; i < count; i++) {
      ledges.push(
        top + 21 + (i + 1) * usable / (count + 1) + (geom() - 0.5) * 4
      );
    }

    return { x, width, top, base, major, accent, ledges };
  }

  const towers = [];
  let tx = 172;

  while (tx < 858) {
    const center = Math.max(0, 1 - Math.abs(tx - W * 0.5) / 370);
    const width = 12 + Math.floor(geom() * 13 + center * 8);
    const top = 194 - 65 * center - 17 * center * center + (geom() - 0.5) * 17;
    const base = 238 + Math.floor(geom() * 9);

    towers.push(makeTower(tx, width, top, base, false, false));
    tx += 15 + geom() * 17;
  }

  const majorSpecs = [
    [512, 42, 91, 245, true],
    [476, 32, 105, 243, true],
    [550, 34, 102, 244, true],
    [438, 30, 118, 242, true],
    [589, 29, 116, 243, true],
    [404, 25, 132, 241, false],
    [624, 26, 130, 242, false],
  ];

  for (const [x, width, top, base, accent] of majorSpecs) {
    towers.push(makeTower(x, width, top, base, true, accent));
  }

  towers.sort((a, b) => a.x - b.x);

  const buttresses = [];

  for (let i = 1; i < towers.length; i += 3) {
    const tower = towers[i];
    const dir = i % 2 === 0 ? -1 : 1;
    const upperY = tower.top + 45 + geom() * 22;
    const upperX = tower.x + dir * tower.width * 0.4;
    const outerX = tower.x + dir * (tower.width * 1.45 + 14 + geom() * 12);
    const outerY = Math.min(tower.base - 13, upperY + 21 + geom() * 18);

    buttresses.push([
      { x: upperX, y: upperY },
      { x: outerX, y: outerY },
      { x: outerX + dir * 8, y: outerY + 8 },
      { x: tower.x + dir * (tower.width * 0.78 + 8), y: tower.base },
      { x: tower.x + dir * tower.width * 0.24, y: tower.base },
    ]);
  }

  const bridges = [
    { x1: 397, x2: 632, y: 157, h: 5 },
    { x1: 366, x2: 660, y: 181, h: 6 },
    { x1: 326, x2: 704, y: 204, h: 6 },
  ];

  const hazeRgb = env.hexToRgb(hazeMid);

  env.field((x, y) => {
    if (x < 112 || x > 912 || y < 156) return null;

    const horizontal = Math.max(0, 1 - Math.abs(x - W * 0.5) / 426);
    if (horizontal <= 0) return null;

    const baseNoise = env.noise(x, 0, {
      period: 173,
      seed: meta.seed + 29,
    });
    const baseY = 231 + (baseNoise - 0.5) * 8;
    const vertical = y < baseY
      ? Math.exp(-(baseY - y) / 30)
      : Math.exp(-(y - baseY) / 18);

    const grain = env.fbm(x, y, {
      octaves: 3,
      gain: 0.52,
      lacunarity: 2,
      period: 187,
      seed: meta.seed + 71,
    });

    const halo = Math.pow(horizontal, 0.72) * vertical * (0.66 + grain * 0.34);
    const alpha = Math.round(15 * halo);

    if (alpha < 1) return null;
    return [hazeRgb.r, hazeRgb.g, hazeRgb.b, alpha];
  }, { blend: 'over' });

  function traceTower(tower) {
    const x = tower.x;
    const w = tower.width;
    const top = tower.top;
    const base = tower.base;
    const height = base - top;
    const lowerShoulder = top + Math.min(42, height * 0.48);
    const upperShoulder = top + Math.min(23, height * 0.28);
    const neck = top + Math.min(11, height * 0.14);

    ctx.moveTo(x - w * 0.62, base);
    ctx.lineTo(x - w * 0.58, lowerShoulder);
    ctx.lineTo(x - w * 0.44, lowerShoulder);
    ctx.lineTo(x - w * 0.44, upperShoulder);
    ctx.lineTo(x - w * 0.29, upperShoulder);
    ctx.lineTo(x - w * 0.21, neck);
    ctx.lineTo(x - w * 0.10, neck);
    ctx.lineTo(x - w * 0.045, top + 5);
    ctx.lineTo(x, top);
    ctx.lineTo(x + w * 0.045, top + 5);
    ctx.lineTo(x + w * 0.10, neck);
    ctx.lineTo(x + w * 0.21, neck);
    ctx.lineTo(x + w * 0.29, upperShoulder);
    ctx.lineTo(x + w * 0.44, upperShoulder);
    ctx.lineTo(x + w * 0.44, lowerShoulder);
    ctx.lineTo(x + w * 0.58, lowerShoulder);
    ctx.lineTo(x + w * 0.62, base);
    ctx.closePath();

    for (let i = 0; i < tower.ledges.length; i++) {
      const y = tower.ledges[i];
      const extension = i % 2 === 0 ? 0.74 : 0.66;
      ctx.rect(
        x - w * extension,
        y,
        w * extension * 2,
        3 + (i % 2)
      );
    }
  }

  ctx.save();
  ctx.beginPath();

  ctx.moveTo(foundation[0].x, 247);
  ctx.lineTo(foundation[0].x, foundation[0].y);
  for (const point of foundation) ctx.lineTo(point.x, point.y);
  ctx.lineTo(foundation[foundation.length - 1].x, 247);
  ctx.closePath();

  for (const tower of towers) traceTower(tower);

  for (const buttress of buttresses) {
    ctx.moveTo(buttress[0].x, buttress[0].y);
    for (let i = 1; i < buttress.length; i++) {
      ctx.lineTo(buttress[i].x, buttress[i].y);
    }
    ctx.closePath();
  }

  for (const bridge of bridges) {
    ctx.rect(bridge.x1, bridge.y, bridge.x2 - bridge.x1, bridge.h);
    ctx.moveTo(bridge.x1 + 18, bridge.y + bridge.h);
    ctx.lineTo(bridge.x1 + 34, bridge.y + bridge.h + 12);
    ctx.lineTo(bridge.x2 - 31, bridge.y + bridge.h + 12);
    ctx.lineTo(bridge.x2 - 17, bridge.y + bridge.h);
    ctx.closePath();
  }

  ctx.fillStyle = env.rgba(tealDeep, 0.335);
  ctx.shadowColor = env.rgba(tealDark, 0.048);
  ctx.shadowBlur = 5;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;
  ctx.fill();

  ctx.shadowColor = env.rgba(tealDark, 0);
  ctx.shadowBlur = 0;

  ctx.save();
  ctx.clip();
  ctx.globalCompositeOperation = 'source-atop';

  const lightSweep = ctx.createLinearGradient(175, 92, 850, 246);
  lightSweep.addColorStop(0, env.rgba(tealSoft, 0.19));
  lightSweep.addColorStop(0.48, env.rgba(tealMid, 0.065));
  lightSweep.addColorStop(1, env.rgba(inkSoft, 0.13));
  ctx.fillStyle = lightSweep;
  ctx.fillRect(120, 84, 790, 170);

  const baseFog = ctx.createLinearGradient(0, 174, 0, 255);
  baseFog.addColorStop(0, env.rgba(hazeDark, 0));
  baseFog.addColorStop(0.62, env.rgba(hazeMid, 0.075));
  baseFog.addColorStop(1, env.rgba(hazeLight, 0.17));
  ctx.fillStyle = baseFog;
  ctx.fillRect(120, 172, 790, 84);

  for (let i = 0; i < 88; i++) {
    const x = 145 + texture() * 744;
    const y = 93 + texture() * 116;
    const width = 2 + texture() * 5;
    const height = 34 + texture() * 105;
    const selector = texture();
    const color = selector < 0.48
      ? tealSoft
      : selector < 0.76
        ? tealDeep
        : hazeDark;
    const alpha = 0.014 + texture() * 0.034;
    const streak = ctx.createLinearGradient(x, y, x, y + height);

    streak.addColorStop(0, env.rgba(color, 0));
    streak.addColorStop(0.22, env.rgba(color, alpha));
    streak.addColorStop(0.76, env.rgba(color, alpha * 0.72));
    streak.addColorStop(1, env.rgba(color, 0));

    ctx.fillStyle = streak;
    ctx.fillRect(x, y, width, height);
  }

  for (const tower of towers) {
    const x = tower.x;
    const w = tower.width;
    const top = tower.top;
    const base = tower.base;

    ctx.beginPath();
    ctx.moveTo(x - w * 0.48, top + 19);
    ctx.lineTo(x - w * 0.08, top + 9);
    ctx.lineTo(x - w * 0.08, base);
    ctx.lineTo(x - w * 0.48, base);
    ctx.closePath();
    ctx.fillStyle = env.rgba(tealSoft, 0.075);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x + w * 0.08, top + 9);
    ctx.lineTo(x + w * 0.48, top + 19);
    ctx.lineTo(x + w * 0.48, base);
    ctx.lineTo(x + w * 0.08, base);
    ctx.closePath();
    ctx.fillStyle = env.rgba(inkDeep, 0.055);
    ctx.fill();

    const stripeCount = tower.major ? 4 : 2;
    for (let i = 0; i < stripeCount; i++) {
      const q = (i + 1) / (stripeCount + 1);
      const sx = x - w * 0.35 + q * w * 0.7;

      ctx.beginPath();
      ctx.moveTo(sx - 2.2, top + 15);
      ctx.lineTo(sx - 2.2, base);
      ctx.strokeStyle = env.rgba(tealSoft, 0.12);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(sx, top + 15);
      ctx.lineTo(sx, base);
      ctx.strokeStyle = env.rgba(inkDeep, 0.18);
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    for (const y of tower.ledges) {
      ctx.beginPath();
      ctx.moveTo(x - w * 0.72, y);
      ctx.lineTo(x + w * 0.72, y);
      ctx.strokeStyle = env.rgba(tealSoft, 0.24);
      ctx.lineWidth = 1.6;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x - w * 0.72, y + 3);
      ctx.lineTo(x + w * 0.72, y + 3);
      ctx.strokeStyle = env.rgba(inkDeep, 0.34);
      ctx.lineWidth = 2.6;
      ctx.stroke();

      if (wear() < 0.78) {
        const wx = x - w * 0.45 + wear() * w * 0.9;
        const length = 9 + wear() * 25;
        const bleed = ctx.createLinearGradient(wx, y + 3, wx, y + 3 + length);
        bleed.addColorStop(0, env.rgba(inkSoft, 0.14));
        bleed.addColorStop(1, env.rgba(inkSoft, 0));
        ctx.fillStyle = bleed;
        ctx.fillRect(wx, y + 3, 2 + wear() * 2, length);
      }

      if (wear() < 0.55) {
        const chipX = x - w * 0.52 + wear() * w * 1.04;
        ctx.beginPath();
        ctx.moveTo(chipX, y - 1);
        ctx.lineTo(chipX + 3 + wear() * 5, y - 3);
        ctx.strokeStyle = env.rgba(hazeLight, 0.2);
        ctx.lineWidth = 1.7;
        ctx.stroke();
      }
    }
  }

  for (const buttress of buttresses) {
    ctx.beginPath();
    ctx.moveTo(buttress[0].x, buttress[0].y);
    for (let i = 1; i < buttress.length; i++) {
      ctx.lineTo(buttress[i].x, buttress[i].y);
    }
    ctx.closePath();
    ctx.fillStyle = env.rgba(tealMid, 0.09);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(buttress[0].x, buttress[0].y);
    ctx.lineTo(buttress[1].x, buttress[1].y);
    ctx.lineTo(buttress[2].x, buttress[2].y);
    ctx.strokeStyle = env.rgba(tealSoft, 0.2);
    ctx.lineWidth = 1.7;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(buttress[2].x, buttress[2].y);
    ctx.lineTo(buttress[3].x, buttress[3].y);
    ctx.lineTo(buttress[4].x, buttress[4].y);
    ctx.strokeStyle = env.rgba(inkDeep, 0.29);
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }

  let panelX = 154;
  while (panelX < 872) {
    const panelWidth = 18 + texture() * 30;
    const panelTop = foundationTopAt(panelX) - 3;

    ctx.fillStyle = env.rgba(
      texture() < 0.5 ? tealMid : hazeDark,
      0.035 + texture() * 0.03
    );
    ctx.fillRect(panelX, panelTop, panelWidth, 251 - panelTop);

    ctx.beginPath();
    ctx.moveTo(panelX + 1.5, panelTop);
    ctx.lineTo(panelX + 1.5, 249);
    ctx.strokeStyle = env.rgba(tealSoft, 0.14);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(panelX + panelWidth, panelTop);
    ctx.lineTo(panelX + panelWidth, 249);
    ctx.strokeStyle = env.rgba(inkDeep, 0.28);
    ctx.lineWidth = 2.3;
    ctx.stroke();

    panelX += panelWidth;
  }

  for (const y of [204, 220, 236]) {
    let x = 158 + texture() * 17;

    while (x < 864) {
      const length = 24 + texture() * 52;

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(Math.min(866, x + length), y);
      ctx.strokeStyle = env.rgba(tealSoft, 0.18);
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x, y + 3);
      ctx.lineTo(Math.min(866, x + length), y + 3);
      ctx.strokeStyle = env.rgba(inkDeep, 0.31);
      ctx.lineWidth = 2.7;
      ctx.stroke();

      x += length + 7 + texture() * 17;
    }
  }

  for (const bridge of bridges) {
    ctx.beginPath();
    ctx.moveTo(bridge.x1, bridge.y);
    ctx.lineTo(bridge.x2, bridge.y);
    ctx.strokeStyle = env.rgba(tealSoft, 0.24);
    ctx.lineWidth = 1.7;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(bridge.x1, bridge.y + bridge.h);
    ctx.lineTo(bridge.x2, bridge.y + bridge.h);
    ctx.strokeStyle = env.rgba(inkDeep, 0.4);
    ctx.lineWidth = 2.8;
    ctx.stroke();
  }

  ctx.restore();
  ctx.restore();

  const accentedTowers = towers.filter((tower) => tower.accent);

  ctx.globalCompositeOperation = 'source-over';

  for (const tower of accentedTowers) {
    const cx = tower.x;
    const cy = tower.top + 5;
    const radius = tower.x === 512 ? 13 : 10;
    const bloom = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);

    bloom.addColorStop(0, env.rgba(magentaBloom, 0.048));
    bloom.addColorStop(0.34, env.rgba(magentaBloom, 0.026));
    bloom.addColorStop(1, env.rgba(magentaBloom, 0));

    ctx.fillStyle = bloom;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  ctx.globalCompositeOperation = 'source-atop';

  for (const tower of accentedTowers) {
    const cx = tower.x;
    const cy = tower.top + 5;

    ctx.beginPath();
    ctx.ellipse(cx, cy, 1.8, 2.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = env.rgba(magentaCore, 1);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(cx, cy + 2);
    ctx.lineTo(cx, cy + 10);
    ctx.strokeStyle = env.rgba(magentaCore, 0.55);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'source-over';

  env.mask((x, y) => {
    if (x <= 132 || x >= 892 || y < 86 || y >= 255) return 0;

    const left = env.smoothstep(env.clamp((x - 132) / 78, 0, 1));
    const right = env.smoothstep(env.clamp((892 - x) / 80, 0, 1));
    const top = env.smoothstep(env.clamp((y - 86) / 16, 0, 1));
    const bottom = y <= 232
      ? 1
      : env.smoothstep(env.clamp((255 - y) / 23, 0, 1));

    let multiplier = left * right * top * bottom;
    if (multiplier <= 0) return 0;

    const dither = env.noise(x, y, {
      period: 19,
      seed: meta.seed + 907,
    });

    multiplier += (dither - 0.5) * (8 / 255);
    return env.clamp(multiplier * 0.94, 0, 0.94);
  });
}
