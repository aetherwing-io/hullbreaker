export const meta = {
  id: 'backdrop-limb-segment',
  size: { w: 1024, h: 512 },
  seed: 803450,
  roles: ['deep-teal', 'haze', 'ink', 'hull', 'rust-orange', 'warm-white'],
};

export function render(ctx, env) {
  const P = env.PALETTE;
  const deep = P['deep-teal'];
  const haze = P.haze;
  const ink = P.ink;
  const hull = P.hull;
  const rust = P['rust-orange'];
  const warm = P['warm-white'];

  const clamp01 = (v) => env.clamp(v, 0, 1);
  const smooth = (v) => {
    v = clamp01(v);
    return v * v * (3 - 2 * v);
  };
  const rgb = (hex) => env.hexToRgb(hex);
  const mixRgb = (a, b, t) => {
    t = clamp01(t);
    return {
      r: env.lerp(a.r, b.r, t),
      g: env.lerp(a.g, b.g, t),
      b: env.lerp(a.b, b.b, t),
    };
  };

  const bgDarkHex = env.mix(deep, ink, 0.16);
  const bgMidHex = env.mix(deep, haze, 0.28);
  const bgLightHex = env.mix(deep, hull, 0.21);
  const bgDark = rgb(bgDarkHex);
  const bgMid = rgb(bgMidHex);
  const bgLight = rgb(bgLightHex);

  env.field((x, y, u, v) => {
    const cloud = env.fbm(x, y, {
      octaves: 4,
      gain: 0.51,
      lacunarity: 2.03,
      period: 430,
      seed: env.seed + 17,
    });
    const longVeil = env.noise(x * 0.3 + y * 0.08, y * 1.35, {
      period: 210,
      seed: env.seed + 29,
    });
    const fine = env.noise(x * 3.1, y * 3.1, {
      period: 47,
      seed: env.seed + 37,
    });

    let light = 0.42 + 0.21 * (1 - v) + 0.08 * (1 - u);
    light += (cloud - 0.5) * 0.22;
    light += (longVeil - 0.5) * 0.07;
    light = clamp01(light);

    let c = light < 0.5
      ? mixRgb(bgDark, bgMid, light * 2)
      : mixRgb(bgMid, bgLight, (light - 0.5) * 2);

    const dither = (fine - 0.5) * 2.2;
    return [
      env.clamp(c.r + dither, 0, 255),
      env.clamp(c.g + dither, 0, 255),
      env.clamp(c.b + dither, 0, 255),
      255,
    ];
  });

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.filter = 'blur(12px)';

  ctx.strokeStyle = env.rgba(env.mix(deep, ink, 0.25), 0.14);
  ctx.lineWidth = 92;
  ctx.beginPath();
  ctx.moveTo(-90, 122);
  ctx.bezierCurveTo(105, 20, 235, 232, 445, 148);
  ctx.bezierCurveTo(614, 82, 650, -52, 742, -96);
  ctx.stroke();

  ctx.strokeStyle = env.rgba(env.mix(deep, haze, 0.52), 0.17);
  ctx.lineWidth = 62;
  ctx.beginPath();
  ctx.moveTo(-80, 120);
  ctx.bezierCurveTo(108, 42, 240, 220, 438, 145);
  ctx.bezierCurveTo(596, 84, 642, -42, 731, -88);
  ctx.stroke();

  ctx.strokeStyle = env.rgba(env.mix(deep, ink, 0.2), 0.12);
  ctx.lineWidth = 104;
  ctx.beginPath();
  ctx.moveTo(520, 598);
  ctx.bezierCurveTo(568, 425, 700, 386, 815, 455);
  ctx.bezierCurveTo(933, 524, 990, 408, 1108, 332);
  ctx.stroke();

  ctx.strokeStyle = env.rgba(env.mix(deep, haze, 0.46), 0.14);
  ctx.lineWidth = 69;
  ctx.beginPath();
  ctx.moveTo(535, 580);
  ctx.bezierCurveTo(586, 438, 693, 406, 803, 467);
  ctx.bezierCurveTo(921, 532, 985, 406, 1098, 340);
  ctx.stroke();

  ctx.strokeStyle = env.rgba(env.mix(deep, ink, 0.18), 0.14);
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.ellipse(755, 348, 132, 105, -0.34, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = env.rgba(env.mix(deep, hull, 0.16), 0.07);
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.ellipse(755, 348, 110, 86, -0.34, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = env.rgba(env.mix(deep, ink, 0.13), 0.1);
  ctx.lineWidth = 48;
  ctx.beginPath();
  ctx.moveTo(120, 580);
  ctx.bezierCurveTo(186, 455, 310, 430, 390, 530);
  ctx.stroke();
  ctx.restore();

  const ox = -120;
  const oy = 430;
  const angle = Math.atan2(-350, 1220);
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const limbLength = 1280;

  function halfWidth(s) {
    const t = clamp01(s / limbLength);
    return 143 - 75 * t
      + 2.8 * Math.sin(s * 0.026)
      + 1.5 * Math.sin(s * 0.071 + 1.4);
  }

  function localCoordinates(x, y) {
    const dx = x - ox;
    const dy = y - oy;
    return {
      s: dx * ca + dy * sa,
      q: -dx * sa + dy * ca,
    };
  }

  const farMetalHex = env.mix(deep, haze, 0.52);
  const farMetal = rgb(farMetalHex);

  function fogged(nearHex, t) {
    const d = smooth((t - 0.08) / 0.9);
    let c = env.mix(nearHex, haze, clamp01(d * 1.08));
    if (d > 0.7) {
      c = env.mix(c, farMetalHex, smooth((d - 0.7) / 0.3) * 0.86);
    }
    return c;
  }

  function cableCurve(d, offset = 0) {
    ctx.beginPath();
    ctx.moveTo(d[0], d[1] + offset);
    ctx.bezierCurveTo(
      d[2], d[3] + offset,
      d[4], d[5] + offset,
      d[6], d[7] + offset,
    );
    ctx.bezierCurveTo(
      d[8], d[9] + offset,
      d[10], d[11] + offset,
      d[12], d[13] + offset,
    );
  }

  const cables = [
    [72, 127, 176, 194, 286, 225, 408, 121, 524, 62, 647, 209, 772, 93],
    [88, 132, 195, 208, 298, 237, 420, 130, 545, 75, 662, 222, 786, 100],
    [104, 138, 218, 221, 324, 245, 441, 138, 566, 88, 684, 230, 806, 105],
    [308, 117, 414, 202, 510, 223, 610, 124, 718, 58, 822, 180, 925, 80],
    [332, 125, 438, 218, 535, 235, 634, 134, 746, 73, 848, 192, 948, 88],
  ];

  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(angle);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const cableShadow = ctx.createLinearGradient(0, 0, limbLength, 0);
  cableShadow.addColorStop(0, env.rgba(ink, 0.58));
  cableShadow.addColorStop(0.55, env.rgba(env.mix(ink, haze, 0.46), 0.36));
  cableShadow.addColorStop(1, env.rgba(farMetalHex, 0.06));

  ctx.save();
  ctx.filter = 'blur(4px)';
  ctx.strokeStyle = cableShadow;
  ctx.lineWidth = 13;
  for (const cable of cables) {
    cableCurve(cable);
    ctx.stroke();
  }
  ctx.restore();

  const cableCore = ctx.createLinearGradient(0, 0, limbLength, 0);
  cableCore.addColorStop(0, env.rgba(env.mix(ink, haze, 0.12), 0.96));
  cableCore.addColorStop(0.56, env.rgba(env.mix(ink, haze, 0.62), 0.72));
  cableCore.addColorStop(1, env.rgba(farMetalHex, 0.15));

  ctx.strokeStyle = cableCore;
  ctx.lineWidth = 4.8;
  for (const cable of cables) {
    cableCurve(cable);
    ctx.stroke();
  }

  const cableGlint = ctx.createLinearGradient(0, 0, limbLength, 0);
  cableGlint.addColorStop(0, env.rgba(env.mix(hull, haze, 0.25), 0.38));
  cableGlint.addColorStop(0.58, env.rgba(env.mix(hull, haze, 0.68), 0.18));
  cableGlint.addColorStop(1, env.rgba(farMetalHex, 0.03));

  ctx.strokeStyle = cableGlint;
  ctx.lineWidth = 1.4;
  for (const cable of cables) {
    cableCurve(cable, -1.4);
    ctx.stroke();
  }

  ctx.save();
  ctx.filter = 'blur(7px)';
  const lowerOcclusion = ctx.createLinearGradient(0, 0, limbLength, 0);
  lowerOcclusion.addColorStop(0, env.rgba(ink, 0.5));
  lowerOcclusion.addColorStop(0.6, env.rgba(env.mix(ink, haze, 0.58), 0.23));
  lowerOcclusion.addColorStop(1, env.rgba(farMetalHex, 0.03));
  ctx.strokeStyle = lowerOcclusion;
  ctx.lineWidth = 20;
  ctx.beginPath();
  for (let s = -60; s <= limbLength + 60; s += 20) {
    const q = halfWidth(s) + 4;
    if (s === -60) ctx.moveTo(s, q);
    else ctx.lineTo(s, q);
  }
  ctx.stroke();
  ctx.restore();
  ctx.restore();

  const nearShadow = rgb(env.mix(rust, ink, 0.36));
  const nearLight = rgb(env.mix(rust, hull, 0.34));
  const neutralShadow = rgb(env.mix(haze, ink, 0.22));
  const neutralLight = rgb(env.mix(haze, hull, 0.43));
  const edgeInk = rgb(ink);

  env.field((x, y) => {
    const p = localCoordinates(x, y);
    const s = p.s;
    const q = p.q;

    if (s < -90 || s > limbLength + 90) return null;

    const w = halfWidth(s);
    const edgeDistance = w - Math.abs(q);
    if (edgeDistance <= 0) return null;

    const t = clamp01(s / limbLength);
    const distance = smooth((t - 0.03) / 0.97);

    const grain = env.fbm(s * 0.24, q * 2.05, {
      octaves: 4,
      gain: 0.53,
      lacunarity: 2.08,
      period: 118,
      seed: env.seed + 101,
    });
    const streak = env.noise(s * 0.11, q * 3.15, {
      period: 83,
      seed: env.seed + 113,
    });
    const blotch = env.noise(s * 0.52, q * 0.68, {
      period: 188,
      seed: env.seed + 127,
    });

    let illumination = 0.51 - (q / w) * 0.19;
    illumination += (grain - 0.5) * 0.24;
    illumination += (streak - 0.5) * 0.13;
    illumination += (blotch - 0.5) * 0.1;
    illumination = clamp01(illumination);

    let c = mixRgb(nearShadow, nearLight, illumination);
    const neutral = mixRgb(
      neutralShadow,
      neutralLight,
      clamp01(illumination * 0.9 + 0.05),
    );

    const neutralize = smooth((t - 0.16) / 0.7) * 0.9;
    c = mixRgb(c, neutral, neutralize);

    const farFade = smooth((t - 0.62) / 0.38);
    c = mixRgb(c, farMetal, farFade * 0.87);

    const rim = Math.pow(Math.abs(q) / w, 5.2);
    const rimTarget = mixRgb(edgeInk, farMetal, distance * 0.96);
    c = mixRgb(c, rimTarget, rim * (0.25 - 0.17 * farFade));

    const underside = smooth(q / w) * (1 - farFade);
    c = mixRgb(c, rimTarget, underside * 0.11);

    const aa = smooth(edgeDistance / 1.6);
    return [c.r, c.g, c.b, 255 * aa];
  }, { blend: 'over' });

  function bodyPath(extra = 0) {
    ctx.beginPath();
    let first = true;
    for (let s = -80; s <= limbLength + 80; s += 18) {
      const q = -halfWidth(s) - extra;
      if (first) {
        ctx.moveTo(s, q);
        first = false;
      } else {
        ctx.lineTo(s, q);
      }
    }
    for (let s = limbLength + 80; s >= -80; s -= 18) {
      ctx.lineTo(s, halfWidth(s) + extra);
    }
    ctx.closePath();
  }

  function traceEdge(side, offset = 0) {
    ctx.beginPath();
    let first = true;
    for (let s = -80; s <= limbLength + 80; s += 15) {
      const q = side * (halfWidth(s) + offset);
      if (first) {
        ctx.moveTo(s, q);
        first = false;
      } else {
        ctx.lineTo(s, q);
      }
    }
  }

  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(angle);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  bodyPath();
  ctx.clip();

  const wearRng = env.stream('surface-wear');
  for (let i = 0; i < 118; i++) {
    const s = -25 + wearRng() * (limbLength + 50);
    const t = clamp01(s / limbLength);
    const w = halfWidth(s);
    const q = (wearRng() * 1.72 - 0.86) * w;
    const rx = 9 + wearRng() * 36;
    const ry = 2.5 + wearRng() * 8;
    const darkPatch = wearRng() < 0.62;
    const nearPatch = darkPatch
      ? env.mix(rust, ink, 0.42)
      : env.mix(rust, hull, 0.42);
    const alpha = (0.022 + wearRng() * 0.05)
      * (1 - 0.88 * smooth((t - 0.18) / 0.82));

    ctx.fillStyle = env.rgba(fogged(nearPatch, t), alpha);
    ctx.beginPath();
    ctx.ellipse(s, q, rx, ry, (wearRng() - 0.5) * 0.08, 0, Math.PI * 2);
    ctx.fill();
  }

  const streakRng = env.stream('lengthwise-streaks');
  for (let i = 0; i < 168; i++) {
    const s = -30 + streakRng() * (limbLength + 60);
    const t = clamp01(s / limbLength);
    const w = halfWidth(s);
    const q = (streakRng() * 1.78 - 0.89) * w;
    const len = 14 + streakRng() * 84;
    const bend = (streakRng() - 0.5) * 3.5;
    const darkLine = streakRng() < 0.67;
    const nearLine = darkLine
      ? env.mix(rust, ink, 0.5)
      : env.mix(rust, hull, 0.52);
    const alpha = (0.035 + streakRng() * 0.09)
      * (1 - 0.9 * smooth((t - 0.2) / 0.8));

    ctx.strokeStyle = env.rgba(fogged(nearLine, t), alpha);
    ctx.lineWidth = 0.8 + streakRng() * 1.5;
    ctx.beginPath();
    ctx.moveTo(s - len * 0.5, q);
    ctx.bezierCurveTo(
      s - len * 0.15, q + bend,
      s + len * 0.19, q - bend * 0.5,
      s + len * 0.5, q + bend * 0.25,
    );
    ctx.stroke();
  }

  const panelRng = env.stream('armour-panels');
  const panels = [];
  let panelStart = -56;
  while (panelStart < limbLength + 60) {
    const panelLength = 66 + panelRng() * 29;
    panels.push([panelStart, panelStart + panelLength]);
    panelStart += panelLength;
  }

  const rows = [-0.92, -0.49, -0.04, 0.43, 0.91];

  for (let i = 0; i < panels.length; i++) {
    const a = panels[i][0] + 3;
    const b = panels[i][1] - 3;
    const t = clamp01(((a + b) * 0.5) / limbLength);
    const distanceFade = 1 - 0.87 * smooth((t - 0.2) / 0.8);

    for (let r = 0; r < rows.length - 1; r++) {
      const wa = halfWidth(a);
      const wb = halfWidth(b);
      const skew = ((i + r) % 2 === 0 ? 2.5 : -2.5);
      const q0a = rows[r] * wa + skew;
      const q0b = rows[r] * wb - skew;
      const q1a = rows[r + 1] * wa + skew * 0.35;
      const q1b = rows[r + 1] * wb - skew * 0.35;

      const lightPanel = ((i * 3 + r) % 5) < 2;
      const nearPanel = lightPanel
        ? env.mix(rust, hull, 0.23 + panelRng() * 0.19)
        : env.mix(rust, ink, 0.13 + panelRng() * 0.16);

      ctx.fillStyle = env.rgba(
        fogged(nearPanel, t),
        (0.075 + panelRng() * 0.055) * distanceFade,
      );
      ctx.beginPath();
      ctx.moveTo(a, q0a);
      ctx.lineTo(b, q0b);
      ctx.lineTo(b, q1b);
      ctx.lineTo(a, q1a);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = env.rgba(
        fogged(env.mix(ink, haze, 0.2), t),
        0.25 * distanceFade,
      );
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(a, q1a);
      ctx.lineTo(b, q1b);
      ctx.lineTo(b, q0b);
      ctx.stroke();

      ctx.strokeStyle = env.rgba(
        fogged(env.mix(rust, hull, 0.48), t),
        0.25 * distanceFade,
      );
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(a, q0a);
      ctx.lineTo(b, q0b);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(a, q0a);
      ctx.lineTo(a, q1a);
      ctx.stroke();
    }
  }

  const seamRng = env.stream('joint-wear');
  for (let i = 0; i < panels.length - 1; i++) {
    const s = panels[i][1];
    const t = clamp01(s / limbLength);
    const fade = 1 - 0.91 * smooth((t - 0.2) / 0.8);
    const w = halfWidth(s);

    ctx.strokeStyle = env.rgba(
      fogged(env.mix(ink, haze, 0.18), t),
      0.6 * fade,
    );
    ctx.lineWidth = 4.2;
    ctx.beginPath();
    ctx.moveTo(s + 1, -w);
    ctx.lineTo(s - 1.5, -w * 0.48);
    ctx.lineTo(s + 1.3, 0);
    ctx.lineTo(s - 1.2, w * 0.5);
    ctx.lineTo(s + 1, w);
    ctx.stroke();

    ctx.strokeStyle = env.rgba(
      fogged(env.mix(rust, hull, 0.5), t),
      0.43 * fade,
    );
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.moveTo(s - 3, -w);
    ctx.lineTo(s - 5.5, -w * 0.48);
    ctx.lineTo(s - 2.7, 0);
    ctx.lineTo(s - 5.2, w * 0.5);
    ctx.lineTo(s - 3, w);
    ctx.stroke();

    if (i < 12 && fade > 0.08) {
      for (let k = 0; k < 4; k++) {
        const q = (seamRng() * 1.72 - 0.86) * w;
        const len = 4 + seamRng() * 14;
        ctx.strokeStyle = env.rgba(
          fogged(env.mix(rust, hull, 0.56), t),
          (0.12 + seamRng() * 0.22) * fade,
        );
        ctx.lineWidth = 1.1 + seamRng();
        ctx.beginPath();
        ctx.moveTo(s - 2, q);
        ctx.lineTo(s - 2 - len, q + (seamRng() - 0.5) * 3);
        ctx.stroke();
      }
    }
  }

  ctx.restore();

  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(angle);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const topEdge = ctx.createLinearGradient(0, 0, limbLength, 0);
  topEdge.addColorStop(0, env.rgba(env.mix(rust, hull, 0.51), 0.68));
  topEdge.addColorStop(0.55, env.rgba(env.mix(haze, hull, 0.38), 0.25));
  topEdge.addColorStop(1, env.rgba(farMetalHex, 0.035));
  ctx.strokeStyle = topEdge;
  ctx.lineWidth = 2.8;
  traceEdge(-1, -0.5);
  ctx.stroke();

  const bottomEdge = ctx.createLinearGradient(0, 0, limbLength, 0);
  bottomEdge.addColorStop(0, env.rgba(ink, 0.7));
  bottomEdge.addColorStop(0.58, env.rgba(env.mix(ink, haze, 0.62), 0.27));
  bottomEdge.addColorStop(1, env.rgba(farMetalHex, 0.025));
  ctx.strokeStyle = bottomEdge;
  ctx.lineWidth = 5.5;
  traceEdge(1, -0.5);
  ctx.stroke();

  const sockets = [408, 772, 927];
  for (const s of sockets) {
    const t = clamp01(s / limbLength);
    const fade = 1 - 0.86 * smooth((t - 0.18) / 0.82);
    const q = halfWidth(s) - 3;

    ctx.fillStyle = env.rgba(fogged(ink, t), 0.78 * fade);
    ctx.beginPath();
    ctx.ellipse(s, q, 10 - 3 * t, 7 - 2 * t, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = env.rgba(
      fogged(env.mix(rust, hull, 0.38), t),
      0.56 * fade,
    );
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(s, q - 1, 7 - 2 * t, 4.5 - t, 0, Math.PI, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = env.rgba(fogged(env.mix(ink, haze, 0.35), t), 0.7 * fade);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(s, q + 4);
    ctx.lineTo(s, q + 18);
    ctx.stroke();
  }

  function collarPath(c, half, extra) {
    const s0 = c - half;
    const s1 = c + half;
    const w0 = halfWidth(s0);
    const w1 = halfWidth(s1);

    ctx.beginPath();
    ctx.moveTo(s0 + 5, -w0 - extra);
    ctx.lineTo(s1 - 5, -w1 - extra);
    ctx.lineTo(s1 + 3, -w1 - extra + 8);
    ctx.lineTo(s1 + 3, w1 + extra - 7);
    ctx.lineTo(s1 - 5, w1 + extra);
    ctx.lineTo(s0 + 5, w0 + extra);
    ctx.lineTo(s0 - 3, w0 + extra - 8);
    ctx.lineTo(s0 - 3, -w0 - extra + 8);
    ctx.closePath();
  }

  const collars = [
    { c: 300, half: 28, extra: 17 },
    { c: 560, half: 24, extra: 14 },
    { c: 820, half: 20, extra: 11 },
    { c: 1060, half: 17, extra: 8 },
  ];
  const collarRng = env.stream('collar-wear');

  for (const collar of collars) {
    const c = collar.c;
    const half = collar.half;
    const extra = collar.extra;
    const t = clamp01(c / limbLength);
    const fade = 1 - 0.9 * smooth((t - 0.18) / 0.82);
    const w = halfWidth(c);

    ctx.save();
    ctx.filter = 'blur(4px)';
    ctx.fillStyle = env.rgba(fogged(ink, t), 0.54 * fade);
    collarPath(c + 2, half + 6, extra + 7);
    ctx.fill();
    ctx.restore();

    const collarGradient = ctx.createLinearGradient(0, -w - extra, 0, w + extra);
    collarGradient.addColorStop(
      0,
      env.rgba(fogged(env.mix(rust, hull, 0.4), t), 1),
    );
    collarGradient.addColorStop(
      0.48,
      env.rgba(fogged(env.mix(rust, haze, 0.16), t), 1),
    );
    collarGradient.addColorStop(
      1,
      env.rgba(fogged(env.mix(rust, ink, 0.35), t), 1),
    );

    ctx.fillStyle = collarGradient;
    collarPath(c, half, extra);
    ctx.fill();

    ctx.save();
    collarPath(c, half, extra);
    ctx.clip();

    for (let j = 0; j < 12; j++) {
      const x = c + (collarRng() * 1.8 - 0.9) * half;
      const y = (collarRng() * 1.74 - 0.87) * (w + extra);
      const rx = 5 + collarRng() * 17;
      const ry = 2 + collarRng() * 6;
      const patch = collarRng() < 0.65
        ? env.mix(rust, ink, 0.44)
        : env.mix(rust, hull, 0.52);

      ctx.fillStyle = env.rgba(
        fogged(patch, t),
        (0.035 + collarRng() * 0.075) * fade,
      );
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    for (let j = 0; j < 8; j++) {
      const y = (collarRng() * 1.7 - 0.85) * (w + extra);
      ctx.strokeStyle = env.rgba(
        fogged(env.mix(rust, ink, 0.38), t),
        (0.08 + collarRng() * 0.12) * fade,
      );
      ctx.lineWidth = 1 + collarRng();
      ctx.beginPath();
      ctx.moveTo(c - half, y);
      ctx.lineTo(c + half, y + (collarRng() - 0.5) * 2);
      ctx.stroke();
    }
    ctx.restore();

    ctx.strokeStyle = env.rgba(fogged(env.mix(ink, haze, 0.2), t), 0.7 * fade);
    ctx.lineWidth = 3;
    collarPath(c, half, extra);
    ctx.stroke();

    const s0 = c - half;
    const s1 = c + half;
    const w0 = halfWidth(s0);
    const w1 = halfWidth(s1);

    ctx.strokeStyle = env.rgba(
      fogged(env.mix(rust, hull, 0.54), t),
      0.72 * fade,
    );
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(s0 + 5, -w0 - extra);
    ctx.lineTo(s1 - 5, -w1 - extra);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(s0 - 2, -w0 - extra + 8);
    ctx.lineTo(s0 - 2, w0 + extra - 9);
    ctx.stroke();

    ctx.strokeStyle = env.rgba(fogged(ink, t), 0.68 * fade);
    ctx.lineWidth = 3.8;
    ctx.beginPath();
    ctx.moveTo(s1 + 2, -w1 - extra + 8);
    ctx.lineTo(s1 + 2, w1 + extra - 7);
    ctx.lineTo(s1 - 5, w1 + extra - 1);
    ctx.stroke();

    for (const f of [-0.43, 0.15, 0.62]) {
      const q0 = f * (w0 + extra);
      const q1 = f * (w1 + extra);

      ctx.strokeStyle = env.rgba(
        fogged(env.mix(ink, haze, 0.24), t),
        0.52 * fade,
      );
      ctx.lineWidth = 2.7;
      ctx.beginPath();
      ctx.moveTo(s0, q0);
      ctx.lineTo(s1, q1);
      ctx.stroke();

      ctx.strokeStyle = env.rgba(
        fogged(env.mix(rust, hull, 0.5), t),
        0.38 * fade,
      );
      ctx.lineWidth = 1.1;
      ctx.beginPath();
      ctx.moveTo(s0, q0 - 2);
      ctx.lineTo(s1, q1 - 2);
      ctx.stroke();
    }

    const boltRadius = 3.1 - t * 1.1;
    const boltPositions = [-0.73, -0.26, 0.28, 0.73];
    for (let j = 0; j < boltPositions.length; j++) {
      const q = boltPositions[j] * (w + extra);
      const x = j % 2 === 0 ? c - half + 8 : c + half - 8;

      ctx.fillStyle = env.rgba(fogged(ink, t), 0.76 * fade);
      ctx.beginPath();
      ctx.arc(x, q, boltRadius + 1.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = env.rgba(
        fogged(env.mix(rust, hull, 0.55), t),
        0.83 * fade,
      );
      ctx.beginPath();
      ctx.arc(x - 0.8, q - 0.8, boltRadius, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = env.rgba(fogged(ink, t), 0.72 * fade);
      ctx.beginPath();
      ctx.arc(x, q, Math.max(1, boltRadius * 0.38), 0, Math.PI * 2);
      ctx.fill();
    }

    for (let j = 0; j < 7; j++) {
      const q = -w - extra + 5 + collarRng() * 14;
      const len = 4 + collarRng() * 11;
      ctx.strokeStyle = env.rgba(
        fogged(env.mix(rust, hull, 0.62), t),
        (0.18 + collarRng() * 0.26) * fade,
      );
      ctx.lineWidth = 1.2 + collarRng();
      ctx.beginPath();
      ctx.moveTo(c - half + collarRng() * half * 2, q);
      ctx.lineTo(c - half + collarRng() * half * 2 + len, q + 1);
      ctx.stroke();
    }
  }

  function chamferPath(x, y, w, h, ch) {
    ctx.beginPath();
    ctx.moveTo(x + ch, y);
    ctx.lineTo(x + w - ch, y);
    ctx.lineTo(x + w, y + ch);
    ctx.lineTo(x + w, y + h - ch);
    ctx.lineTo(x + w - ch, y + h);
    ctx.lineTo(x + ch, y + h);
    ctx.lineTo(x, y + h - ch);
    ctx.lineTo(x, y + ch);
    ctx.closePath();
  }

  const hatchCenter = 300;
  const hx = hatchCenter - 19;
  const hy = -92;
  const hw = 38;
  const hh = 48;

  ctx.save();
  ctx.filter = 'blur(3px)';
  ctx.fillStyle = env.rgba(ink, 0.58);
  chamferPath(hx + 4, hy + 5, hw, hh, 6);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = env.rgba(ink, 0.92);
  chamferPath(hx - 3, hy - 3, hw + 6, hh + 6, 7);
  ctx.fill();

  const hatchGradient = ctx.createLinearGradient(0, hy, 0, hy + hh);
  hatchGradient.addColorStop(0, env.rgba(env.mix(rust, hull, 0.46), 1));
  hatchGradient.addColorStop(0.52, env.rgba(env.mix(rust, haze, 0.24), 1));
  hatchGradient.addColorStop(1, env.rgba(env.mix(rust, ink, 0.3), 1));
  ctx.fillStyle = hatchGradient;
  chamferPath(hx, hy, hw, hh, 5);
  ctx.fill();

  ctx.strokeStyle = env.rgba(env.mix(rust, hull, 0.62), 0.92);
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(hx + 5, hy + 1);
  ctx.lineTo(hx + hw - 5, hy + 1);
  ctx.moveTo(hx + 1, hy + 5);
  ctx.lineTo(hx + 1, hy + hh - 5);
  ctx.stroke();

  ctx.strokeStyle = env.rgba(ink, 0.9);
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(hx + hw - 1, hy + 5);
  ctx.lineTo(hx + hw - 1, hy + hh - 5);
  ctx.lineTo(hx + hw - 5, hy + hh - 1);
  ctx.stroke();

  ctx.strokeStyle = env.rgba(env.mix(hull, ink, 0.32), 0.95);
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(hx + 23, hy + 18);
  ctx.lineTo(hx + 28, hy + 18);
  ctx.lineTo(hx + 28, hy + 29);
  ctx.lineTo(hx + 23, hy + 29);
  ctx.stroke();

  for (const p of [
    [hx + 6, hy + 7],
    [hx + hw - 6, hy + 7],
    [hx + 6, hy + hh - 7],
    [hx + hw - 6, hy + hh - 7],
  ]) {
    ctx.fillStyle = env.rgba(ink, 0.88);
    ctx.beginPath();
    ctx.arc(p[0], p[1], 2.3, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = env.rgba(env.mix(hull, rust, 0.35), 0.9);
    ctx.beginPath();
    ctx.arc(p[0] - 0.5, p[1] - 0.5, 1.15, 0, Math.PI * 2);
    ctx.fill();
  }

  function ladderPath(offsetX, offsetY) {
    ctx.beginPath();
    ctx.moveTo(hatchCenter - 9 + offsetX, -45 + offsetY);
    ctx.lineTo(hatchCenter - 9 + offsetX, 76 + offsetY);
    ctx.moveTo(hatchCenter + 9 + offsetX, -45 + offsetY);
    ctx.lineTo(hatchCenter + 9 + offsetX, 76 + offsetY);
    for (let q = -38; q <= 72; q += 11) {
      ctx.moveTo(hatchCenter - 9 + offsetX, q + offsetY);
      ctx.lineTo(hatchCenter + 9 + offsetX, q + offsetY);
    }
  }

  ctx.strokeStyle = env.rgba(ink, 0.82);
  ctx.lineWidth = 5.2;
  ladderPath(2.6, 3.2);
  ctx.stroke();

  ctx.strokeStyle = env.rgba(env.mix(hull, ink, 0.16), 0.96);
  ctx.lineWidth = 2.8;
  ladderPath(0, 0);
  ctx.stroke();

  ctx.strokeStyle = env.rgba(env.shade(hull, 0.12), 0.8);
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.moveTo(hatchCenter - 10, -44);
  ctx.lineTo(hatchCenter - 10, 75);
  for (let q = -39; q <= 72; q += 11) {
    ctx.moveTo(hatchCenter - 8, q - 1);
    ctx.lineTo(hatchCenter + 8, q - 1);
  }
  ctx.stroke();

  ctx.fillStyle = env.rgba(warm, 0.13);
  ctx.beginPath();
  ctx.arc(hatchCenter, hy - 9, 9, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = env.rgba(env.mix(warm, rust, 0.1), 0.96);
  ctx.beginPath();
  ctx.arc(hatchCenter, hy - 9, 3.2, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = env.rgba(warm, 1);
  ctx.beginPath();
  ctx.arc(hatchCenter - 0.7, hy - 10, 1.35, 0, Math.PI * 2);
  ctx.fill();

  const windowPositions = [116, 407, 459, 654, 709, 914, 1162];
  for (let i = 0; i < windowPositions.length; i++) {
    const s = windowPositions[i];
    const t = clamp01(s / limbLength);
    const d = smooth((t - 0.18) / 0.82);
    const w = halfWidth(s);
    const q = -w * 0.21 + Math.sin(i * 2.3) * 3;
    const ww = 6.4 - 2.6 * t;
    const wh = 3.4 - 0.8 * t;
    const fade = 1 - d * 0.68;

    ctx.fillStyle = env.rgba(fogged(ink, t), 0.82 * fade);
    ctx.fillRect(s - ww * 0.9, q - 3.7, ww * 1.8, 7.4);

    ctx.fillStyle = env.rgba(fogged(warm, t), 0.11 * fade);
    ctx.fillRect(s - ww * 1.4, q - 4.5, ww * 2.8, 9);

    ctx.fillStyle = env.rgba(fogged(env.mix(warm, rust, 0.08), t), 0.92 * fade);
    ctx.fillRect(s - ww * 0.5, q - wh * 0.5, ww, wh);

    ctx.fillStyle = env.rgba(fogged(warm, t), 0.88 * fade);
    ctx.fillRect(s - ww * 0.37, q - wh * 0.5, ww * 0.42, 1.3);
  }

  ctx.restore();

  const foregroundFog = rgb(env.mix(deep, haze, 0.34));
  const foregroundLight = rgb(env.mix(deep, hull, 0.24));

  env.field((x, y, u, v) => {
    const p = localCoordinates(x, y);
    const t = p.s / limbLength;
    const distance = smooth((t - 0.38) / 0.62);
    if (distance <= 0.001) return null;

    const dither = env.noise(x * 1.73, y * 1.73, {
      period: 91,
      seed: env.seed + 401,
    });
    const wisp = 0.5 + 0.5 * Math.sin(x * 0.011 + y * 0.017 + dither * 2.2);
    const colorMix = clamp01(0.22 + (1 - v) * 0.25 + wisp * 0.09);
    const c = mixRgb(foregroundFog, foregroundLight, colorMix);

    let alpha = distance * (0.35 + 0.12 * (1 - v));
    alpha += (dither - 0.5) * 0.018 * distance;
    alpha = clamp01(alpha);

    return [c.r, c.g, c.b, 255 * alpha];
  }, { blend: 'over' });
}
