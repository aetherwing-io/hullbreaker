export const meta = {
  id: 'hull-panel-tile',
  size: { w: 128, h: 128 },
  seed: 371232,
  roles: ['rust-orange', 'ink', 'haze', 'hull'],
};

export function render(ctx, env) {
  const W = env.width;
  const H = env.height;
  const TAU = Math.PI * 2;
  const seamX = 74;
  const seamY = 43;
  const gapHalf = 2;

  const rust = env.PALETTE['rust-orange'];
  const ink = env.PALETTE.ink;
  const haze = env.PALETTE.haze;
  const hull = env.PALETTE.hull;

  const metalLow = env.hexToRgb(env.shade(rust, -0.2));
  const metalHigh = env.hexToRgb(env.shade(rust, 0.11));
  const inkRgb = env.hexToRgb(ink);
  const wornRgb = env.hexToRgb(env.shade(hull, 0.1));
  const rustBleedRgb = env.hexToRgb(env.shade(rust, -0.18));
  const dirtRgb = env.hexToRgb(env.mix(ink, rust, 0.24));

  const blotchOpts = {
    octaves: 4,
    gain: 0.52,
    lacunarity: 2,
    period: 4,
    seed: env.seed + 17,
  };
  const grainOpts = {
    period: 24,
    seed: env.seed + 53,
  };
  const streakNoiseOpts = {
    period: 10,
    seed: env.seed + 89,
  };
  const wearOpts = {
    octaves: 3,
    gain: 0.55,
    lacunarity: 2,
    period: 16,
    seed: env.seed + 131,
  };
  const grainOffsets = [-0.07, -0.035, 0, 0.035, 0.07];

  function signedWrapDistance(p, center, size) {
    let d = (p - center) % size;
    if (d < -size * 0.5) d += size;
    if (d >= size * 0.5) d -= size;
    return d;
  }

  function torusDistance(p, center, size) {
    return Math.abs(signedWrapDistance(p, center, size));
  }

  function insideGap(p, center, size) {
    const d = signedWrapDistance(p, center, size);
    return d >= -gapHalf && d < gapHalf;
  }

  function channel(a, b, t) {
    return Math.round(env.lerp(a, b, t));
  }

  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  env.field((x, y, u, v) => {
    const fx = ((x - seamX + W) % W) / W;
    const fy = ((y - seamY + H) % H) / H;

    const broadNoise = env.fbm(u * 4, v * 4, blotchOpts);

    let elongatedNoise = 0;
    for (const offset of grainOffsets) {
      elongatedNoise += env.noise(
        (u + offset) * 24,
        v * 24,
        grainOpts,
      );
    }
    elongatedNoise /= grainOffsets.length;

    const machining =
      Math.sin(TAU * (v * 23 + u)) * 0.65 +
      Math.sin(TAU * (v * 41 - u * 2)) * 0.35;

    const value = env.clamp(
      0.43 +
        (1 - fx) * 0.16 +
        (1 - fy) * 0.11 +
        (broadNoise - 0.5) * 0.18 +
        (elongatedNoise - 0.5) * 0.045 +
        machining * 0.012,
      0.24,
      0.79,
    );

    return [
      channel(metalLow.r, metalHigh.r, value),
      channel(metalLow.g, metalHigh.g, value),
      channel(metalLow.b, metalHigh.b, value),
    ];
  });

  env.field((x, y) => {
    const dx = torusDistance(x, seamX, W);
    const dy = torusDistance(y, seamY, H);

    const qx = env.clamp(1 - (dx - gapHalf) / 7, 0, 1);
    const qy = env.clamp(1 - (dy - gapHalf) / 7, 0, 1);
    const ax = 0.18 * qx * qx;
    const ay = 0.16 * qy * qy;
    const alpha = 1 - (1 - ax) * (1 - ay);

    if (alpha < 0.002) return null;
    return [inkRgb.r, inkRgb.g, inkRgb.b, Math.round(alpha * 255)];
  }, { blend: 'over' });

  const chamfer = env.shade(rust, 0.13);
  ctx.fillStyle = env.rgba(chamfer, 0.38);
  ctx.fillRect(seamX + gapHalf, 0, 2, H);
  ctx.fillRect(0, seamY + gapHalf, W, 2);

  ctx.fillStyle = env.rgba(chamfer, 0.22);
  ctx.fillRect(seamX + gapHalf + 2, 0, 1, H);
  ctx.fillRect(0, seamY + gapHalf + 2, W, 1);

  const gapFloor = env.mix(ink, haze, 0.2);
  ctx.fillStyle = gapFloor;
  ctx.fillRect(seamX - gapHalf, 0, gapHalf * 2, H);
  ctx.fillRect(0, seamY - gapHalf, W, gapHalf * 2);

  ctx.fillStyle = ink;
  ctx.fillRect(seamX - 1, 0, 1, H);
  ctx.fillRect(0, seamY - 1, W, 1);

  const streakRng = env.stream('joint-streaks');
  const streaks = [];
  for (let i = 0; i < 4; i += 1) {
    let x = 8 + streakRng() * (W - 16);
    if (torusDistance(x, seamX, W) < 15) {
      x = (x + 31) % W;
    }
    streaks.push({
      x,
      radius: 1.5 + streakRng() * 1.4,
      length: 39 + streakRng() * 35,
      opacity: 0.105 + streakRng() * 0.065,
      dirt: i % 3 === 1,
    });
  }

  env.field((x, y, u, v) => {
    if (insideGap(x, seamX, W)) return null;

    const down = (y - (seamY + gapHalf) + H) % H;
    let bestAlpha = 0;
    let useDirt = false;

    for (const streak of streaks) {
      if (down <= 0 || down >= streak.length) continue;

      const lateral = env.clamp(
        1 - torusDistance(x, streak.x, W) / streak.radius,
        0,
        1,
      );
      if (lateral <= 0) continue;

      const head = env.clamp(down / 3, 0, 1);
      const tail = 1 - down / streak.length;
      const alpha =
        lateral * lateral *
        head *
        tail * tail *
        streak.opacity;

      if (alpha > bestAlpha) {
        bestAlpha = alpha;
        useDirt = streak.dirt;
      }
    }

    if (bestAlpha <= 0) return null;

    const modulation =
      0.68 + env.noise(u * 10, v * 10, streakNoiseOpts) * 0.32;
    const color = useDirt ? dirtRgb : rustBleedRgb;

    return [
      color.r,
      color.g,
      color.b,
      Math.round(bestAlpha * modulation * 255),
    ];
  }, { blend: 'over' });

  env.field((x, y, u, v) => {
    if (
      insideGap(x, seamX, W) ||
      insideGap(y, seamY, H)
    ) {
      return null;
    }

    const dx = torusDistance(x, seamX, W);
    const dy = torusDistance(y, seamY, H);

    const verticalEdge =
      env.clamp(1 - (dx - gapHalf) / 4, 0, 1) *
      env.clamp(1 - (dy - gapHalf) / 16, 0, 1);
    const horizontalEdge =
      env.clamp(1 - (dy - gapHalf) / 4, 0, 1) *
      env.clamp(1 - (dx - gapHalf) / 16, 0, 1);
    const cornerWear = Math.max(verticalEdge, horizontalEdge);

    if (cornerWear <= 0) return null;

    const breakup = env.fbm(u * 16, v * 16, wearOpts);
    const chips = env.clamp((breakup - 0.28) / 0.72, 0, 1);
    const alpha = cornerWear * (0.18 + chips * 0.25);

    return [
      wornRgb.r,
      wornRgb.g,
      wornRgb.b,
      Math.round(alpha * 255),
    ];
  }, { blend: 'over' });

  const boltShadow = env.mix(ink, haze, 0.22);
  const boltBase = env.shade(hull, -0.24);
  const boltDark = env.shade(hull, -0.38);
  const boltLight = env.shade(hull, 0.055);

  function polygon(points, fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
    ctx.fill();
  }

  function drawBolt(cx, cy) {
    polygon([
      [cx - 1, cy - 1],
      [cx + 2, cy - 1],
      [cx + 3, cy],
      [cx + 2, cy + 3],
      [cx, cy + 3],
      [cx - 1, cy + 2],
    ], env.rgba(boltShadow, 0.54));

    polygon([
      [cx - 1, cy - 2],
      [cx + 1, cy - 2],
      [cx + 2, cy - 1],
      [cx + 2, cy + 1],
      [cx + 1, cy + 2],
      [cx - 1, cy + 2],
      [cx - 2, cy + 1],
      [cx - 2, cy - 1],
    ], env.rgba(boltBase, 0.82));

    polygon([
      [cx + 1, cy - 1],
      [cx + 2, cy - 1],
      [cx + 2, cy + 1],
      [cx + 1, cy + 2],
      [cx, cy + 1],
    ], env.rgba(boltDark, 0.68));

    polygon([
      [cx - 1, cy - 2],
      [cx + 1, cy - 2],
      [cx, cy - 1],
      [cx - 1, cy],
      [cx - 2, cy - 1],
    ], env.rgba(boltLight, 0.58));
  }

  const boltX = seamX + 10;
  for (const boltY of [65, 76, 87, 98]) {
    drawBolt(boltX, boltY);
  }
}
