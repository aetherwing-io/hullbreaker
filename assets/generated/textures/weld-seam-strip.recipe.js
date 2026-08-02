export const meta = {
  id: 'weld-seam-strip',
  size: { w: 128, h: 32 },
  seed: 593809,
  roles: ['rust-orange', 'ink', 'hull', 'haze', 'warm-white'],
};

export function render(ctx, env) {
  const W = env.width;
  const H = env.height;
  const palette = env.PALETTE;

  const rust = palette['rust-orange'];
  const ink = palette.ink;
  const hull = palette.hull;
  const haze = palette.haze;
  const warm = palette['warm-white'];

  const rgb = (hex) => {
    const c = env.hexToRgb(hex);
    return [c.r, c.g, c.b];
  };

  const colors = {
    rustDeep: rgb(env.shade(rust, -0.54)),
    rustShadow: rgb(env.shade(rust, -0.32)),
    rustMid: rgb(rust),
    rustLight: rgb(env.shade(rust, 0.24)),
    rustEdge: rgb(env.shade(rust, 0.43)),
    inkDeep: rgb(env.shade(ink, -0.18)),
    ink: rgb(ink),
    hazeDark: rgb(env.shade(haze, -0.28)),
    hullDark: rgb(env.shade(hull, -0.27)),
    hullLight: rgb(env.shade(hull, 0.29)),
    warm: rgb(env.shade(warm, -0.12)),
  };

  const mixRgb = (a, b, t, alpha = 255) => {
    const k = env.clamp(t, 0, 1);
    return [
      Math.round(env.lerp(a[0], b[0], k)),
      Math.round(env.lerp(a[1], b[1], k)),
      Math.round(env.lerp(a[2], b[2], k)),
      alpha,
    ];
  };

  const solid = (c, alpha = 255) => [c[0], c[1], c[2], alpha];

  env.field((x, y, u, v) => {
    const macro = env.fbm(u * 8, v * 4.7, {
      octaves: 4,
      gain: 0.52,
      lacunarity: 2,
      period: 8,
      seed: env.seed + 11,
    });
    const grain = env.fbm(u * 24, v * 13.0, {
      octaves: 3,
      gain: 0.48,
      lacunarity: 2,
      period: 24,
      seed: env.seed + 29,
    });
    const along = env.fbm(u * 4, v * 18.0, {
      octaves: 3,
      gain: 0.5,
      lacunarity: 2,
      period: 4,
      seed: env.seed + 47,
    });

    if (y === 0) {
      const glint = env.noise(u * 32, 0.41, {
        period: 32,
        seed: env.seed + 83,
      });
      if (glint > 0.61) return solid(colors.warm);
      return mixRgb(
        colors.rustEdge,
        colors.hullLight,
        0.28 + glint * 0.42
      );
    }

    if (y < 6) {
      const chamferLight = 1 - y / 6;
      const wear = env.ridge(u * 20, 1.6 + v * 5.2, {
        octaves: 3,
        gain: 0.5,
        lacunarity: 2,
        period: 20,
        seed: env.seed + 67,
      });
      const baseT = 0.47
        + chamferLight * 0.27
        + (macro - 0.5) * 0.18
        + (grain - 0.5) * 0.1;
      let out = mixRgb(colors.rustLight, colors.rustEdge, baseT);
      const bare = env.smoothstep(env.clamp((wear - 0.54) / 0.34, 0, 1));
      out = mixRgb(out, colors.hullLight, bare * (0.34 + chamferLight * 0.42));
      if (y === 5) out = mixRgb(out, colors.rustShadow, 0.7);
      return out;
    }

    if (y < 23) {
      const faceY = (y - 6) / 17;
      const streak = env.ridge(u * 24, 2.3 + v * 1.2, {
        octaves: 3,
        gain: 0.52,
        lacunarity: 2,
        period: 24,
        seed: env.seed + 101,
      });
      const layerGrain = env.noise(u * 6, v * 18, {
        period: 6,
        seed: env.seed + 131,
      });
      const value = 0.53
        - faceY * 0.23
        + (macro - 0.5) * 0.24
        + (grain - 0.5) * 0.19
        + (along - 0.5) * 0.12
        + (layerGrain - 0.5) * 0.08;
      let out = mixRgb(colors.rustShadow, colors.rustLight, value);
      const stain = env.smoothstep(env.clamp((streak - 0.6) / 0.31, 0, 1));
      out = mixRgb(out, colors.rustDeep, stain * (0.13 + faceY * 0.28));
      if (y === 6) out = mixRgb(out, colors.rustDeep, 0.28);
      if (y > 20) out = mixRgb(out, colors.rustDeep, (y - 20) * 0.16);
      return out;
    }

    const depth = (y - 23) / Math.max(1, H - 24);
    const bottomGrain = env.fbm(u * 16, v * 7.0, {
      octaves: 3,
      gain: 0.5,
      lacunarity: 2,
      period: 16,
      seed: env.seed + 157,
    });
    const slatField = env.ridge(u * 18, 1.2 + v * 2.8, {
      octaves: 3,
      gain: 0.5,
      lacunarity: 2,
      period: 18,
      seed: env.seed + 181,
    });
    const notch = env.smoothstep(
      env.clamp((slatField - 0.61) / 0.29, 0, 1)
    );
    const darkness = 0.55
      + depth * 0.34
      + (bottomGrain - 0.5) * 0.12
      + notch * 0.12;
    return mixRgb(colors.hazeDark, colors.inkDeep, darkness);
  }, { blend: 'replace' });

  env.field((x, y, u, v) => {
    if (y >= 19) {
      const depth = env.smoothstep(env.clamp((y - 19) / 7, 0, 1));
      const soft = env.noise(u * 16, v * 4.0, {
        period: 16,
        seed: env.seed + 211,
      });
      return solid(colors.ink, Math.round(depth * (30 + soft * 34)));
    }

    if (y === 5) {
      const broken = env.noise(u * 24, 0.73, {
        period: 24,
        seed: env.seed + 223,
      });
      return solid(colors.ink, Math.round(45 + broken * 55));
    }

    return null;
  }, { blend: 'over' });

  const supportRng = env.stream('support-slats');
  const supportCount = 12;
  const supportStep = W / supportCount;

  for (let i = 0; i < supportCount; i += 1) {
    const center = (i + 0.5) * supportStep + (supportRng() - 0.5) * 3.2;
    const width = 3 + Math.floor(supportRng() * 3);
    const lean = supportRng() < 0.5 ? -1 : 1;
    const crown = 24 + Math.floor(supportRng() * 2);

    for (const offset of [-W, 0, W]) {
      const px = center + offset;
      ctx.fillStyle = env.rgba(env.shade(ink, -0.18), 0.58);
      ctx.beginPath();
      ctx.moveTo(px - width * 0.5, crown);
      ctx.lineTo(px + width * 0.5, crown);
      ctx.lineTo(px + width * 0.5 + lean, H);
      ctx.lineTo(px - width * 0.5 + lean * 2, H);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = env.rgba(env.shade(haze, -0.28), 0.34);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px - width * 0.5, crown + 1);
      ctx.lineTo(px - width * 0.5 + lean * 1.5, H);
      ctx.stroke();
    }
  }

  const fixingRng = env.stream('fixings');
  const fixings = [];
  const fixingCount = 9;
  const fixingStep = W / fixingCount;

  for (let i = 0; i < fixingCount; i += 1) {
    fixings.push({
      x: (i + 0.5) * fixingStep + (fixingRng() - 0.5) * 4.5,
      y: 9 + Math.floor(fixingRng() * 4),
      bleed: 5 + Math.floor(fixingRng() * 7),
      width: 2 + Math.floor(fixingRng() * 2),
    });
  }

  for (const fixing of fixings) {
    for (const offset of [-W, 0, W]) {
      const px = Math.round(fixing.x + offset);
      const py = fixing.y;
      const bleedGradient = ctx.createLinearGradient(
        0,
        py + 1,
        0,
        py + fixing.bleed
      );
      bleedGradient.addColorStop(
        0,
        env.rgba(env.shade(rust, -0.54), 0.58)
      );
      bleedGradient.addColorStop(
        0.58,
        env.rgba(env.shade(rust, -0.54), 0.22)
      );
      bleedGradient.addColorStop(
        1,
        env.rgba(env.shade(rust, -0.54), 0)
      );
      ctx.fillStyle = bleedGradient;
      ctx.fillRect(
        px - Math.floor(fixing.width / 2),
        py + 1,
        fixing.width,
        fixing.bleed
      );
    }
  }

  const scuffRng = env.stream('face-scuffs');

  for (let i = 0; i < 14; i += 1) {
    const x = scuffRng() * W;
    const y = 7 + Math.floor(scuffRng() * 14);
    const length = 3 + Math.floor(scuffRng() * 8);
    const rise = scuffRng() < 0.45 ? -1 : 0;
    const strength = 0.1 + scuffRng() * 0.13;

    for (const offset of [-W, 0, W]) {
      const px = x + offset;

      ctx.strokeStyle = env.rgba(env.shade(rust, -0.54), strength + 0.05);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(px, y + 1);
      ctx.lineTo(px + length, y + rise + 1);
      ctx.stroke();

      ctx.strokeStyle = env.rgba(env.shade(hull, 0.29), strength);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px, y);
      ctx.lineTo(px + length, y + rise);
      ctx.stroke();
    }
  }

  for (const fixing of fixings) {
    for (const offset of [-W, 0, W]) {
      const px = Math.round(fixing.x + offset);
      const py = fixing.y;

      ctx.fillStyle = env.rgba(env.shade(ink, -0.18), 0.78);
      ctx.fillRect(px - 2, py - 1, 5, 4);

      ctx.fillStyle = env.shade(hull, -0.27);
      ctx.fillRect(px - 1, py - 1, 3, 3);

      ctx.fillStyle = env.shade(hull, 0.29);
      ctx.fillRect(px - 1, py - 1, 2, 1);

      ctx.fillStyle = env.shade(rust, -0.32);
      ctx.fillRect(px + 1, py, 1, 2);
    }
  }

  env.field((x, y, u, v) => {
    if (y > 4) return null;

    const chip = env.ridge(u * 24, 2.1 + v * 7.0, {
      octaves: 3,
      gain: 0.48,
      lacunarity: 2,
      period: 24,
      seed: env.seed + 251,
    });
    const mask = env.smoothstep(env.clamp((chip - 0.57) / 0.31, 0, 1));
    const edgeBias = 1 - y / 5;
    const alpha = Math.round(mask * (24 + edgeBias * 72));

    return alpha > 2 ? solid(colors.hullLight, alpha) : null;
  }, { blend: 'over' });
}
