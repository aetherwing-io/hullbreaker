export const meta = {
  id: 'wear-scuff-overlay',
  size: { w: 128, h: 128 },
  seed: 883339,
  roles: ['ink', 'rust-orange', 'haze', 'hull'],
};

export function render(ctx, env) {
  const W = env.width;
  const H = env.height;
  const S = env.seed | 0;
  const TAU = Math.PI * 2;

  const ink = env.PALETTE.ink;
  const rust = env.PALETTE['rust-orange'];
  const haze = env.PALETTE.haze;
  const hull = env.PALETTE.hull;

  const deepInk = env.shade(ink, -0.05);
  const grime = env.mix(ink, haze, 0.58);
  const softHull = env.mix(hull, haze, 0.28);
  const darkRust = env.shade(rust, -0.22);
  const grimeRgb = env.hexToRgb(grime);

  const wrap01 = (value, span) =>
    (((value % span) + span) % span) / span;

  const noiseAt = (x, y, period, seed) =>
    env.noise(
      wrap01(x, W) * period,
      wrap01(y, H) * period,
      { period, seed: S + seed },
    );

  const fbmAt = (x, y, period, seed, octaves = 4) =>
    env.fbm(
      wrap01(x, W) * period,
      wrap01(y, H) * period,
      {
        octaves,
        gain: 0.52,
        lacunarity: 2,
        period,
        seed: S + seed,
      },
    );

  const densityAt = (x, y, layer) => {
    const broad = fbmAt(x, y, 3, 31, 4);
    const local = fbmAt(x, y, 7, 71 + layer * 13, 3);
    return broad * 0.58 + local * 0.42;
  };

  const offsetsX = [-W, 0, W];
  const offsetsY = [-H, 0, H];

  const makeChip = (x, y, rx, ry, rotation, seed, count) => {
    const points = [];
    const cr = Math.cos(rotation);
    const sr = Math.sin(rotation);

    for (let i = 0; i < count; i += 1) {
      const wedge = TAU / count;
      const jitter =
        (noiseAt(x, y, 23, seed + 20 + i) - 0.5) * wedge * 0.58;
      const angle = i * wedge + jitter;
      const radius = 0.67 + noiseAt(x, y, 19, seed + 60 + i) * 0.48;
      const lx = Math.cos(angle) * rx * radius;
      const ly = Math.sin(angle) * ry * radius;

      points.push({
        x: lx * cr - ly * sr,
        y: lx * sr + ly * cr,
      });
    }

    return points;
  };

  const fillWrapped = (
    points,
    x,
    y,
    color,
    alpha,
    scale = 1,
    shiftX = 0,
    shiftY = 0,
  ) => {
    ctx.fillStyle = env.rgba(color, alpha);

    for (const oy of offsetsY) {
      for (const ox of offsetsX) {
        ctx.beginPath();
        ctx.moveTo(
          x + shiftX + ox + points[0].x * scale,
          y + shiftY + oy + points[0].y * scale,
        );

        for (let i = 1; i < points.length; i += 1) {
          ctx.lineTo(
            x + shiftX + ox + points[i].x * scale,
            y + shiftY + oy + points[i].y * scale,
          );
        }

        ctx.closePath();
        ctx.fill();
      }
    }
  };

  const strokeWrapped = ({
    x,
    y,
    angle,
    length,
    bend,
    width,
    color,
    alpha,
    dash,
    gap,
    phase,
    startBias,
  }) => {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const nx = -dy;
    const ny = dx;

    const sx = x + dx * length * startBias;
    const sy = y + dy * length * startBias;
    const ex = sx + dx * length;
    const ey = sy + dy * length;
    const cx = sx + dx * length * 0.48 + nx * bend;
    const cy = sy + dy * length * 0.48 + ny * bend;

    ctx.strokeStyle = env.rgba(color, alpha);
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash(dash > 0 ? [dash, gap] : []);
    ctx.lineDashOffset = phase;

    for (const oy of offsetsY) {
      for (const ox of offsetsX) {
        ctx.beginPath();
        ctx.moveTo(sx + ox, sy + oy);
        ctx.quadraticCurveTo(cx + ox, cy + oy, ex + ox, ey + oy);
        ctx.stroke();
      }
    }

    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
  };

  ctx.save();
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  env.field(
    (x, y, u, v) => {
      const broad = env.fbm(u * 4, v * 4, {
        octaves: 4,
        gain: 0.52,
        lacunarity: 2,
        period: 4,
        seed: S + 3,
      });
      const dragged = env.fbm(u * 12, v * 3, {
        octaves: 3,
        gain: 0.5,
        lacunarity: 2,
        period: 3,
        seed: S + 7,
      });
      const grain = env.fbm(u * 21, v * 21, {
        octaves: 3,
        gain: 0.5,
        lacunarity: 2,
        period: 21,
        seed: S + 11,
      });
      const holes = env.noise(u * 29, v * 29, {
        period: 29,
        seed: S + 17,
      });

      const coverage = broad * 0.48 + dragged * 0.31 + grain * 0.21;
      if (coverage < 0.58 || holes < 0.43) return null;

      const strength = env.smoothstep(
        env.clamp((coverage - 0.58) / 0.18, 0, 1),
      );
      const alpha = Math.round(5 + strength * 23);

      return [grimeRgb.r, grimeRgb.g, grimeRgb.b, alpha];
    },
    { blend: 'over' },
  );

  const streakPositions = env.stream('wear-long-streak-positions');
  for (let i = 0; i < 34; i += 1) {
    const x = streakPositions() * W;
    const y = streakPositions() * H;
    const density = densityAt(x, y, 1);
    const existence = noiseAt(x, y, 31, 110);

    if (existence < 0.86 - density * 0.28) continue;

    const size = noiseAt(x, y, 9, 121);
    const widthNoise = noiseAt(x, y, 13, 127);
    const rotation = noiseAt(x, y, 7, 131);
    const opacity = noiseAt(x, y, 11, 137);
    const curve = noiseAt(x, y, 17, 139);
    const segmentation = noiseAt(x, y, 19, 149);
    const phaseNoise = noiseAt(x, y, 23, 151);

    const length = 12 + size * 15;
    const width = 2.6 + widthNoise * 2.6;
    const angle = 1.42 + (rotation - 0.5) * 0.52;
    const alpha = 0.035 + opacity * 0.075;
    const bend = (curve - 0.5) * 7;
    const dash = 3.5 + segmentation * 6;
    const gap = 1.5 + (1 - segmentation) * 3;
    const phase = phaseNoise * (dash + gap);

    strokeWrapped({
      x,
      y,
      angle,
      length,
      bend,
      width: width + 1.6,
      color: darkRust,
      alpha: alpha * 0.62,
      dash,
      gap,
      phase,
      startBias: -0.08,
    });

    strokeWrapped({
      x: x - 0.45,
      y: y - 0.35,
      angle,
      length: length * 0.93,
      bend: bend * 0.82,
      width,
      color: rust,
      alpha: alpha * 0.72,
      dash: dash * 0.84,
      gap: gap * 1.12,
      phase,
      startBias: -0.06,
    });
  }

  const chipPositions = env.stream('wear-mid-chip-positions');
  for (let i = 0; i < 58; i += 1) {
    const x = chipPositions() * W;
    const y = chipPositions() * H;
    const density = densityAt(x, y, 2);
    const existence = noiseAt(x, y, 29, 210);

    if (existence < 0.87 - density * 0.3) continue;

    const size = noiseAt(x, y, 8, 221);
    const aspect = noiseAt(x, y, 12, 223);
    const rotationNoise = noiseAt(x, y, 7, 227);
    const opacityNoise = noiseAt(x, y, 10, 229);
    const vertexNoise = noiseAt(x, y, 17, 233);
    const rustPresence = noiseAt(x, y, 14, 239);

    const rx = 3.2 + size * 3.8;
    const ry = 1.7 + aspect * 2.8;
    const rotation = rotationNoise * TAU;
    const alpha = 0.08 + opacityNoise * 0.14;
    const count = 5 + Math.floor(vertexNoise * 4);
    const points = makeChip(x, y, rx, ry, rotation, 250, count);

    if (rustPresence > 0.48) {
      fillWrapped(
        points,
        x,
        y,
        rust,
        alpha * (0.18 + rustPresence * 0.2),
        1.18 + rustPresence * 0.08,
        0.45,
        0.85,
      );
    }

    fillWrapped(
      points,
      x,
      y,
      softHull,
      alpha * 0.54,
      1.04,
      -0.72,
      -0.62,
    );
    fillWrapped(points, x, y, deepInk, alpha, 1, 0.18, 0.22);
  }

  const scratchPositions = env.stream('wear-scuff-scratch-positions');
  for (let i = 0; i < 64; i += 1) {
    const x = scratchPositions() * W;
    const y = scratchPositions() * H;
    const density = densityAt(x, y, 3);
    const existence = noiseAt(x, y, 37, 310);

    if (existence < 0.86 - density * 0.27) continue;

    const size = noiseAt(x, y, 11, 317);
    const widthNoise = noiseAt(x, y, 16, 319);
    const rotation = noiseAt(x, y, 8, 323);
    const opacity = noiseAt(x, y, 13, 331);
    const curve = noiseAt(x, y, 19, 337);
    const dashNoise = noiseAt(x, y, 23, 347);
    const gapNoise = noiseAt(x, y, 17, 349);
    const phaseNoise = noiseAt(x, y, 29, 353);

    const length = 8 + size * 12;
    const width = 2.1 + widthNoise * 1.9;
    const angle = -0.28 + (rotation - 0.5) * 1.05;
    const alpha = 0.045 + opacity * 0.09;
    const bend = (curve - 0.5) * 4.8;
    const dash = 3 + dashNoise * 5;
    const gap = 1 + gapNoise * 2.7;
    const phase = phaseNoise * (dash + gap);

    strokeWrapped({
      x: x + 0.6,
      y: y + 0.65,
      angle,
      length,
      bend,
      width: width + 1.1,
      color: deepInk,
      alpha: alpha * 0.62,
      dash,
      gap,
      phase,
      startBias: -0.5,
    });

    strokeWrapped({
      x: x - 0.45,
      y: y - 0.5,
      angle,
      length: length * 0.96,
      bend: bend * 0.9,
      width,
      color: softHull,
      alpha,
      dash: dash * 0.9,
      gap: gap * 1.08,
      phase,
      startBias: -0.5,
    });
  }

  const pitPositions = env.stream('wear-tiny-pit-positions');
  for (let i = 0; i < 125; i += 1) {
    const x = pitPositions() * W;
    const y = pitPositions() * H;
    const density = densityAt(x, y, 4);
    const existence = noiseAt(x, y, 41, 410);

    if (existence < 0.8 - density * 0.25) continue;

    const size = noiseAt(x, y, 15, 419);
    const aspect = noiseAt(x, y, 21, 421);
    const rotationNoise = noiseAt(x, y, 12, 431);
    const opacityNoise = noiseAt(x, y, 17, 433);
    const vertexNoise = noiseAt(x, y, 25, 439);
    const rustPresence = noiseAt(x, y, 19, 443);

    const rx = 1.6 + size * 1.2;
    const ry = 1.2 + aspect * 1.1;
    const rotation = rotationNoise * TAU;
    const alpha = 0.06 + opacityNoise * 0.12;
    const count = 5 + Math.floor(vertexNoise * 3);
    const points = makeChip(x, y, rx, ry, rotation, 460, count);

    if (rustPresence > 0.6) {
      fillWrapped(
        points,
        x,
        y,
        darkRust,
        alpha * 0.32,
        1.24,
        0.28,
        0.48,
      );
    }

    fillWrapped(
      points,
      x,
      y,
      softHull,
      alpha * 0.48,
      1.04,
      -0.48,
      -0.42,
    );
    fillWrapped(points, x, y, deepInk, alpha, 1, 0.12, 0.16);
  }

  ctx.restore();
}
