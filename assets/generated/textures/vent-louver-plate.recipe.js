export const meta = {
  id: 'vent-louver-plate',
  size: { w: 128, h: 128 },
  seed: 712521,
  roles: ['rust-orange', 'ink', 'haze', 'hull', 'acid-green'],
};

export function render(ctx, env) {
  const rust = env.PALETTE['rust-orange'];
  const ink = env.PALETTE.ink;
  const haze = env.PALETTE.haze;
  const hull = env.PALETTE.hull;
  const acid = env.PALETTE['acid-green'];

  const rustDeep = env.shade(rust, -0.48);
  const rustDark = env.shade(rust, -0.28);
  const rustLight = env.shade(rust, 0.18);
  const inkDeep = env.shade(ink, -0.18);
  const hullLight = env.shade(hull, 0.14);
  const wornMetal = env.mix(haze, hull, 0.64);
  const acidDim = env.mix(ink, acid, 0.42);
  const acidRim = env.mix(haze, acid, 0.46);
  const acidBright = env.shade(acid, 0.22);

  const toRgb = (hex) => {
    const c = env.hexToRgb(hex);
    return [c.r, c.g, c.b];
  };

  const ramp = (a, b, count) => {
    const out = [];
    for (let i = 0; i < count; i++) {
      out.push(toRgb(env.mix(a, b, i / (count - 1))));
    }
    return out;
  };

  const pick = (colors, t) => {
    const i = Math.floor(env.clamp(t, 0, 0.9999) * colors.length);
    return colors[Math.min(colors.length - 1, Math.max(0, i))];
  };

  const path = (points, close = false) => {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    if (close) ctx.closePath();
  };

  const fillPoly = (points, style) => {
    path(points, true);
    ctx.fillStyle = style;
    ctx.fill();
  };

  const strokePoly = (points, style, width, close = false) => {
    path(points, close);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  };

  const pointInPoly = (x, y, points) => {
    let inside = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const xi = points[i][0];
      const yi = points[i][1];
      const xj = points[j][0];
      const yj = points[j][1];
      const crosses = (yi > y) !== (yj > y);
      if (crosses && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  };

  const plateMask = (x, y) => {
    if (x < 3 || x > 125 || y < 4 || y > 124) return false;
    return x + y >= 17 &&
      x - y <= 111 &&
      x + y <= 239 &&
      y - x <= 111;
  };

  const cavityMask = (x, y) => {
    if (x < 22 || x > 106 || y < 26 || y > 105) return false;
    return x + y >= 53 &&
      x - y <= 76 &&
      x + y <= 207 &&
      y - x <= 79;
  };

  const frameMask = (x, y) => plateMask(x, y) && !cavityMask(x, y);

  const outer = [
    [13, 4], [115, 4], [125, 14], [125, 114],
    [115, 124], [13, 124], [3, 114], [3, 14],
  ];

  const opening = [
    [27, 26], [102, 26], [106, 30], [106, 101],
    [102, 105], [26, 105], [22, 101], [22, 31],
  ];

  const rustRamp = ramp(rustDeep, rustLight, 24);

  env.field((x, y) => {
    if (!plateMask(x, y)) return null;

    const broad = env.fbm(x * 0.105, y * 0.031, {
      octaves: 4,
      gain: 0.53,
      lacunarity: 2,
      period: 128,
      seed: env.seed + 11,
    });
    const alongPlate = env.noise(x * 0.038, y * 0.31, {
      period: 64,
      seed: env.seed + 23,
    });

    let light = 0.4;
    light += (1 - x / env.width) * 0.08;
    light += (1 - y / env.height) * 0.15;
    light += (broad - 0.5) * 0.27;
    light += (alongPlate - 0.5) * 0.1;
    if (x > 116) light -= (x - 116) * 0.014;
    if (y > 115) light -= (y - 115) * 0.016;

    return pick(rustRamp, light);
  });

  const rustDeepRgb = toRgb(rustDeep);
  env.field((x, y) => {
    if (!frameMask(x, y)) return null;

    const erosion = env.ridge(x * 0.085, y * 0.029, {
      octaves: 3,
      gain: 0.56,
      lacunarity: 2,
      period: 96,
      seed: env.seed + 37,
    });
    const bleed = env.noise(x * 0.29, y * 0.041, {
      period: 64,
      seed: env.seed + 41,
    });
    const amount = Math.max(0, erosion - 0.56) * 96 +
      Math.max(0, bleed - 0.68) * 42;

    if (amount < 3) return null;
    return [rustDeepRgb[0], rustDeepRgb[1], rustDeepRgb[2], Math.round(amount)];
  }, { blend: 'over' });

  ctx.lineJoin = 'bevel';
  ctx.lineCap = 'round';

  strokePoly(
    [[4, 113], [4, 15], [13, 5], [115, 5], [124, 14]],
    env.rgba(rustLight, 0.92),
    4.2,
  );
  strokePoly(
    [[125, 15], [125, 114], [115, 124], [13, 124], [3, 114]],
    env.rgba(rustDeep, 0.94),
    5.2,
  );
  strokePoly(outer, env.rgba(rustDark, 0.72), 1.6, true);

  const wearRng = env.stream('frame-wear');
  for (let i = 0; i < 24; i++) {
    const horizontal = i % 2 === 0;
    const bright = i % 5 === 0;
    ctx.strokeStyle = env.rgba(
      bright ? wornMetal : rustLight,
      bright ? 0.28 : 0.16,
    );
    ctx.lineWidth = 0.8 + wearRng() * 1.1;

    if (horizontal) {
      const top = i % 4 === 0;
      const y = top ? 9 + wearRng() * 11 : 108 + wearRng() * 11;
      const x = 27 + wearRng() * 67;
      const len = 5 + wearRng() * 17;
      strokePoly([[x, y], [x + len, y + (wearRng() - 0.5) * 1.4]], ctx.strokeStyle, ctx.lineWidth);
    } else {
      const left = i % 4 === 1;
      const x = left ? 7 + wearRng() * 11 : 110 + wearRng() * 11;
      const y = 34 + wearRng() * 55;
      const len = 5 + wearRng() * 16;
      strokePoly([[x, y], [x + (wearRng() - 0.5), y + len]], ctx.strokeStyle, ctx.lineWidth);
    }
  }

  fillPoly(
    [[13, 5], [30, 5], [25, 9], [16, 11], [9, 15]],
    env.rgba(wornMetal, 0.48),
  );
  fillPoly(
    [[115, 5], [121, 11], [114, 10], [104, 7]],
    env.rgba(wornMetal, 0.36),
  );
  fillPoly(
    [[4, 105], [8, 113], [14, 119], [10, 110]],
    env.rgba(wornMetal, 0.3),
  );
  fillPoly(
    [[116, 120], [124, 112], [121, 103], [118, 112]],
    env.rgba(wornMetal, 0.24),
  );

  const bolts = [
    [15, 17, 20],
    [113, 17, 18],
    [15, 112, 10],
    [113, 112, 9],
  ];

  for (const [bx, by, length] of bolts) {
    const endY = Math.min(122, by + length);
    const gradient = ctx.createLinearGradient(0, by + 3, 0, endY);
    gradient.addColorStop(0, env.rgba(rustDeep, 0.74));
    gradient.addColorStop(0.54, env.rgba(rustDark, 0.38));
    gradient.addColorStop(1, env.rgba(rustDeep, 0));

    fillPoly(
      [
        [bx - 3.2, by + 3],
        [bx + 3.1, by + 3],
        [bx + 2.1, endY],
        [bx + 0.4, endY - 2],
        [bx - 1.1, endY],
        [bx - 2.4, by + 9],
      ],
      gradient,
    );
  }

  const cavityRamp = ramp(
    inkDeep,
    env.mix(ink, haze, 0.24),
    14,
  );

  env.field((x, y) => {
    if (!cavityMask(x, y)) return null;

    const recess = env.fbm(x * 0.08, y * 0.045, {
      octaves: 3,
      gain: 0.5,
      lacunarity: 2,
      period: 96,
      seed: env.seed + 59,
    });
    const verticalStreak = env.noise(x * 0.34, y * 0.05, {
      period: 64,
      seed: env.seed + 61,
    });
    const value = 0.18 + recess * 0.25 + verticalStreak * 0.08;
    return pick(cavityRamp, value);
  });

  const inkDeepRgb = toRgb(inkDeep);
  env.field((x, y) => {
    if (!cavityMask(x, y)) return null;

    const edgeDistance = Math.max(
      0,
      Math.min(x - 22, 106 - x, y - 26, 105 - y),
    );
    const sideOcclusion = Math.max(0, 1 - edgeDistance / 8);
    const topOcclusion = Math.max(0, 1 - (y - 26) / 12);
    const alpha = Math.round(
      112 * sideOcclusion * sideOcclusion + 40 * topOcclusion,
    );

    if (alpha < 2) return null;
    return [inkDeepRgb[0], inkDeepRgb[1], inkDeepRgb[2], Math.min(184, alpha)];
  }, { blend: 'over' });

  strokePoly(opening, env.rgba(inkDeep, 0.96), 5.4, true);
  strokePoly(
    [[27, 25.8], [102, 25.8], [106.2, 30]],
    env.rgba(rustLight, 0.95),
    3.2,
  );
  strokePoly(
    [[27, 25.8], [21.8, 31], [21.8, 101]],
    env.rgba(rustLight, 0.74),
    3,
  );
  strokePoly(
    [[106.2, 30], [106.2, 101], [102, 105.2], [26, 105.2]],
    env.rgba(inkDeep, 0.88),
    4.6,
  );

  const acidRgb = toRgb(acid);
  env.field((x, y) => {
    if (!cavityMask(x, y)) return null;

    const dx = (x - 65) / 20;
    const dy = (y - 91) / 11;
    const d = dx * dx + dy * dy;
    if (d >= 1) return null;

    const flutter = env.noise(x * 0.25, y * 0.18, {
      period: 48,
      seed: env.seed + 73,
    });
    const glow = (1 - d) * (1 - d) * (0.76 + flutter * 0.24);
    const alpha = Math.round(glow * 82);
    if (alpha < 2) return null;

    return [acidRgb[0], acidRgb[1], acidRgb[2], alpha];
  }, { blend: 'over' });

  fillPoly(
    [[50, 90], [58, 84], [74, 84], [83, 89], [78, 98], [55, 100]],
    env.rgba(acidDim, 0.72),
  );

  const bladePolys = [
    [[27, 34], [101, 33], [101, 44], [98, 47], [30, 50], [27, 47]],
    [[27, 50], [101, 49], [101, 60], [98, 63], [30, 66], [27, 63]],
    [[27, 66], [101, 65], [101, 76], [98, 79], [30, 82], [27, 79]],
    [[27, 82], [57, 81], [61, 84], [57, 93], [51, 97], [27, 94]],
    [[75, 83], [101, 81], [101, 92], [83, 93], [77, 98], [72, 94], [70, 89]],
  ];

  const bladeDefs = bladePolys.map((poly) => {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of poly) {
      minY = Math.min(minY, p[1]);
      maxY = Math.max(maxY, p[1]);
    }
    return { poly, minY, maxY };
  });

  const bladeLow = env.mix(ink, haze, 0.72);
  const bladeHigh = env.mix(haze, hull, 0.74);
  const bladeRamp = ramp(bladeLow, bladeHigh, 18);

  for (const poly of bladePolys) {
    fillPoly(poly, bladeLow);
  }

  env.field((x, y) => {
    let def = null;
    for (const candidate of bladeDefs) {
      if (pointInPoly(x + 0.5, y + 0.5, candidate.poly)) {
        def = candidate;
        break;
      }
    }
    if (!def) return null;

    const localY = env.clamp(
      (y - def.minY) / Math.max(1, def.maxY - def.minY),
      0,
      1,
    );
    const brushed = env.noise(x * 0.042, y * 0.39, {
      period: 64,
      seed: env.seed + 89,
    });
    const blotch = env.fbm(x * 0.11, y * 0.035, {
      octaves: 3,
      gain: 0.52,
      lacunarity: 2,
      period: 96,
      seed: env.seed + 97,
    });

    const value =
      0.24 +
      (1 - localY) * 0.5 +
      (brushed - 0.5) * 0.12 +
      (blotch - 0.5) * 0.16 +
      (1 - x / env.width) * 0.04;

    return pick(bladeRamp, value);
  });

  env.field((x, y) => {
    for (const def of bladeDefs) {
      if (!pointInPoly(x + 0.5, y + 0.5, def.poly)) continue;

      const localY = (y - def.minY) / Math.max(1, def.maxY - def.minY);
      if (localY < 0.19 || localY > 0.58) return null;

      const falloff = 1 - (localY - 0.19) / 0.39;
      const alpha = Math.round(128 * falloff);
      return [inkDeepRgb[0], inkDeepRgb[1], inkDeepRgb[2], alpha];
    }
    return null;
  }, { blend: 'over' });

  for (const poly of bladePolys) {
    strokePoly(poly, env.rgba(inkDeep, 0.84), 1.8, true);
  }

  const bottomEdges = [
    [[30, 50], [98, 47], [101, 44]],
    [[30, 66], [98, 63], [101, 60]],
    [[30, 82], [98, 79], [101, 76]],
    [[27, 94], [51, 97], [57, 93]],
    [[77, 98], [83, 93], [101, 92]],
  ];

  for (const edge of bottomEdges) {
    strokePoly(edge, env.rgba(inkDeep, 0.92), 3.4);
  }

  const topSegments = [
    [[28, 34], [100, 33]],
    [[28, 50], [100, 49]],
    [[28, 66], [100, 65]],
    [[28, 82], [57, 81]],
    [[75, 83], [100, 81]],
  ];

  for (const segment of topSegments) {
    const shadow = segment.map((p) => [p[0], p[1] + 4.2]);
    strokePoly(shadow, env.rgba(inkDeep, 0.82), 5.2);
  }

  const faceScuffs = [
    [[38, 44], [71, 43]],
    [[46, 59], [89, 58]],
    [[33, 75], [67, 74]],
    [[79, 88], [96, 87]],
  ];

  for (const scuff of faceScuffs) {
    strokePoly(scuff, env.rgba(hull, 0.15), 1.3);
  }

  fillPoly(
    [[30, 43], [41, 42], [38, 46], [31, 47]],
    env.rgba(rustDark, 0.38),
  );
  fillPoly(
    [[87, 55], [100, 54], [97, 58], [89, 59]],
    env.rgba(rustDark, 0.32),
  );
  fillPoly(
    [[28, 73], [39, 72], [36, 77], [29, 78]],
    env.rgba(rustDark, 0.34),
  );

  for (const segment of topSegments) {
    strokePoly(segment, env.rgba(haze, 0.96), 5);
    strokePoly(segment, hullLight, 3.2);
  }

  fillPoly(
    [[59, 89], [62, 87], [69, 87], [72, 90], [70, 94], [61, 96], [57, 93]],
    acid,
  );
  fillPoly(
    [[61, 89], [68, 89], [70, 91], [67, 93], [61, 93], [59, 92]],
    acidBright,
  );

  strokePoly(
    [[57, 81], [61, 84], [57, 93], [51, 97]],
    env.rgba(wornMetal, 0.92),
    2.5,
  );
  strokePoly(
    [[75, 83], [70, 89], [72, 94], [77, 98]],
    env.rgba(wornMetal, 0.9),
    2.5,
  );
  strokePoly(
    [[59, 87], [57, 93]],
    env.rgba(acidRim, 0.88),
    1.7,
  );
  strokePoly(
    [[70, 89], [72, 94]],
    env.rgba(acidRim, 0.86),
    1.7,
  );

  const boltAngles = [0.12, -0.18, -0.08, 0.16];
  for (let i = 0; i < bolts.length; i++) {
    const bx = bolts[i][0];
    const by = bolts[i][1];

    ctx.beginPath();
    ctx.arc(bx + 2, by + 2.4, 7.4, 0, Math.PI * 2);
    ctx.fillStyle = env.rgba(inkDeep, 0.82);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(bx, by, 7.1, 0, Math.PI * 2);
    ctx.fillStyle = rustDeep;
    ctx.fill();

    const boltGradient = ctx.createLinearGradient(
      bx - 5,
      by - 5,
      bx + 5,
      by + 5,
    );
    boltGradient.addColorStop(0, rustLight);
    boltGradient.addColorStop(0.46, rust);
    boltGradient.addColorStop(1, rustDark);

    ctx.beginPath();
    ctx.arc(bx, by, 5.35, 0, Math.PI * 2);
    ctx.fillStyle = boltGradient;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(bx - 0.4, by - 0.5, 4.35, Math.PI * 1.04, Math.PI * 1.72);
    ctx.strokeStyle = env.rgba(wornMetal, 0.7);
    ctx.lineWidth = 1.55;
    ctx.stroke();

    const angle = boltAngles[i];
    const dx = Math.cos(angle) * 3.3;
    const dy = Math.sin(angle) * 3.3;
    strokePoly(
      [[bx - dx, by - dy], [bx + dx, by + dy]],
      env.rgba(inkDeep, 0.94),
      2.15,
    );
  }
}
