export const meta = {
  id: 'wear-scuff-overlay',
  size: { w: 128, h: 128 },
  seed: 883339,
  roles: ['ink', 'rust-orange', 'haze', 'hull'],
};

export function render(ctx, env) {
  const w = env.width;
  const h = env.height;
  const clamp = env.clamp;
  const lightX = -0.72;
  const lightY = -0.69;

  const ink = env.PALETTE.ink;
  const rust = env.PALETTE['rust-orange'];
  const haze = env.PALETTE.haze;
  const hull = env.PALETTE.hull;

  const grimeRgb = env.hexToRgb(env.mix(haze, ink, 0.42));
  const rustRgb = env.hexToRgb(env.shade(rust, -0.14));
  const scratchDarkRgb = env.hexToRgb(env.mix(ink, haze, 0.22));
  const scratchLightRgb = env.hexToRgb(env.shade(hull, 0.11));
  const chipRimRgb = env.hexToRgb(env.mix(ink, haze, 0.12));
  const chipCoreRgb = env.hexToRgb(env.shade(hull, 0.25));

  const wrap = (v, size) => {
    v %= size;
    return v < 0 ? v + size : v;
  };

  const delta = (a, b, size) => {
    let d = a - b;
    d -= Math.round(d / size) * size;
    return d;
  };

  const rgba = (rgb, alpha) => [
    rgb.r,
    rgb.g,
    rgb.b,
    Math.round(clamp(alpha, 0, 255)),
  ];

  const zoneRng = env.stream('wear-zones');
  const directions = [-0.34, 0.53, 1.27];
  const zones = [];

  for (let i = 0; i < 4; i++) {
    zones.push({
      x: zoneRng() * w,
      y: zoneRng() * h,
      rx: 12 + zoneRng() * 11,
      ry: 8 + zoneRng() * 9,
      angle: directions[i % directions.length],
    });
  }

  const scratchRng = env.stream('scuff-scratches');
  const scratches = [];

  for (let z = 0; z < zones.length; z++) {
    const zone = zones[z];
    const count = 4 + Math.floor(scratchRng() * 4);

    for (let i = 0; i < count; i++) {
      const x = wrap(
        zone.x + (scratchRng() + scratchRng() - 1) * zone.rx,
        w,
      );
      const y = wrap(
        zone.y + (scratchRng() + scratchRng() - 1) * zone.ry,
        h,
      );
      const angle =
        zone.angle + (scratchRng() + scratchRng() - 1) * 0.13;
      const vx = Math.cos(angle);
      const vy = Math.sin(angle);
      let nx = -vy;
      let ny = vx;

      if (nx * lightX + ny * lightY < 0) {
        nx = -nx;
        ny = -ny;
      }

      scratches.push({
        x,
        y,
        vx,
        vy,
        nx,
        ny,
        half: 4.5 + scratchRng() * 5.2,
        outer: 2.15 + scratchRng() * 1.05,
        core: 1.05 + scratchRng() * 0.55,
        lipOffset: 0.7 + scratchRng() * 0.45,
        darkAlpha: 74 + scratchRng() * 56,
        lightAlpha: 78 + scratchRng() * 70,
      });
    }
  }

  const chipRng = env.stream('metal-chips');
  const chips = [];

  for (let z = 0; z < zones.length; z++) {
    const zone = zones[z];
    const count = 3 + Math.floor(chipRng() * 3);

    for (let i = 0; i < count; i++) {
      chips.push({
        x: wrap(
          zone.x + (chipRng() + chipRng() - 1) * zone.rx * 0.9,
          w,
        ),
        y: wrap(
          zone.y + (chipRng() + chipRng() - 1) * zone.ry * 0.9,
          h,
        ),
        rx: 2.35 + chipRng() * 1.75,
        ry: 1.75 + chipRng() * 1.35,
        rotation: chipRng() * Math.PI,
        phase: chipRng() * Math.PI * 2,
        coreScale: 0.59 + chipRng() * 0.09,
        rimAlpha: 125 + chipRng() * 66,
        coreAlpha: 145 + chipRng() * 72,
      });
    }
  }

  const bleedRng = env.stream('rust-bleeds');
  const bleeds = [];

  for (let i = 0; i < chips.length; i++) {
    if (bleedRng() < 0.56) {
      const chip = chips[i];
      bleeds.push({
        x: wrap(chip.x + (bleedRng() - 0.5) * 1.3, w),
        y: wrap(chip.y + chip.ry * 0.48, h),
        length: 6.5 + bleedRng() * 13,
        width: 1.15 + bleedRng() * 1.25,
        drift: (bleedRng() - 0.5) * 4.2,
        phase: bleedRng() * Math.PI * 2,
        alpha: 185 + bleedRng() * 55,
      });
    }
  }

  const lineDistance = (x, y, scratch, highlighted) => {
    const offset = highlighted ? scratch.lipOffset : 0;
    const cx = scratch.x + scratch.nx * offset;
    const cy = scratch.y + scratch.ny * offset;
    const dx = delta(x, cx, w);
    const dy = delta(y, cy, h);
    const along = dx * scratch.vx + dy * scratch.vy;
    const side = dx * scratch.nx + dy * scratch.ny;
    const beyond = Math.max(Math.abs(along) - scratch.half, 0);
    return Math.hypot(beyond, side);
  };

  const chipMetric = (x, y, chip, scale, offsetX, offsetY) => {
    const dx = delta(x, chip.x + offsetX, w);
    const dy = delta(y, chip.y + offsetY, h);
    const cs = Math.cos(chip.rotation);
    const sn = Math.sin(chip.rotation);
    const lx = dx * cs + dy * sn;
    const ly = -dx * sn + dy * cs;
    const angle = Math.atan2(ly, lx);
    const boundary =
      1 +
      0.13 * Math.sin(angle * 3 + chip.phase) +
      0.08 * Math.sin(angle * 5 - chip.phase * 0.7);
    const q = Math.hypot(
      lx / (chip.rx * scale),
      ly / (chip.ry * scale),
    );
    return q / boundary;
  };

  env.field(
    (x, y, u, v) => {
      const pool = env.fbm(u * 3, v * 3, {
        octaves: 4,
        gain: 0.55,
        lacunarity: 2,
        period: 3,
        seed: meta.seed + 17,
      });
      const dragged = env.fbm((u + v) * 5, v * 5, {
        octaves: 3,
        gain: 0.52,
        lacunarity: 2,
        period: 5,
        seed: meta.seed + 41,
      });
      const gathered = pool * 0.76 + dragged * 0.24;

      if (gathered <= 0.56) return null;

      const softness = env.smoothstep(
        clamp((gathered - 0.56) / 0.18, 0, 1),
      );
      const grain = env.noise(u * 16, v * 16, {
        period: 16,
        seed: meta.seed + 73,
      });
      const alpha = (5 + softness * 25) * (0.72 + grain * 0.42);

      return rgba(grimeRgb, alpha);
    },
    { blend: 'over' },
  );

  env.field(
    (x, y) => {
      let bestAlpha = 0;

      for (let i = 0; i < bleeds.length; i++) {
        const bleed = bleeds[i];
        let down = y - bleed.y;
        down -= Math.round(down / h) * h;

        if (down < 0 || down > bleed.length) continue;

        const t = down / bleed.length;
        const wiggle =
          0.44 *
          (Math.sin(bleed.phase + t * 5.4) -
            Math.sin(bleed.phase));
        const centerX = bleed.x + bleed.drift * t + wiggle;
        const across = Math.abs(delta(x, centerX, w));
        const width = bleed.width * (1 - t * 0.36);

        if (across >= width) continue;

        const edge = 1 - env.smoothstep(clamp(across / width, 0, 1));
        const fade = Math.pow(1 - t, 1.55);
        const texture =
          0.88 + 0.12 * Math.cos(bleed.phase + down * 1.7);
        const alpha = bleed.alpha * edge * fade * texture;

        if (alpha > bestAlpha) bestAlpha = alpha;
      }

      return bestAlpha > 2 ? rgba(rustRgb, bestAlpha) : null;
    },
    { blend: 'over' },
  );

  env.field(
    (x, y) => {
      let bestAlpha = 0;

      for (let i = 0; i < scratches.length; i++) {
        const scratch = scratches[i];
        const d = lineDistance(x, y, scratch, false);

        if (d >= scratch.outer) continue;

        const coverage =
          1 - env.smoothstep(clamp(d / scratch.outer, 0, 1));
        bestAlpha = Math.max(
          bestAlpha,
          scratch.darkAlpha * coverage,
        );
      }

      return bestAlpha > 3 ? rgba(scratchDarkRgb, bestAlpha) : null;
    },
    { blend: 'over' },
  );

  env.field(
    (x, y) => {
      let bestAlpha = 0;

      for (let i = 0; i < chips.length; i++) {
        const chip = chips[i];
        const metric = chipMetric(x, y, chip, 1, 0, 0);

        if (metric >= 1) continue;

        const coverage =
          metric <= 0.76
            ? 1
            : 1 -
              env.smoothstep(clamp((metric - 0.76) / 0.24, 0, 1));
        bestAlpha = Math.max(
          bestAlpha,
          chip.rimAlpha * coverage,
        );
      }

      return bestAlpha > 3 ? rgba(chipRimRgb, bestAlpha) : null;
    },
    { blend: 'over' },
  );

  env.field(
    (x, y) => {
      let bestAlpha = 0;

      for (let i = 0; i < scratches.length; i++) {
        const scratch = scratches[i];
        const d = lineDistance(x, y, scratch, true);

        if (d >= scratch.core) continue;

        const coverage =
          1 - env.smoothstep(clamp(d / scratch.core, 0, 1));
        bestAlpha = Math.max(
          bestAlpha,
          scratch.lightAlpha * coverage,
        );
      }

      return bestAlpha > 3
        ? rgba(scratchLightRgb, bestAlpha)
        : null;
    },
    { blend: 'over' },
  );

  env.field(
    (x, y) => {
      let bestAlpha = 0;

      for (let i = 0; i < chips.length; i++) {
        const chip = chips[i];
        const metric = chipMetric(
          x,
          y,
          chip,
          chip.coreScale,
          lightX * 0.52,
          lightY * 0.52,
        );

        if (metric >= 1) continue;

        const coverage =
          metric <= 0.72
            ? 1
            : 1 -
              env.smoothstep(clamp((metric - 0.72) / 0.28, 0, 1));
        bestAlpha = Math.max(
          bestAlpha,
          chip.coreAlpha * coverage,
        );
      }

      return bestAlpha > 3 ? rgba(chipCoreRgb, bestAlpha) : null;
    },
    { blend: 'over' },
  );
}
