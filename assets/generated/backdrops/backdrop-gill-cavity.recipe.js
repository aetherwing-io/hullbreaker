export const meta = {
  id: 'backdrop-gill-cavity',
  size: { w: 512, h: 512 },
  seed: 64351,
  roles: ['deep-teal', 'haze', 'hull', 'ink', 'rust-orange'],
};

export function render(ctx, env) {
  const W = env.width;
  const H = env.height;
  const P = env.PALETTE;
  const teal = P['deep-teal'];
  const haze = P.haze;
  const hull = P.hull;
  const ink = P.ink;
  const rust = P['rust-orange'];
  const clamp = env.clamp;
  const smooth = env.smoothstep;

  const rgb = (hex) => {
    const c = env.hexToRgb(hex);
    return [c.r, c.g, c.b];
  };

  const blend = (a, b, t) => {
    const k = clamp(t, 0, 1);
    return [
      a[0] + (b[0] - a[0]) * k,
      a[1] + (b[1] - a[1]) * k,
      a[2] + (b[2] - a[2]) * k,
    ];
  };

  const pixel = (c, a) => {
    const out = [
      Math.round(clamp(c[0], 0, 255)),
      Math.round(clamp(c[1], 0, 255)),
      Math.round(clamp(c[2], 0, 255)),
    ];
    if (a !== undefined) out.push(Math.round(clamp(a, 0, 255)));
    return out;
  };

  const trace = (points) => {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
  };

  const fillPoly = (points, fill) => {
    trace(points);
    ctx.fillStyle = fill;
    ctx.fill();
  };

  const strokeLine = (points, stroke, width) => {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  };

  const strokePoly = (points, stroke, width) => {
    trace(points);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.stroke();
  };

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const metal0 = rgb(env.shade(rust, -0.53));
  const metal1 = rgb(env.mix(env.shade(rust, -0.31), env.shade(hull, -0.34), 0.34));
  const metal2 = rgb(env.mix(env.shade(rust, -0.08), env.shade(hull, -0.14), 0.25));
  const fogNeutral = rgb(env.shade(haze, -0.18));
  const fogTeal = rgb(env.shade(teal, -0.19));

  env.field((x, y, u, v) => {
    const broad = env.fbm(
      x * 0.105 + y * 0.013,
      y * 0.052,
      {
        octaves: 4,
        gain: 0.52,
        lacunarity: 2.03,
        period: 192,
        seed: env.seed + 17,
      }
    );
    const striation = env.noise(
      x * 0.027,
      y * 0.235 + x * 0.008,
      { period: 128, seed: env.seed + 31 }
    );
    const directionalLight = (1 - u) * 0.19 + (1 - v) * 0.22;
    const grime = Math.max(0, striation - 0.62) * 0.25;
    const t = clamp(0.28 + broad * 0.48 + directionalLight - grime, 0, 1);

    let c = t < 0.5
      ? blend(metal0, metal1, t * 2)
      : blend(metal1, metal2, (t - 0.5) * 2);

    const edge = Math.max(Math.abs(u - 0.5) * 2, Math.abs(v - 0.5) * 2);
    const edgeFog = smooth(clamp((edge - 0.73) / 0.27, 0, 1));
    if (edgeFog > 0) {
      c = blend(c, fogNeutral, Math.min(1, edgeFog * 1.35));
      c = blend(c, fogTeal, Math.max(0, (edgeFog - 0.52) / 0.48) * 0.74);
    }
    return pixel(c);
  }, { blend: 'replace' });

  fillPoly(
    [[0, 0], [227, 0], [216, 66], [45, 60], [0, 86]],
    env.rgba(env.shade(rust, -0.24), 0.18)
  );
  fillPoly(
    [[227, 0], [512, 0], [512, 82], [469, 74], [216, 66]],
    env.rgba(env.shade(haze, -0.27), 0.18)
  );
  fillPoly(
    [[0, 86], [45, 60], [52, 447], [0, 466]],
    env.rgba(env.shade(rust, -0.42), 0.22)
  );
  fillPoly(
    [[469, 74], [512, 82], [512, 459], [453, 428]],
    env.rgba(env.shade(haze, -0.34), 0.25)
  );
  fillPoly(
    [[0, 466], [52, 447], [452, 429], [512, 459], [512, 512], [0, 512]],
    env.rgba(env.shade(rust, -0.39), 0.21)
  );

  const seam = (points) => {
    strokeLine(points, env.rgba(env.shade(ink, -0.18), 0.72), 7);
    const raised = points.map((p) => [p[0] - 1.6, p[1] - 1.6]);
    strokeLine(raised, env.rgba(env.shade(hull, -0.04), 0.23), 2.2);
  };

  seam([[0, 84], [46, 60], [216, 66], [227, 0]]);
  seam([[469, 74], [512, 82]]);
  seam([[31, 0], [45, 60]]);
  seam([[478, 0], [469, 74]]);
  seam([[0, 466], [52, 447]]);
  seam([[452, 429], [512, 459]]);
  seam([[22, 213], [48, 218]]);
  seam([[470, 218], [512, 211]]);
  seam([[24, 330], [50, 326]]);
  seam([[456, 323], [512, 333]]);

  const wallRng = env.stream('wall-surface');
  for (let i = 0; i < 52; i++) {
    const leftSide = wallRng() < 0.5;
    const x0 = leftSide ? wallRng() * 76 : 438 + wallRng() * 74;
    const y0 = 24 + wallRng() * 452;
    const length = 18 + wallRng() * 74;
    const tone = wallRng() < 0.58
      ? env.shade(ink, -0.05)
      : env.shade(rust, 0.04);
    strokeLine(
      [[x0, y0], [x0 + (leftSide ? 1 : -1) * length, y0 + (wallRng() - 0.5) * 5]],
      env.rgba(tone, 0.05 + wallRng() * 0.11),
      1.1 + wallRng() * 2.5
    );
  }

  const opening = [[91, 111], [433, 116], [417, 385], [98, 393]];
  const outer = [[43, 66], [468, 79], [451, 426], [49, 445]];

  fillPoly(outer, env.rgba(env.shade(ink, -0.37), 0.93));
  strokePoly(outer, env.rgba(env.shade(ink, -0.42), 0.66), 15);

  const cross = (a, b, x, y) =>
    (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);

  const insideOpening = (x, y) =>
    cross(opening[0], opening[1], x, y) >= 0 &&
    cross(opening[1], opening[2], x, y) >= 0 &&
    cross(opening[2], opening[3], x, y) >= 0 &&
    cross(opening[3], opening[0], x, y) >= 0;

  const cavityNear = rgb(env.shade(haze, -0.38));
  const cavityDeep = rgb(env.shade(ink, -0.58));
  const cavityCool = rgb(env.shade(teal, -0.48));

  env.field((x, y) => {
    if (!insideOpening(x, y)) return null;

    const nx = clamp((x - 94) / 337, 0, 1);
    const ny = clamp((y - 112) / 281, 0, 1);
    const n = env.fbm(
      x * 0.075,
      y * 0.083,
      {
        octaves: 3,
        gain: 0.5,
        lacunarity: 2.08,
        period: 144,
        seed: env.seed + 103,
      }
    );

    const depth = clamp(0.12 + nx * 0.55 + ny * 0.26 + (n - 0.5) * 0.16, 0, 1);
    let c = blend(cavityNear, cavityDeep, depth);
    c = blend(c, cavityCool, 0.07 + nx * 0.11);

    const dustDistance = Math.hypot((x - 340) / 170, (y - 288) / 130);
    const dust = smooth(clamp(1 - dustDistance, 0, 1));
    c = blend(c, cavityNear, dust * 0.09);
    return pixel(c);
  }, { blend: 'replace' });

  ctx.save();
  trace(opening);
  ctx.clip();

  const backRibDark = env.rgba(env.shade(ink, -0.28), 0.58);
  const backRibLight = env.rgba(env.shade(haze, -0.28), 0.27);

  for (let i = 0; i < 4; i++) {
    const x = 142 + i * 76;
    ctx.beginPath();
    ctx.moveTo(x, 102);
    ctx.bezierCurveTo(x - 13, 190, x + 20, 287, x - 5, 402);
    ctx.strokeStyle = backRibDark;
    ctx.lineWidth = 15;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - 3, 102);
    ctx.bezierCurveTo(x - 16, 190, x + 17, 287, x - 8, 402);
    ctx.strokeStyle = backRibLight;
    ctx.lineWidth = 3;
    ctx.stroke();
  }

  for (let i = 0; i < 5; i++) {
    const y = 147 + i * 51;
    strokeLine(
      [[91, y + 12], [433, y - 8]],
      env.rgba(env.shade(ink, -0.16), 0.34),
      6
    );
    strokeLine(
      [[94, y + 8], [430, y - 12]],
      env.rgba(env.shade(haze, -0.35), 0.15),
      2
    );
  }

  const dustGlow = ctx.createRadialGradient(344, 291, 4, 344, 291, 176);
  dustGlow.addColorStop(0, env.rgba(env.shade(teal, -0.06), 0.16));
  dustGlow.addColorStop(0.48, env.rgba(env.shade(teal, -0.19), 0.08));
  dustGlow.addColorStop(1, env.rgba(teal, 0));
  ctx.fillStyle = dustGlow;
  ctx.fillRect(80, 100, 370, 300);
  ctx.restore();

  const bolt = (x, y, r, warm = true) => {
    ctx.beginPath();
    ctx.arc(x + 1.2, y + 1.5, r + 1.1, 0, Math.PI * 2);
    ctx.fillStyle = env.rgba(env.shade(ink, -0.3), 0.82);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = warm
      ? env.mix(env.shade(rust, -0.08), env.shade(hull, -0.16), 0.34)
      : env.shade(haze, -0.07);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(x - r * 0.32, y - r * 0.34, Math.max(0.9, r * 0.29), 0, Math.PI * 2);
    ctx.fillStyle = env.rgba(env.shade(hull, 0.18), 0.62);
    ctx.fill();

    strokeLine(
      [[x - r * 0.55, y], [x + r * 0.55, y]],
      env.rgba(env.shade(ink, -0.12), 0.7),
      1.2
    );
  };

  const vaneRng = env.stream('louvre-surfaces');
  const vaneCount = 8;

  for (let i = 0; i < vaneCount; i++) {
    const front = i / (vaneCount - 1);
    const y = 128 + i * 31;
    const xl = 108 + front * 7;
    const xr = 417 - front * 5;
    const topDrop = -11 + front * 2;

    const shadow = [
      [xl + 3, y + 19],
      [xr - 5, y + topDrop + 20],
      [xr - 8, y + topDrop + 42],
      [xl + 4, y + 42],
    ];
    const shadowGradient = ctx.createLinearGradient(0, y + 15, 0, y + 45);
    shadowGradient.addColorStop(0, env.rgba(env.shade(ink, -0.44), 0.86));
    shadowGradient.addColorStop(0.52, env.rgba(env.shade(ink, -0.28), 0.48));
    shadowGradient.addColorStop(1, env.rgba(ink, 0));
    fillPoly(shadow, shadowGradient);

    const underside = [
      [xl + 5, y + 18],
      [xr - 6, y + topDrop + 17],
      [xr - 9, y + topDrop + 28],
      [xl + 7, y + 29],
    ];
    const undersideGradient = ctx.createLinearGradient(xl, y, xr, y);
    undersideGradient.addColorStop(0, env.shade(rust, -0.48));
    undersideGradient.addColorStop(0.48, env.shade(haze, -0.43));
    undersideGradient.addColorStop(1, env.shade(ink, -0.49));
    fillPoly(underside, undersideGradient);

    const vane = [
      [xl, y],
      [xr, y + topDrop],
      [xr - 6, y + topDrop + 18],
      [xl + 5, y + 23],
    ];

    const leftTone = env.mix(
      env.shade(rust, -0.18 + front * 0.12),
      env.shade(haze, -0.15),
      0.36 - front * 0.16
    );
    const midTone = env.mix(
      env.shade(rust, -0.32 + front * 0.08),
      env.shade(haze, -0.24),
      0.43
    );
    const rightTone = env.mix(
      env.shade(haze, -0.34),
      env.shade(ink, -0.22),
      0.56
    );

    const vaneGradient = ctx.createLinearGradient(xl, y, xr, y + topDrop);
    vaneGradient.addColorStop(0, leftTone);
    vaneGradient.addColorStop(0.43, midTone);
    vaneGradient.addColorStop(1, rightTone);
    fillPoly(vane, vaneGradient);

    ctx.save();
    trace(vane);
    ctx.clip();

    for (let k = 0; k < 11; k++) {
      const sx = xl - 4 + vaneRng() * 105;
      const length = 42 + vaneRng() * 170;
      const ex = Math.min(xr + 8, sx + length);
      const sy = y - 2 + vaneRng() * 29;
      const tonePick = vaneRng();
      const tone = tonePick < 0.48
        ? env.shade(ink, -0.08)
        : tonePick < 0.78
          ? env.shade(rust, 0.07)
          : env.shade(hull, -0.12);
      strokeLine(
        [[sx, sy], [ex, sy - (ex - sx) * 0.031 + (vaneRng() - 0.5) * 2]],
        env.rgba(tone, 0.06 + vaneRng() * 0.17),
        0.9 + vaneRng() * 2.5
      );
    }

    for (let k = 0; k < 4; k++) {
      const bx = xl + 18 + vaneRng() * (xr - xl - 45);
      const by = y + 4 + vaneRng() * 15;
      ctx.beginPath();
      ctx.ellipse(
        bx,
        by,
        5 + vaneRng() * 16,
        1.5 + vaneRng() * 4,
        -0.04,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = env.rgba(
        vaneRng() < 0.62 ? env.shade(ink, -0.1) : env.shade(rust, 0.08),
        0.04 + vaneRng() * 0.09
      );
      ctx.fill();
    }

    for (let k = 0; k < 4; k++) {
      const t = 0.08 + vaneRng() * 0.78;
      const cx = xl + (xr - xl) * t;
      const cy = y + topDrop * t;
      ctx.fillStyle = env.rgba(
        vaneRng() < 0.65 ? env.shade(hull, 0.05) : env.shade(rust, 0.18),
        0.3 + vaneRng() * 0.24
      );
      ctx.fillRect(cx, cy - 0.7, 3 + vaneRng() * 7, 1.7 + vaneRng() * 1.5);
    }
    ctx.restore();

    strokeLine(
      [[xl + 1, y - 0.7], [xr - 1, y + topDrop - 0.7]],
      env.rgba(
        env.mix(env.shade(rust, 0.22), env.shade(hull, 0.08), 0.31),
        0.6 - front * 0.12
      ),
      2.4
    );
    strokeLine(
      [[xl + 5, y + 23], [xr - 6, y + topDrop + 18]],
      env.rgba(env.shade(ink, -0.31), 0.84),
      3.2
    );

    bolt(xl + 28 + (i % 3) * 12, y + 9, 2.8, true);
    if (i % 2 === 1) {
      const bx = 349 + (i % 3) * 13;
      const bt = (bx - xl) / (xr - xl);
      bolt(bx, y + topDrop * bt + 7, 2.5, false);
    }
  }

  const cavityFog = rgb(env.mix(env.shade(teal, -0.24), env.shade(haze, -0.22), 0.55));
  env.field((x, y) => {
    if (!insideOpening(x, y)) return null;
    const nx = clamp((x - 96) / 335, 0, 1);
    const depth = smooth(clamp((nx - 0.37) / 0.63, 0, 1));
    const dust = env.noise(
      x * 0.055,
      y * 0.061,
      { period: 112, seed: env.seed + 307 }
    );
    const alpha = depth * (0.12 + dust * 0.12);
    return pixel(cavityFog, alpha * 255);
  }, { blend: 'over' });

  ctx.save();
  trace(opening);
  ctx.clip();

  let occ = ctx.createLinearGradient(0, 108, 0, 158);
  occ.addColorStop(0, env.rgba(env.shade(ink, -0.36), 0.82));
  occ.addColorStop(1, env.rgba(ink, 0));
  ctx.fillStyle = occ;
  ctx.fillRect(80, 105, 370, 58);

  occ = ctx.createLinearGradient(88, 0, 133, 0);
  occ.addColorStop(0, env.rgba(env.shade(ink, -0.38), 0.74));
  occ.addColorStop(1, env.rgba(ink, 0));
  ctx.fillStyle = occ;
  ctx.fillRect(86, 105, 52, 292);

  occ = ctx.createLinearGradient(365, 0, 435, 0);
  occ.addColorStop(0, env.rgba(ink, 0));
  occ.addColorStop(1, env.rgba(env.shade(ink, -0.46), 0.82));
  ctx.fillStyle = occ;
  ctx.fillRect(360, 105, 80, 292);

  occ = ctx.createLinearGradient(0, 347, 0, 394);
  occ.addColorStop(0, env.rgba(ink, 0));
  occ.addColorStop(1, env.rgba(env.shade(ink, -0.43), 0.7));
  ctx.fillStyle = occ;
  ctx.fillRect(86, 344, 356, 54);
  ctx.restore();

  const bleedRng = env.stream('rust-bleed');
  ctx.lineCap = 'round';
  for (let i = 0; i < 31; i++) {
    const x = 71 + bleedRng() * 381;
    const y0 = 397 + bleedRng() * 26;
    const length = 17 + Math.pow(bleedRng(), 1.7) * 96;
    const drift = (bleedRng() - 0.5) * 13;
    const width = 1.4 + bleedRng() * 5.4;

    ctx.beginPath();
    ctx.moveTo(x, y0);
    ctx.bezierCurveTo(
      x + drift * 0.2,
      y0 + length * 0.32,
      x + drift,
      y0 + length * 0.67,
      x + drift * 0.72,
      y0 + length
    );
    ctx.strokeStyle = env.rgba(
      bleedRng() < 0.74 ? env.shade(rust, -0.12) : env.shade(ink, -0.05),
      0.055 + bleedRng() * 0.16
    );
    ctx.lineWidth = width;
    ctx.stroke();

    if (bleedRng() > 0.42) {
      ctx.strokeStyle = env.rgba(env.shade(rust, 0.11), 0.07 + bleedRng() * 0.12);
      ctx.lineWidth = Math.max(1, width * 0.25);
      ctx.stroke();
    }
  }

  const topLip = [[43, 66], [468, 79], [433, 117], [91, 111]];
  const leftLip = [[43, 66], [91, 111], [98, 393], [49, 445]];
  const rightLip = [[468, 79], [451, 426], [417, 385], [433, 117]];
  const bottomLip = [[98, 393], [417, 385], [451, 426], [49, 445]];

  let g = ctx.createLinearGradient(45, 65, 454, 120);
  g.addColorStop(0, env.shade(rust, 0.2));
  g.addColorStop(0.31, env.shade(rust, -0.02));
  g.addColorStop(0.73, env.mix(env.shade(rust, -0.19), env.shade(haze, -0.15), 0.28));
  g.addColorStop(1, env.mix(env.shade(rust, -0.31), env.shade(haze, -0.25), 0.56));
  fillPoly(topLip, g);

  g = ctx.createLinearGradient(43, 70, 102, 434);
  g.addColorStop(0, env.shade(rust, 0.12));
  g.addColorStop(0.43, env.shade(rust, -0.14));
  g.addColorStop(1, env.mix(env.shade(rust, -0.35), env.shade(haze, -0.25), 0.32));
  fillPoly(leftLip, g);

  g = ctx.createLinearGradient(430, 100, 454, 426);
  g.addColorStop(0, env.mix(env.shade(rust, -0.28), env.shade(haze, -0.23), 0.44));
  g.addColorStop(0.55, env.shade(haze, -0.36));
  g.addColorStop(1, env.mix(env.shade(haze, -0.42), env.shade(ink, -0.18), 0.35));
  fillPoly(rightLip, g);

  g = ctx.createLinearGradient(66, 390, 438, 429);
  g.addColorStop(0, env.shade(rust, -0.08));
  g.addColorStop(0.43, env.shade(rust, -0.23));
  g.addColorStop(1, env.mix(env.shade(rust, -0.35), env.shade(haze, -0.29), 0.43));
  fillPoly(bottomLip, g);

  const frameRng = env.stream('frame-grain');
  const panelTexture = (points, x0, y0, x1, y1, direction, count) => {
    ctx.save();
    trace(points);
    ctx.clip();

    for (let i = 0; i < count; i++) {
      const pick = frameRng();
      const tone = pick < 0.48
        ? env.shade(ink, -0.06)
        : pick < 0.82
          ? env.shade(rust, 0.1)
          : env.shade(hull, -0.08);

      if (direction === 'horizontal') {
        const x = x0 + frameRng() * (x1 - x0);
        const y = y0 + frameRng() * (y1 - y0);
        const len = 22 + frameRng() * 118;
        strokeLine(
          [[x, y], [x + len, y + (frameRng() - 0.5) * 4]],
          env.rgba(tone, 0.045 + frameRng() * 0.13),
          0.9 + frameRng() * 2.8
        );
      } else {
        const x = x0 + frameRng() * (x1 - x0);
        const y = y0 + frameRng() * (y1 - y0);
        const len = 17 + frameRng() * 88;
        strokeLine(
          [[x, y], [x + (frameRng() - 0.5) * 4, y + len]],
          env.rgba(tone, 0.045 + frameRng() * 0.13),
          0.9 + frameRng() * 2.8
        );
      }
    }

    for (let i = 0; i < Math.max(4, Math.floor(count / 5)); i++) {
      const x = x0 + frameRng() * (x1 - x0);
      const y = y0 + frameRng() * (y1 - y0);
      ctx.beginPath();
      ctx.ellipse(
        x,
        y,
        4 + frameRng() * 19,
        2 + frameRng() * 7,
        direction === 'horizontal' ? 0 : 1.5,
        0,
        Math.PI * 2
      );
      ctx.fillStyle = env.rgba(
        frameRng() < 0.66 ? env.shade(ink, -0.08) : env.shade(rust, 0.09),
        0.04 + frameRng() * 0.09
      );
      ctx.fill();
    }
    ctx.restore();
  };

  panelTexture(topLip, 38, 63, 472, 119, 'horizontal', 34);
  panelTexture(leftLip, 38, 61, 105, 450, 'vertical', 29);
  panelTexture(rightLip, 414, 76, 474, 432, 'vertical', 25);
  panelTexture(bottomLip, 45, 382, 456, 451, 'horizontal', 34);

  fillPoly(
    [[43, 66], [468, 79], [460, 89], [50, 76]],
    env.rgba(env.shade(rust, 0.22), 0.36)
  );
  fillPoly(
    [[43, 66], [55, 77], [61, 427], [49, 445]],
    env.rgba(env.shade(rust, 0.12), 0.28)
  );

  strokeLine(
    [[43, 65], [468, 78]],
    env.rgba(env.mix(env.shade(rust, 0.28), env.shade(hull, 0.12), 0.26), 0.78),
    4.2
  );
  strokeLine(
    [[91, 112], [433, 117]],
    env.rgba(env.shade(ink, -0.42), 0.92),
    8
  );
  strokeLine(
    [[92, 108.5], [433, 113.5]],
    env.rgba(env.shade(rust, 0.17), 0.6),
    2.5
  );
  strokeLine(
    [[43, 66], [91, 111], [98, 393]],
    env.rgba(env.mix(env.shade(rust, 0.22), env.shade(hull, 0.08), 0.3), 0.62),
    3.2
  );
  strokeLine(
    [[91, 111], [98, 393]],
    env.rgba(env.shade(ink, -0.39), 0.86),
    7
  );
  strokeLine(
    [[433, 117], [417, 385]],
    env.rgba(env.shade(ink, -0.43), 0.9),
    7
  );
  strokeLine(
    [[98, 393], [417, 385]],
    env.rgba(env.mix(env.shade(rust, 0.16), env.shade(hull, -0.02), 0.24), 0.7),
    4
  );
  strokeLine(
    [[49, 445], [451, 426]],
    env.rgba(env.shade(ink, -0.3), 0.65),
    5
  );

  for (let i = 0; i < 9; i++) {
    const t = (i + 0.55) / 9;
    bolt(48 + (468 - 48) * t, 70 + 13 * t, 3.2, true);
  }
  for (let i = 0; i < 6; i++) {
    const t = (i + 0.65) / 6;
    bolt(57 + 35 * t, 77 + 337 * t, 3.3, true);
  }
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.7) / 5;
    bolt(460 - 33 * t, 101 + 294 * t, 3.1, false);
  }
  for (let i = 0; i < 8; i++) {
    const t = (i + 0.55) / 8;
    bolt(60 + 382 * t, 432 - 16 * t, 3.3, true);
  }

  const chipRng = env.stream('lip-wear');
  for (let i = 0; i < 28; i++) {
    const onTop = chipRng() < 0.56;
    if (onTop) {
      const x = 56 + chipRng() * 392;
      const y = 72 + (x - 56) * 0.03;
      strokeLine(
        [[x, y], [x + 3 + chipRng() * 10, y + (chipRng() - 0.5) * 2]],
        env.rgba(env.shade(hull, 0.07), 0.24 + chipRng() * 0.3),
        1.3 + chipRng() * 1.8
      );
    } else {
      const x = 70 + chipRng() * 363;
      const y = 407 + (chipRng() - 0.5) * 27;
      strokeLine(
        [[x, y], [x + 4 + chipRng() * 11, y - chipRng() * 2]],
        env.rgba(env.shade(rust, 0.19), 0.2 + chipRng() * 0.28),
        1.2 + chipRng() * 2
      );
    }
  }

  const ladderDark = env.rgba(env.shade(ink, -0.35), 0.9);
  const ladderMetal = env.mix(
    env.shade(hull, -0.19),
    env.shade(rust, -0.16),
    0.45
  );
  const ladderLight = env.mix(
    env.shade(hull, 0.14),
    env.shade(rust, 0.15),
    0.34
  );

  strokeLine([[148, 278], [141, 423]], ladderDark, 8);
  strokeLine([[177, 277], [170, 421]], ladderDark, 8);
  strokeLine([[147, 277], [140, 422]], env.rgba(ladderMetal, 0.96), 4.1);
  strokeLine([[176, 276], [169, 420]], env.rgba(ladderMetal, 0.96), 4.1);
  strokeLine([[145.7, 276], [138.7, 421]], env.rgba(ladderLight, 0.52), 1.5);
  strokeLine([[174.7, 275], [167.7, 419]], env.rgba(ladderLight, 0.52), 1.5);

  for (let y = 289; y <= 410; y += 17) {
    const t = (y - 278) / 145;
    const lx = 148 + (141 - 148) * t;
    const rx = 177 + (170 - 177) * t;
    strokeLine([[lx, y], [rx, y - 0.5]], ladderDark, 6);
    strokeLine(
      [[lx + 0.4, y - 1], [rx - 0.4, y - 1.5]],
      env.rgba(ladderMetal, 0.98),
      2.8
    );
    strokeLine(
      [[lx + 1, y - 2], [rx - 1, y - 2.5]],
      env.rgba(ladderLight, 0.42),
      1
    );
  }

  ctx.beginPath();
  ctx.moveTo(148, 279);
  ctx.quadraticCurveTo(146, 270, 154, 267);
  ctx.strokeStyle = ladderDark;
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.strokeStyle = env.rgba(ladderMetal, 0.98);
  ctx.lineWidth = 3.4;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(177, 278);
  ctx.quadraticCurveTo(179, 269, 171, 266);
  ctx.strokeStyle = ladderDark;
  ctx.lineWidth = 7;
  ctx.stroke();
  ctx.strokeStyle = env.rgba(ladderMetal, 0.98);
  ctx.lineWidth = 3.4;
  ctx.stroke();

  const deckTopY = (x) => 346 - ((x - 72) / 371) * 9;
  const deckShadow = [[72, 353], [445, 344], [449, 363], [76, 373]];
  fillPoly(deckShadow, env.rgba(env.shade(ink, -0.4), 0.92));

  const deck = [[71, 344], [443, 335], [446, 350], [74, 360]];
  g = ctx.createLinearGradient(70, 340, 445, 350);
  g.addColorStop(0, env.mix(env.shade(rust, -0.04), env.shade(hull, -0.12), 0.28));
  g.addColorStop(0.52, env.shade(rust, -0.18));
  g.addColorStop(1, env.mix(env.shade(rust, -0.34), env.shade(haze, -0.24), 0.43));
  fillPoly(deck, g);

  const deckRng = env.stream('walkway-grain');
  ctx.save();
  trace(deck);
  ctx.clip();
  for (let i = 0; i < 27; i++) {
    const x = 70 + deckRng() * 372;
    const y = 337 + deckRng() * 24;
    strokeLine(
      [[x, y], [x + 18 + deckRng() * 72, y - 1 - deckRng() * 2]],
      env.rgba(
        deckRng() < 0.58 ? env.shade(ink, -0.06) : env.shade(hull, 0.06),
        0.07 + deckRng() * 0.15
      ),
      1 + deckRng() * 2.2
    );
  }
  ctx.restore();

  strokeLine(
    [[71, 343.5], [443, 334.5]],
    env.rgba(env.mix(env.shade(hull, 0.13), env.shade(rust, 0.17), 0.45), 0.78),
    3.2
  );
  strokeLine(
    [[74, 360], [446, 350]],
    env.rgba(env.shade(ink, -0.34), 0.86),
    4.2
  );

  for (let x = 103; x < 438; x += 48) {
    const y = deckTopY(x);
    strokeLine(
      [[x, y], [x + 1, y + 15]],
      env.rgba(env.shade(ink, -0.3), 0.78),
      3.1
    );
    strokeLine(
      [[x - 1, y + 1], [x, y + 13]],
      env.rgba(env.shade(rust, 0.1), 0.42),
      1
    );
    bolt(x + 5, y + 7, 2.2, true);
  }

  for (let x = 95; x <= 410; x += 63) {
    const y = deckTopY(x);
    strokeLine(
      [[x, y + 14], [x + 23, y + 34], [x + 42, y + 13]],
      env.rgba(env.shade(ink, -0.34), 0.78),
      5
    );
    strokeLine(
      [[x, y + 12], [x + 23, y + 30], [x + 42, y + 11]],
      env.rgba(env.shade(rust, -0.22), 0.62),
      2.2
    );
  }

  const railDark = env.rgba(env.shade(ink, -0.38), 0.92);
  const railMetal = env.mix(
    env.shade(hull, -0.2),
    env.shade(rust, -0.17),
    0.42
  );
  const railLight = env.mix(
    env.shade(hull, 0.14),
    env.shade(rust, 0.16),
    0.31
  );

  const posts = [84, 126, 210, 258, 306, 354, 402, 438];
  for (const x of posts) {
    const deckY = deckTopY(x);
    strokeLine([[x, deckY + 1], [x, deckY - 31]], railDark, 6.5);
    strokeLine(
      [[x - 0.8, deckY], [x - 0.8, deckY - 31]],
      env.rgba(railMetal, 0.98),
      3.2
    );
    strokeLine(
      [[x - 1.7, deckY - 1], [x - 1.7, deckY - 30]],
      env.rgba(railLight, 0.52),
      1.1
    );
    bolt(x, deckY - 1, 2.4, true);
  }

  const railSegment = (x0, x1, height) => {
    const y0 = deckTopY(x0) - height;
    const y1 = deckTopY(x1) - height;
    strokeLine([[x0, y0], [x1, y1]], railDark, 6.2);
    strokeLine(
      [[x0, y0 - 1.2], [x1, y1 - 1.2]],
      env.rgba(railMetal, 0.98),
      3
    );
    strokeLine(
      [[x0, y0 - 2.1], [x1, y1 - 2.1]],
      env.rgba(railLight, 0.58),
      1.1
    );
  };

  railSegment(74, 139, 31);
  railSegment(192, 444, 31);
  railSegment(76, 139, 16);
  railSegment(192, 442, 16);

  const lampX = 402;
  const lampY = deckTopY(lampX) - 21;
  const lampGlow = ctx.createRadialGradient(lampX, lampY, 1, lampX, lampY, 28);
  lampGlow.addColorStop(0, env.rgba(env.shade(rust, 0.27), 0.34));
  lampGlow.addColorStop(0.45, env.rgba(rust, 0.12));
  lampGlow.addColorStop(1, env.rgba(rust, 0));
  ctx.fillStyle = lampGlow;
  ctx.fillRect(lampX - 30, lampY - 30, 60, 60);

  fillPoly(
    [
      [lampX - 8, lampY - 10],
      [lampX + 7, lampY - 10],
      [lampX + 9, lampY + 10],
      [lampX - 9, lampY + 10],
    ],
    env.shade(ink, -0.2)
  );
  strokePoly(
    [
      [lampX - 8, lampY - 10],
      [lampX + 7, lampY - 10],
      [lampX + 9, lampY + 10],
      [lampX - 9, lampY + 10],
    ],
    env.rgba(env.shade(hull, -0.05), 0.62),
    2
  );
  ctx.fillStyle = env.shade(rust, 0.31);
  ctx.fillRect(lampX - 4, lampY - 6, 8, 12);
  ctx.fillStyle = env.rgba(env.shade(hull, 0.27), 0.72);
  ctx.fillRect(lampX - 3, lampY - 5, 2.5, 8);

  const finalFog = rgb(env.mix(env.shade(teal, -0.08), env.shade(haze, -0.12), 0.33));
  env.field((x, y, u, v) => {
    const edge = Math.max(Math.abs(u - 0.5) * 2, Math.abs(v - 0.5) * 2);
    const border = smooth(clamp((edge - 0.77) / 0.23, 0, 1));
    const lowFog = smooth(clamp((v - 0.86) / 0.14, 0, 1)) * 0.1;
    if (border <= 0 && lowFog <= 0) return null;

    const dither = env.noise(
      x * 0.12,
      y * 0.12,
      { period: 96, seed: env.seed + 811 }
    );
    const alpha = clamp(border * 0.44 + lowFog + (dither - 0.5) * 0.025, 0, 0.55);
    return pixel(finalFog, alpha * 255);
  }, { blend: 'over' });
}
