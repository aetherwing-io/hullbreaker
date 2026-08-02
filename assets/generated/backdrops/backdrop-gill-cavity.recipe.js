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
  const clamp = env.clamp;
  const rgba = (hex, alpha = 1) => env.rgba(hex, alpha);
  const rgb = (hex) => env.hexToRgb(hex);
  const smooth = (t) => env.smoothstep(clamp(t, 0, 1));

  const C = {
    inkDeep: env.shade(P.ink, -0.24),
    inkSoft: env.mix(P.ink, P.haze, 0.22),
    hazeDark: env.shade(P.haze, -0.28),
    hazeLight: env.shade(P.haze, 0.12),
    hullDark: env.shade(P.hull, -0.34),
    hullLight: env.shade(P.hull, 0.22),
    rustDeep: env.shade(P['rust-orange'], -0.5),
    rustDark: env.shade(P['rust-orange'], -0.29),
    rustLight: env.shade(P['rust-orange'], 0.24),
    rustPale: env.mix(P['rust-orange'], P.hull, 0.32),
    tealDeep: env.shade(P['deep-teal'], -0.48),
    tealDark: env.shade(P['deep-teal'], -0.2),
    tealFog: env.mix(P['deep-teal'], P.haze, 0.57),
    tealLight: env.shade(P['deep-teal'], 0.2),
  };

  function trace(points, close = true) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    if (close) ctx.closePath();
  }

  function fillPoly(points, style) {
    trace(points);
    ctx.fillStyle = style;
    ctx.fill();
  }

  function strokePath(points, style, width, close = false) {
    trace(points, close);
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.stroke();
  }

  function mixRgb(a, b, t) {
    return {
      r: Math.round(env.lerp(a.r, b.r, t)),
      g: Math.round(env.lerp(a.g, b.g, t)),
      b: Math.round(env.lerp(a.b, b.b, t)),
    };
  }

  function pointAlong(a, b, t) {
    return [
      env.lerp(a[0], b[0], t),
      env.lerp(a[1], b[1], t),
    ];
  }

  function insideConvex(x, y, points) {
    let positive = false;
    let negative = false;
    for (let i = 0; i < points.length; i += 1) {
      const a = points[i];
      const b = points[(i + 1) % points.length];
      const cross = (b[0] - a[0]) * (y - a[1]) -
        (b[1] - a[1]) * (x - a[0]);
      if (cross > 0.01) positive = true;
      if (cross < -0.01) negative = true;
      if (positive && negative) return false;
    }
    return true;
  }

  function seam(points, width = 5) {
    strokePath(points, rgba(C.inkDeep, 0.8), width);
    strokePath(
      points.map(([x, y]) => [x - 1.3, y - 1.5]),
      rgba(C.rustLight, 0.34),
      Math.max(1.1, width * 0.25),
    );
  }

  function bolt(x, y, radius, strength = 1) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = rgba(C.inkDeep, 0.92 * strength);
    ctx.fill();

    ctx.beginPath();
    ctx.arc(
      x - radius * 0.25,
      y - radius * 0.28,
      radius * 0.46,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = rgba(C.hullLight, 0.72 * strength);
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x - radius * 0.65, y + radius * 0.08);
    ctx.lineTo(x + radius * 0.58, y - radius * 0.12);
    ctx.strokeStyle = rgba(C.inkDeep, 0.88 * strength);
    ctx.lineWidth = Math.max(1, radius * 0.36);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = 'source-over';
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const outerLow = rgb(env.mix(C.inkDeep, C.rustDeep, 0.58));
  const outerMid = rgb(env.mix(C.hazeDark, P['rust-orange'], 0.67));
  const outerHigh = rgb(env.mix(P.hull, C.rustLight, 0.56));

  env.field((x, y, u, v) => {
    const broad = env.fbm(
      x * 0.145 + y * 0.018,
      y * 0.045,
      {
        octaves: 4,
        gain: 0.53,
        lacunarity: 2.04,
        period: 137,
        seed: meta.seed + 11,
      },
    );
    const lengthwise = env.noise(
      x * 0.35 + y * 0.012,
      y * 0.075,
      { period: 61, seed: meta.seed + 12 },
    );
    const key = 0.19 * (1 - u) + 0.21 * (1 - v) - 0.1 * u;
    const level = clamp(
      0.34 + (broad - 0.5) * 0.34 +
      (lengthwise - 0.5) * 0.1 + key,
      0.06,
      0.95,
    );
    const color = level < 0.58
      ? mixRgb(outerLow, outerMid, level / 0.58)
      : mixRgb(outerMid, outerHigh, (level - 0.58) / 0.42);
    return [color.r, color.g, color.b, 255];
  });

  fillPoly(
    [[70, 76], [206, 69], [207, 108], [83, 115]],
    rgba(C.rustLight, 0.075),
  );
  fillPoly(
    [[207, 69], [336, 72], [431, 67], [443, 102], [207, 108]],
    rgba(C.inkSoft, 0.1),
  );
  fillPoly(
    [[72, 398], [211, 385], [307, 390], [306, 438], [73, 441]],
    rgba(C.rustLight, 0.065),
  );
  fillPoly(
    [[307, 390], [440, 381], [441, 428], [306, 438]],
    rgba(C.inkSoft, 0.11),
  );

  const rustBleed = rgb(C.rustDark);
  env.field((x, y) => {
    if (x < 78 || x > 442 || y < 362 || y > 448) return null;
    const channel = env.ridge(
      x * 0.22,
      y * 0.017,
      {
        octaves: 3,
        gain: 0.56,
        lacunarity: 2.1,
        period: 83,
        seed: meta.seed + 21,
      },
    );
    const streak = Math.max(0, (channel - 0.51) / 0.49);
    const begins = smooth((y - 362) / 18);
    const tail = 1 - smooth((y - 376) / 72);
    const side = smooth((x - 78) / 28) * smooth((442 - x) / 28);
    const alpha = 92 * streak * begins * tail * side;
    if (alpha < 1) return null;
    return [rustBleed.r, rustBleed.g, rustBleed.b, alpha];
  }, { blend: 'over' });

  seam([[72, 84], [174, 80], [207, 87]], 5);
  seam([[303, 82], [373, 76], [440, 78]], 5);
  seam([[73, 425], [173, 418], [244, 424]], 5);
  seam([[315, 421], [438, 411]], 5);
  seam([[207, 70], [207, 104]], 4);
  seam([[336, 73], [337, 99]], 4);
  seam([[211, 399], [211, 438]], 4);
  seam([[307, 398], [306, 437]], 4);

  bolt(207, 84, 2.8, 0.72);
  bolt(337, 79, 2.8, 0.65);
  bolt(211, 421, 2.9, 0.7);
  bolt(307, 420, 2.9, 0.64);

  const outerWear = env.stream('outer-wear');
  for (let i = 0; i < 34; i += 1) {
    const upper = i < 17;
    const x = 80 + outerWear() * 350;
    const y = upper
      ? 79 + outerWear() * 17
      : 405 + outerWear() * 29;
    const length = 5 + outerWear() * 22;
    const rise = -0.5 - outerWear() * 1.7;
    strokePath(
      [[x, y], [Math.min(442, x + length), y + rise]],
      rgba(
        outerWear() > 0.48 ? C.rustLight : C.inkSoft,
        0.1 + outerWear() * 0.13,
      ),
      1 + outerWear() * 1.1,
    );
  }

  const outer = [[86, 102], [447, 92], [439, 380], [74, 394]];
  const opening = [[116, 140], [414, 130], [404, 344], [104, 356]];

  ctx.save();
  ctx.shadowColor = rgba(C.inkDeep, 0.78);
  ctx.shadowBlur = 18;
  ctx.shadowOffsetX = 7;
  ctx.shadowOffsetY = 10;
  fillPoly(outer, rgba(C.inkDeep, 0.82));
  ctx.restore();

  const cavityNear = rgb(env.mix(C.tealDark, P.haze, 0.61));
  const cavityMid = rgb(C.hazeDark);
  const cavityDeep = rgb(env.mix(C.inkDeep, C.tealDeep, 0.16));

  env.field((x, y) => {
    if (
      x < 103 || x > 415 || y < 129 || y > 357 ||
      !insideConvex(x, y, opening)
    ) {
      return null;
    }

    const nx = clamp((x - 104) / 310, 0, 1);
    const ny = clamp((356 - y) / 226, 0, 1);
    const mottle = env.fbm(
      x * 0.095,
      y * 0.042,
      {
        octaves: 3,
        gain: 0.55,
        lacunarity: 2.08,
        period: 91,
        seed: meta.seed + 31,
      },
    );
    const longGrain = env.noise(
      x * 0.23 + y * 0.03,
      y * 0.065,
      { period: 47, seed: meta.seed + 32 },
    );
    const depth = clamp(
      smooth(nx * 0.7 + ny * 0.3) +
      (mottle - 0.5) * 0.15 +
      (longGrain - 0.5) * 0.06,
      0,
      1,
    );
    const color = depth < 0.48
      ? mixRgb(cavityNear, cavityMid, depth / 0.48)
      : mixRgb(cavityMid, cavityDeep, (depth - 0.48) / 0.52);
    return [color.r, color.g, color.b, 255];
  });

  ctx.save();
  trace(opening);
  ctx.clip();

  for (let i = 0; i < 5; i += 1) {
    const x0 = 268 + i * 37;
    strokePath(
      [[x0, 124], [235 + i * 34, 362]],
      rgba(C.inkDeep, 0.3),
      9,
    );
    strokePath(
      [[x0 - 2, 126], [233 + i * 34, 358]],
      rgba(C.tealDark, 0.14),
      2,
    );
  }

  const dust = ctx.createRadialGradient(342, 188, 8, 342, 188, 156);
  dust.addColorStop(0, rgba(C.tealFog, 0.28));
  dust.addColorStop(0.48, rgba(C.hazeLight, 0.105));
  dust.addColorStop(1, rgba(C.tealFog, 0));
  ctx.fillStyle = dust;
  ctx.fillRect(102, 126, 316, 235);

  const dustStream = env.stream('deep-dust');
  for (let i = 0; i < 18; i += 1) {
    const x = 230 + dustStream() * 178;
    const y = 141 + dustStream() * 168;
    const length = 10 + dustStream() * 38;
    strokePath(
      [[x, y], [x + length, y - 4 - dustStream() * 9]],
      rgba(C.hazeLight, 0.035 + dustStream() * 0.045),
      2 + dustStream() * 4,
    );
  }

  ctx.restore();

  ctx.save();
  trace(opening);
  ctx.clip();

  const vaneWear = env.stream('vane-wear');
  for (let i = 6; i >= 0; i -= 1) {
    const xL = 108 - i * 0.6;
    const xR = 414 - i * 0.45;
    const yL = 151 + i * 27.6;
    const yR = 140 + i * 24.1;
    const thickL = 16 - i * 0.35;
    const thickR = 10.5 - i * 0.22;

    const shadow = [
      [xL, yL + thickL + 5],
      [xR, yR + thickR + 5],
      [xR, yR + thickR + 17],
      [xL, yL + thickL + 19],
    ];

    ctx.save();
    ctx.shadowColor = rgba(C.inkDeep, 0.72);
    ctx.shadowBlur = 5;
    ctx.shadowOffsetY = 3;
    fillPoly(shadow, rgba(C.inkDeep, 0.66));
    ctx.restore();

    const vane = [
      [xL, yL],
      [xR, yR],
      [xR, yR + thickR],
      [xL, yL + thickL],
    ];
    const face = ctx.createLinearGradient(xL, yL, xR, yR);
    face.addColorStop(0, rgba(C.rustPale, 1));
    face.addColorStop(0.18, rgba(P['rust-orange'], 1));
    face.addColorStop(0.61, rgba(C.hazeDark, 1));
    face.addColorStop(1, rgba(C.tealDeep, 1));
    fillPoly(vane, face);

    strokePath(
      [[xL, yL + thickL], [xR, yR + thickR]],
      rgba(C.inkDeep, 0.9),
      4.5,
    );

    const topLight = ctx.createLinearGradient(xL, yL, xR, yR);
    topLight.addColorStop(0, rgba(C.rustLight, 0.95));
    topLight.addColorStop(0.48, rgba(C.hullLight, 0.46));
    topLight.addColorStop(1, rgba(C.hazeLight, 0.12));
    strokePath([[xL, yL], [xR, yR]], topLight, 2.7);

    const slope = (yR - yL) / (xR - xL);
    for (let j = 0; j < 3; j += 1) {
      const sx = xL + 22 + vaneWear() * (xR - xL - 62);
      const ex = Math.min(xR - 12, sx + 8 + vaneWear() * 24);
      const offset = 3 + vaneWear() * Math.max(2, thickL - 7);
      const sy = yL + slope * (sx - xL) + offset;
      const ey = yL + slope * (ex - xL) + offset - vaneWear();
      strokePath(
        [[sx, sy], [ex, ey]],
        rgba(
          vaneWear() > 0.44 ? C.rustLight : C.inkSoft,
          0.12 + vaneWear() * 0.13,
        ),
        1 + vaneWear() * 0.85,
      );
    }

    const boltX = xL + 24;
    const boltY = yL +
      (yR - yL) * ((boltX - xL) / (xR - xL)) +
      thickL * 0.5;
    bolt(boltX, boltY, 3.1, 0.84);
  }

  ctx.restore();

  const topLip = [[86, 102], [447, 92], [414, 130], [116, 140]];
  const leftLip = [[86, 102], [116, 140], [104, 356], [74, 394]];
  const rightLip = [[447, 92], [439, 380], [404, 344], [414, 130]];
  const bottomLip = [[74, 394], [439, 380], [404, 344], [104, 356]];

  const topGradient = ctx.createLinearGradient(86, 102, 447, 92);
  topGradient.addColorStop(0, rgba(C.rustLight, 1));
  topGradient.addColorStop(0.42, rgba(P['rust-orange'], 1));
  topGradient.addColorStop(1, rgba(C.rustDark, 1));
  fillPoly(topLip, topGradient);

  const leftGradient = ctx.createLinearGradient(86, 102, 76, 394);
  leftGradient.addColorStop(0, rgba(C.rustLight, 1));
  leftGradient.addColorStop(0.48, rgba(P['rust-orange'], 1));
  leftGradient.addColorStop(1, rgba(C.rustDeep, 1));
  fillPoly(leftLip, leftGradient);

  const rightGradient = ctx.createLinearGradient(414, 130, 447, 92);
  rightGradient.addColorStop(0, rgba(C.hazeDark, 1));
  rightGradient.addColorStop(0.48, rgba(C.rustDeep, 1));
  rightGradient.addColorStop(1, rgba(C.rustDark, 1));
  fillPoly(rightLip, rightGradient);

  const bottomGradient = ctx.createLinearGradient(74, 394, 439, 380);
  bottomGradient.addColorStop(0, rgba(C.rustDark, 1));
  bottomGradient.addColorStop(0.48, rgba(P['rust-orange'], 1));
  bottomGradient.addColorStop(1, rgba(C.hazeDark, 1));
  fillPoly(bottomLip, bottomGradient);

  const lipLightRgb = rgb(C.rustLight);
  const lipDarkRgb = rgb(C.rustDeep);
  env.field((x, y) => {
    if (x < 72 || x > 449 || y < 90 || y > 396) return null;
    const onLip =
      insideConvex(x, y, topLip) ||
      insideConvex(x, y, leftLip) ||
      insideConvex(x, y, rightLip) ||
      insideConvex(x, y, bottomLip);
    if (!onLip) return null;

    const grain = env.fbm(
      x * 0.24 + y * 0.018,
      y * 0.064,
      {
        octaves: 3,
        gain: 0.54,
        lacunarity: 2.06,
        period: 73,
        seed: meta.seed + 51,
      },
    );
    const streak = env.noise(
      x * 0.39,
      y * 0.07,
      { period: 37, seed: meta.seed + 52 },
    );
    const light = grain > 0.52;
    const source = light ? lipLightRgb : lipDarkRgb;
    const alpha = 6 + Math.abs(grain - 0.5) * 30 +
      Math.abs(streak - 0.5) * 10;
    return [source.r, source.g, source.b, alpha];
  }, { blend: 'over' });

  strokePath(opening, rgba(C.inkDeep, 0.9), 9, true);
  strokePath([[86, 102], [447, 92]], rgba(C.rustLight, 0.95), 4);
  strokePath([[86, 102], [74, 394]], rgba(C.rustLight, 0.62), 3);
  strokePath([[116, 140], [414, 130]], rgba(C.rustPale, 0.72), 2.2);
  strokePath([[116, 140], [104, 356]], rgba(C.rustPale, 0.46), 2);
  strokePath([[74, 394], [439, 380]], rgba(C.inkDeep, 0.86), 5);
  strokePath([[447, 92], [439, 380]], rgba(C.inkDeep, 0.72), 4);

  for (const t of [0.17, 0.35, 0.55, 0.75]) {
    const a = pointAlong(topLip[0], topLip[1], t);
    const b = pointAlong(topLip[3], topLip[2], t);
    strokePath([a, b], rgba(C.inkDeep, 0.66), 3);
    strokePath(
      [[a[0] - 1, a[1] - 1], [b[0] - 1, b[1] - 1]],
      rgba(C.rustLight, 0.3),
      1,
    );
  }

  for (const t of [0.22, 0.46, 0.7]) {
    const a = pointAlong(bottomLip[0], bottomLip[1], t);
    const b = pointAlong(bottomLip[3], bottomLip[2], t);
    strokePath([a, b], rgba(C.inkDeep, 0.6), 3);
    strokePath(
      [[a[0] - 1, a[1] - 1], [b[0] - 1, b[1] - 1]],
      rgba(C.rustLight, 0.22),
      1,
    );
  }

  ctx.save();
  trace(topLip);
  ctx.clip();
  const lipWear = env.stream('lip-wear');
  for (let i = 0; i < 38; i += 1) {
    const x = 98 + lipWear() * 330;
    const y = 107 + lipWear() * 28 - (x - 98) * 0.027;
    const length = 5 + lipWear() * 25;
    strokePath(
      [[x, y], [x + length, y - 0.6 - lipWear() * 1.2]],
      rgba(
        lipWear() > 0.42 ? C.rustPale : C.inkDeep,
        0.12 + lipWear() * 0.2,
      ),
      1 + lipWear() * 1.2,
    );
  }
  ctx.restore();

  for (const t of [0.08, 0.23, 0.4, 0.58, 0.76, 0.92]) {
    const a = pointAlong(topLip[0], topLip[1], t);
    const b = pointAlong(topLip[3], topLip[2], t);
    bolt(
      (a[0] + b[0]) * 0.5,
      (a[1] + b[1]) * 0.5,
      3.8,
      1 - t * 0.28,
    );
  }

  for (const t of [0.18, 0.43, 0.69, 0.88]) {
    const a = pointAlong(leftLip[0], leftLip[3], t);
    const b = pointAlong(leftLip[1], leftLip[2], t);
    bolt(
      (a[0] + b[0]) * 0.5,
      (a[1] + b[1]) * 0.5,
      3.6,
      0.94,
    );
  }

  fillPoly(
    [[88, 103], [105, 103], [111, 112], [95, 116]],
    rgba(C.hullLight, 0.42),
  );
  fillPoly(
    [[77, 381], [91, 374], [99, 385], [84, 391]],
    rgba(C.rustLight, 0.32),
  );

  const ladderLeftTop = [151, 251];
  const ladderLeftBottom = [145, 357];
  const ladderRightTop = [172, 250];
  const ladderRightBottom = [166, 355];

  strokePath(
    [ladderLeftTop, ladderLeftBottom],
    rgba(C.inkDeep, 0.9),
    7,
  );
  strokePath(
    [ladderRightTop, ladderRightBottom],
    rgba(C.inkDeep, 0.9),
    7,
  );

  const ladderMetal = ctx.createLinearGradient(150, 250, 146, 357);
  ladderMetal.addColorStop(0, rgba(C.hullLight, 0.9));
  ladderMetal.addColorStop(0.55, rgba(C.rustPale, 0.94));
  ladderMetal.addColorStop(1, rgba(C.rustDark, 0.94));
  strokePath([ladderLeftTop, ladderLeftBottom], ladderMetal, 3);
  strokePath([ladderRightTop, ladderRightBottom], ladderMetal, 3);

  for (let y = 260; y <= 348; y += 11) {
    const t = (y - 251) / 106;
    const left = pointAlong(ladderLeftTop, ladderLeftBottom, t);
    const right = pointAlong(ladderRightTop, ladderRightBottom, t);
    strokePath([left, right], rgba(C.inkDeep, 0.88), 5);
    strokePath(
      [[left[0], left[1] - 1], [right[0], right[1] - 1]],
      rgba(C.hullLight, 0.7),
      2,
    );
  }

  fillPoly(
    [[178, 332], [202, 331], [190, 354]],
    rgba(C.inkDeep, 0.72),
  );
  fillPoly(
    [[285, 328], [311, 327], [298, 349]],
    rgba(C.inkDeep, 0.68),
  );
  fillPoly(
    [[365, 325], [389, 324], [378, 344]],
    rgba(C.inkDeep, 0.62),
  );

  const deck = [[110, 317], [406, 306], [407, 323], [109, 335]];
  const deckGradient = ctx.createLinearGradient(110, 317, 406, 306);
  deckGradient.addColorStop(0, rgba(C.rustPale, 1));
  deckGradient.addColorStop(0.46, rgba(C.hullDark, 1));
  deckGradient.addColorStop(1, rgba(C.hazeDark, 1));

  fillPoly(
    [[109, 327], [408, 316], [409, 334], [108, 346]],
    rgba(C.inkDeep, 0.84),
  );
  fillPoly(deck, deckGradient);
  strokePath(
    [[110, 317], [406, 306]],
    rgba(C.hullLight, 0.82),
    2.5,
  );
  strokePath(
    [[109, 335], [407, 323]],
    rgba(C.inkDeep, 0.9),
    4,
  );

  for (let i = 1; i < 17; i += 1) {
    const t = i / 17;
    const top = pointAlong(deck[0], deck[1], t);
    const bottom = pointAlong(deck[3], deck[2], t);
    strokePath([top, bottom], rgba(C.inkDeep, 0.54), 2);
    strokePath(
      [[top[0] - 1, top[1]], [bottom[0] - 1, bottom[1]]],
      rgba(C.rustLight, 0.16),
      1,
    );
  }

  const railTop = [[126, 288], [396, 279]];
  const railMid = [[124, 301], [398, 292]];
  const postTs = [0.04, 0.24, 0.45, 0.67, 0.9];

  strokePath(railTop, rgba(C.inkDeep, 0.9), 6);
  strokePath(railMid, rgba(C.inkDeep, 0.82), 5);

  for (const t of postTs) {
    const top = pointAlong(railTop[0], railTop[1], t);
    const deckTop = pointAlong(deck[0], deck[1], t);
    strokePath([top, deckTop], rgba(C.inkDeep, 0.88), 6);
  }

  const railMetal = ctx.createLinearGradient(126, 288, 396, 279);
  railMetal.addColorStop(0, rgba(C.hullLight, 0.9));
  railMetal.addColorStop(0.5, rgba(C.rustPale, 0.88));
  railMetal.addColorStop(1, rgba(C.hazeLight, 0.62));
  strokePath(railTop, railMetal, 2.8);
  strokePath(railMid, railMetal, 2.2);

  for (const t of postTs) {
    const top = pointAlong(railTop[0], railTop[1], t);
    const deckTop = pointAlong(deck[0], deck[1], t);
    strokePath([top, deckTop], railMetal, 2.5);
    bolt(deckTop[0], deckTop[1], 2.6, 0.82);
  }

  const lampGlow = ctx.createRadialGradient(173, 274, 1, 173, 274, 17);
  lampGlow.addColorStop(0, rgba(C.tealLight, 0.46));
  lampGlow.addColorStop(0.45, rgba(P['deep-teal'], 0.16));
  lampGlow.addColorStop(1, rgba(C.tealFog, 0));
  ctx.fillStyle = lampGlow;
  ctx.fillRect(155, 256, 36, 36);

  ctx.beginPath();
  ctx.arc(173, 274, 6, 0, Math.PI * 2);
  ctx.fillStyle = rgba(C.inkDeep, 0.95);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(172.5, 273.5, 3.3, 0, Math.PI * 2);
  ctx.fillStyle = rgba(C.tealLight, 0.96);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(171.4, 272.2, 1.15, 0, Math.PI * 2);
  ctx.fillStyle = rgba(C.hullLight, 0.92);
  ctx.fill();

  const atmosphere = rgb(C.tealFog);
  env.field((x, y, u, v) => {
    const distance = clamp(
      (u - 0.3) * 0.75 + (0.59 - v) * 0.4,
      0,
      1,
    );
    if (distance <= 0.015) return null;
    const veil = env.noise(
      x * 0.055,
      y * 0.05,
      { period: 67, seed: meta.seed + 71 },
    );
    const alpha = 5 + distance * 20 + (veil - 0.5) * 5;
    return [atmosphere.r, atmosphere.g, atmosphere.b, alpha];
  }, { blend: 'over' });

  env.mask((x, y) => {
    const shapeNoise = env.noise(
      x * 0.037 + 3.4,
      y * 0.033 + 7.1,
      { period: 79, seed: meta.seed + 81 },
    );
    const edgeShift = (shapeNoise - 0.5) * 5;

    const leftWidth = 52 + shapeNoise * 6;
    const topWidth = 53 + (1 - shapeNoise) * 7;
    const rightWidth = 68 + shapeNoise * 2;
    const bottomWidth = 66 + (1 - shapeNoise) * 4;

    const edgeFade = (distance, width) =>
      smooth((distance - 5) / (width - 5));

    const left = edgeFade(x + edgeShift, leftWidth);
    const right = edgeFade((W - 1 - x) - edgeShift, rightWidth);
    const top = edgeFade(y - edgeShift, topWidth);
    const bottom = edgeFade((H - 1 - y) + edgeShift, bottomWidth);

    let alpha = left * right * top * bottom;
    const dither = env.noise(
      x + 0.37,
      y + 0.71,
      { period: 7, seed: meta.seed + 82 },
    );

    if (alpha < 0.006 + dither * 0.004) return 0;
    if (alpha < 0.999) {
      alpha += (dither - 0.5) * (3 / 255);
    }
    return clamp(alpha, 0, 1);
  });
}
