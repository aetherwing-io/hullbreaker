export const meta = {
  id: 'backdrop-limb-segment',
  size: { w: 1024, h: 512 },
  seed: 803450,
  roles: ['deep-teal', 'haze', 'ink', 'hull', 'rust-orange', 'warm-white'],
};

export function render(ctx, env) {
  const P = env.PALETTE;
  const deepTeal = P['deep-teal'];
  const haze = P.haze;
  const ink = P.ink;
  const hull = P.hull;
  const rust = P['rust-orange'];
  const warmWhite = P['warm-white'];

  const recess = env.mix(ink, deepTeal, 0.22);
  const nearDark = env.mix(env.shade(rust, -0.28), ink, 0.32);
  const nearLight = env.mix(env.shade(rust, 0.08), hull, 0.42);
  const farDark = env.mix(haze, hull, 0.12);
  const farLight = env.mix(haze, hull, 0.44);
  const plateMetal = env.mix(rust, hull, 0.32);
  const cableMetal = env.mix(env.shade(rust, -0.12), haze, 0.4);
  const cableHighlight = env.mix(hull, haze, 0.25);
  const bevel = env.mix(env.shade(rust, 0.12), hull, 0.58);
  const wornRust = env.shade(rust, -0.08);
  const lamp = env.mix(warmWhite, hull, 0.08);

  const ox = -96;
  const oy = 461;
  const angle = -0.407;
  const ca = Math.cos(angle);
  const sa = Math.sin(angle);
  const joints = [155, 320, 485, 650, 815, 975, 1110];
  const hangers = [205, 375, 545, 715, 885];

  const rgb = (hex) => env.hexToRgb(hex);
  const nearDarkRgb = rgb(nearDark);
  const nearLightRgb = rgb(nearLight);
  const farDarkRgb = rgb(farDark);
  const farLightRgb = rgb(farLight);
  const recessRgb = rgb(recess);

  function mixRgb(a, b, t) {
    return {
      r: env.lerp(a.r, b.r, t),
      g: env.lerp(a.g, b.g, t),
      b: env.lerp(a.b, b.b, t),
    };
  }

  function localCoordinates(x, y) {
    const px = x - ox;
    const py = y - oy;
    return {
      s: px * ca + py * sa,
      q: -px * sa + py * ca,
    };
  }

  function collarBulge(s) {
    let bulge = 0;
    for (let i = 0; i < joints.length; i += 1) {
      const d = Math.abs(s - joints[i]);
      if (d < 30) {
        const u = 1 - d / 30;
        bulge += u * u * (3 - 2 * u) * 10;
      }
    }
    return bulge;
  }

  function profile(s) {
    const t = env.clamp(s / 1200, 0, 1);
    const bulge = collarBulge(s);
    return {
      top: 106 - 38 * t + bulge * 0.55,
      bottom: 94 - 31 * t + bulge,
    };
  }

  function fractionQ(s, fraction, offset = 0) {
    const p = profile(s);
    return -p.top + (p.top + p.bottom) * fraction + offset;
  }

  function cableQ(s, index) {
    const p = profile(s);
    const phase = ((s - 25 + index * 13) % 165) / 165;
    const sag = 12 * Math.sin(Math.PI * phase) ** 2;
    return p.bottom + 14 + index * 9 + sag;
  }

  env.field((x, y) => {
    const local = localCoordinates(x, y);
    const s = local.s;
    const q = local.q;

    if (s < -50 || s > 1225) return null;

    const p = profile(s);
    if (q < -p.top - 4 || q > p.bottom + 4) return null;

    const cross = env.clamp((q + p.top) / (p.top + p.bottom), 0, 1);
    let valueStep;
    if (cross < 0.18) valueStep = 0.84;
    else if (cross < 0.56) valueStep = 0.62;
    else if (cross < 0.82) valueStep = 0.42;
    else valueStep = 0.25;

    const streak = env.fbm(s * 0.22, q * 2.6, {
      octaves: 3,
      gain: 0.5,
      lacunarity: 2,
      period: 190,
      seed: 803461,
    });
    const blotch = env.fbm(s, q, {
      octaves: 3,
      gain: 0.54,
      lacunarity: 2,
      period: 118,
      seed: 803467,
    });
    const fine = env.noise(s * 1.7, q * 3.9, {
      period: 53,
      seed: 803471,
    });

    const nearLift = 0.07 * (1 - env.clamp(s / 880, 0, 1));
    const level = env.clamp(
      valueStep +
        nearLift +
        (streak - 0.5) * 0.15 +
        (blotch - 0.5) * 0.1 +
        (fine - 0.5) * 0.035,
      0,
      1,
    );

    const distance = env.smoothstep(env.clamp((s - 760) / 430, 0, 1));
    const low = mixRgb(nearDarkRgb, farDarkRgb, distance);
    const high = mixRgb(nearLightRgb, farLightRgb, distance);
    const color = mixRgb(low, high, level);

    return [
      Math.round(color.r),
      Math.round(color.g),
      Math.round(color.b),
      255,
    ];
  });

  env.field((x, y) => {
    const local = localCoordinates(x, y);
    const s = local.s;
    const q = local.q;

    if (s < -45 || s > 1220) return null;

    const p = profile(s);
    if (q < -p.top || q > p.bottom) return null;

    let nearestJoint = 1000;
    for (let i = 0; i < joints.length; i += 1) {
      nearestJoint = Math.min(nearestJoint, Math.abs(s - joints[i]));
    }

    const jointOcclusion = env.smoothstep(
      env.clamp((24 - nearestJoint) / 24, 0, 1),
    );
    const underside = env.smoothstep(
      env.clamp((q - (p.bottom - 38)) / 38, 0, 1),
    );
    const seamA = Math.abs(q - fractionQ(s, 0.34));
    const seamB = Math.abs(q - fractionQ(s, 0.7));
    const seamOcclusion = Math.max(
      env.clamp((6 - seamA) / 6, 0, 1),
      env.clamp((6 - seamB) / 6, 0, 1),
    );

    const alpha = Math.max(
      jointOcclusion * 0.58,
      underside * 0.35,
      seamOcclusion * 0.26,
    );

    if (alpha < 0.01) return null;
    return [
      recessRgb.r,
      recessRgb.g,
      recessRgb.b,
      Math.round(alpha * 255),
    ];
  }, { blend: 'over' });

  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(angle);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  function bandPath(s1, s2, inset = 0) {
    const a = profile(s1);
    const b = profile(s2);
    ctx.beginPath();
    ctx.moveTo(s1, -a.top + inset);
    ctx.lineTo(s2, -b.top + inset);
    ctx.lineTo(s2, b.bottom - inset);
    ctx.lineTo(s1, a.bottom - inset);
    ctx.closePath();
  }

  function crossPath(s, inset = 0) {
    const p = profile(s);
    ctx.beginPath();
    ctx.moveTo(s, -p.top + inset);
    ctx.lineTo(s, p.bottom - inset);
  }

  function traceFraction(fraction, offset = 0, from = -25, to = 1215) {
    ctx.beginPath();
    for (let s = from; s <= to; s += 14) {
      const q = fractionQ(s, fraction, offset);
      if (s === from) ctx.moveTo(s, q);
      else ctx.lineTo(s, q);
    }
  }

  function traceEdge(which, inset, from = -25, to = 1215) {
    ctx.beginPath();
    for (let s = from; s <= to; s += 12) {
      const p = profile(s);
      const q = which === 'top' ? -p.top + inset : p.bottom - inset;
      if (s === from) ctx.moveTo(s, q);
      else ctx.lineTo(s, q);
    }
  }

  function roundedRectPath(x, y, w, h, radius) {
    const r = Math.min(radius, w * 0.5, h * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  function drawCablePath(index) {
    ctx.beginPath();
    for (let s = 25; s <= 985; s += 9) {
      const q = cableQ(s, index);
      if (s === 25) ctx.moveTo(s, q);
      else ctx.lineTo(s, q);
    }
  }

  ctx.shadowColor = env.rgba(ink, 0.34);
  ctx.shadowBlur = 3;
  ctx.shadowOffsetY = 2;

  for (let i = 0; i < hangers.length; i += 1) {
    const s = hangers[i];
    const p = profile(s);
    const q0 = p.bottom - 4;
    const q1 = cableQ(s, 3) + 3;

    ctx.beginPath();
    ctx.moveTo(s, q0);
    ctx.lineTo(s, q1);
    ctx.strokeStyle = env.rgba(ink, 0.68);
    ctx.lineWidth = 12;
    ctx.stroke();

    ctx.strokeStyle = env.rgba(cableMetal, 0.82);
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(s - 1.5, q0);
    ctx.lineTo(s - 1.5, q1);
    ctx.strokeStyle = env.rgba(cableHighlight, 0.42);
    ctx.lineWidth = 2;
    ctx.stroke();

    for (const q of [q0, q1]) {
      ctx.beginPath();
      ctx.ellipse(s, q, 7, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = env.rgba(ink, 0.88);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(s - 1.2, q - 1.2, 3.2, 3.2, 0, 0, Math.PI * 2);
      ctx.fillStyle = env.rgba(bevel, 0.68);
      ctx.fill();
    }
  }

  for (let i = 0; i < 4; i += 1) {
    drawCablePath(i);
    ctx.strokeStyle = env.rgba(ink, 0.22);
    ctx.lineWidth = 15;
    ctx.stroke();

    drawCablePath(i);
    ctx.strokeStyle = env.rgba(recess, 0.92);
    ctx.lineWidth = 9;
    ctx.stroke();

    drawCablePath(i);
    ctx.strokeStyle = env.rgba(cableMetal, 0.8);
    ctx.lineWidth = 5;
    ctx.stroke();

    drawCablePath(i);
    ctx.strokeStyle = env.rgba(cableHighlight, 0.34);
    ctx.lineWidth = 1.8;
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  const panels = env.stream('panel-patches');
  for (let i = 0; i < 17; i += 1) {
    const s = 55 + panels() * 995;
    const p = profile(s);
    const distanceScale = 1 - 0.34 * env.clamp(s / 1200, 0, 1);
    const w = (40 + panels() * 66) * distanceScale;
    const h = (18 + panels() * 30) * distanceScale;
    const q = -p.top + 20 + panels() * Math.max(16, p.top + p.bottom - h - 40);
    const skew = (panels() - 0.5) * 8;

    ctx.beginPath();
    ctx.moveTo(s, q);
    ctx.lineTo(s + w, q + skew * 0.15);
    ctx.lineTo(s + w - 3, q + h + skew * 0.15);
    ctx.lineTo(s + 3, q + h);
    ctx.closePath();
    ctx.fillStyle = env.rgba(plateMetal, 0.08);
    ctx.fill();
    ctx.strokeStyle = env.rgba(ink, 0.3);
    ctx.lineWidth = 2.6;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(s + 3, q + 1);
    ctx.lineTo(s + w - 3, q + 1 + skew * 0.15);
    ctx.strokeStyle = env.rgba(bevel, 0.38);
    ctx.lineWidth = 1.7;
    ctx.stroke();
  }

  for (const fraction of [0.34, 0.7]) {
    traceFraction(fraction);
    ctx.strokeStyle = env.rgba(ink, 0.62);
    ctx.lineWidth = 5;
    ctx.stroke();

    traceFraction(fraction, -3);
    ctx.strokeStyle = env.rgba(bevel, 0.46);
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  traceEdge('top', 2);
  ctx.strokeStyle = env.rgba(bevel, 0.68);
  ctx.lineWidth = 3;
  ctx.stroke();

  traceEdge('bottom', 2);
  ctx.strokeStyle = env.rgba(ink, 0.76);
  ctx.lineWidth = 7;
  ctx.stroke();

  traceEdge('bottom', 6);
  ctx.strokeStyle = env.rgba(cableMetal, 0.42);
  ctx.lineWidth = 2.5;
  ctx.stroke();

  for (let i = 0; i < joints.length; i += 1) {
    const s = joints[i];

    bandPath(s - 24, s + 25, 1);
    ctx.fillStyle = env.rgba(ink, 0.18);
    ctx.fill();

    bandPath(s - 19, s - 8, 2);
    ctx.fillStyle = env.rgba(plateMetal, 0.3);
    ctx.fill();

    bandPath(s - 8, s + 9, 1);
    ctx.fillStyle = env.rgba(recess, 0.92);
    ctx.fill();

    bandPath(s + 9, s + 19, 2);
    ctx.fillStyle = env.rgba(env.mix(rust, haze, 0.46), 0.24);
    ctx.fill();

    crossPath(s - 10, 4);
    ctx.strokeStyle = env.rgba(bevel, 0.72);
    ctx.lineWidth = 4;
    ctx.stroke();

    crossPath(s + 11, 3);
    ctx.strokeStyle = env.rgba(ink, 0.82);
    ctx.lineWidth = 6;
    ctx.stroke();

    crossPath(s + 16, 6);
    ctx.strokeStyle = env.rgba(wornRust, 0.34);
    ctx.lineWidth = 2;
    ctx.stroke();

    const p = profile(s);
    for (let q = -p.top + 18; q < p.bottom - 12; q += 27) {
      ctx.beginPath();
      ctx.ellipse(s - 15, q, 4, 4, 0, 0, Math.PI * 2);
      ctx.fillStyle = env.rgba(ink, 0.86);
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(s - 16, q - 1, 1.8, 1.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = env.rgba(bevel, 0.7);
      ctx.fill();
    }
  }

  function drawVent(s, q, scale) {
    roundedRectPath(s - 7 * scale, q - 8 * scale, 64 * scale, 42 * scale, 5 * scale);
    ctx.fillStyle = env.rgba(ink, 0.34);
    ctx.fill();
    ctx.strokeStyle = env.rgba(bevel, 0.32);
    ctx.lineWidth = 2 * scale;
    ctx.stroke();

    for (let i = 0; i < 5; i += 1) {
      const slotQ = q - 1 * scale + i * 7 * scale;
      ctx.beginPath();
      ctx.moveTo(s, slotQ);
      ctx.lineTo(s + 43 * scale, slotQ);
      ctx.strokeStyle = env.rgba(recess, 0.86);
      ctx.lineWidth = 4.5 * scale;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(s, slotQ - 2.2 * scale);
      ctx.lineTo(s + 43 * scale, slotQ - 2.2 * scale);
      ctx.strokeStyle = env.rgba(cableHighlight, 0.32);
      ctx.lineWidth = 1.4 * scale;
      ctx.stroke();
    }
  }

  drawVent(535, 8, 0.86);
  drawVent(850, -4, 0.7);

  roundedRectPath(211, -45, 64, 48, 8);
  ctx.fillStyle = env.rgba(ink, 0.82);
  ctx.fill();

  roundedRectPath(215, -49, 57, 43, 7);
  ctx.fillStyle = env.rgba(plateMetal, 0.9);
  ctx.fill();
  ctx.strokeStyle = env.rgba(ink, 0.8);
  ctx.lineWidth = 4;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(222, -47);
  ctx.lineTo(264, -47);
  ctx.quadraticCurveTo(270, -47, 270, -40);
  ctx.strokeStyle = env.rgba(bevel, 0.76);
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(270, -40);
  ctx.lineTo(270, -13);
  ctx.quadraticCurveTo(270, -8, 264, -8);
  ctx.strokeStyle = env.rgba(ink, 0.76);
  ctx.lineWidth = 4;
  ctx.stroke();

  for (const point of [
    [222, -40],
    [263, -40],
    [222, -15],
    [263, -15],
  ]) {
    ctx.beginPath();
    ctx.ellipse(point[0], point[1], 3.2, 3.2, 0, 0, Math.PI * 2);
    ctx.fillStyle = env.rgba(ink, 0.9);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(point[0] - 0.8, point[1] - 0.8, 1.3, 1.3, 0, 0, Math.PI * 2);
    ctx.fillStyle = env.rgba(bevel, 0.75);
    ctx.fill();
  }

  ctx.beginPath();
  ctx.moveTo(239, -27);
  ctx.quadraticCurveTo(246, -34, 253, -27);
  ctx.strokeStyle = env.rgba(ink, 0.92);
  ctx.lineWidth = 6;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(239, -29);
  ctx.quadraticCurveTo(246, -35, 253, -29);
  ctx.strokeStyle = env.rgba(hull, 0.78);
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(260, -20, 5.5, 4.5, 0, 0, Math.PI * 2);
  ctx.fillStyle = env.rgba(ink, 0.92);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(259.5, -21, 3.2, 2.7, 0, 0, Math.PI * 2);
  ctx.fillStyle = env.rgba(lamp, 0.96);
  ctx.fill();

  const ladderTop = -76;
  const ladderBottom = 66;
  for (const rail of [160, 181]) {
    ctx.beginPath();
    ctx.moveTo(rail, ladderTop);
    ctx.lineTo(rail, ladderBottom);
    ctx.strokeStyle = env.rgba(ink, 0.88);
    ctx.lineWidth = 6;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(rail - 1.3, ladderTop);
    ctx.lineTo(rail - 1.3, ladderBottom);
    ctx.strokeStyle = env.rgba(hull, 0.72);
    ctx.lineWidth = 2.4;
    ctx.stroke();
  }

  for (let q = ladderTop + 8; q <= ladderBottom - 4; q += 13) {
    ctx.beginPath();
    ctx.moveTo(160, q);
    ctx.lineTo(181, q);
    ctx.strokeStyle = env.rgba(ink, 0.9);
    ctx.lineWidth = 5.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(161, q - 1.2);
    ctx.lineTo(180, q - 1.2);
    ctx.strokeStyle = env.rgba(bevel, 0.7);
    ctx.lineWidth = 2.1;
    ctx.stroke();
  }

  const windowPositions = [365, 425, 515, 590, 705, 770, 895, 1030];
  for (let i = 0; i < windowPositions.length; i += 1) {
    const s = windowPositions[i];
    const p = profile(s);
    const q = -p.top + (p.top + p.bottom) * 0.22;
    const distance = env.smoothstep(env.clamp((s - 780) / 390, 0, 1));
    const scale = 1 - 0.28 * env.clamp(s / 1200, 0, 1);

    roundedRectPath(s - 5 * scale, q - 4 * scale, 12 * scale, 8 * scale, 2 * scale);
    ctx.fillStyle = env.rgba(ink, 0.88 - distance * 0.28);
    ctx.fill();

    roundedRectPath(s - 2.5 * scale, q - 2 * scale, 6.5 * scale, 3.5 * scale, 1);
    ctx.fillStyle = env.rgba(lamp, 0.72 - distance * 0.38);
    ctx.fill();
  }

  const wear = env.stream('directed-wear');

  for (let i = 0; i < 48; i += 1) {
    const joint = joints[Math.floor(wear() * joints.length)];
    const s = joint - 28 + wear() * 55;
    const p = profile(s);
    const upper = wear() < 0.58;
    const q = upper
      ? -p.top + 5 + wear() * 27
      : p.bottom - 8 - wear() * 31;
    const length = 10 + wear() * 54;
    const drift = (wear() - 0.5) * 5;

    ctx.beginPath();
    ctx.moveTo(s, q);
    ctx.lineTo(s + length, q + drift);
    ctx.strokeStyle = env.rgba(
      wear() < 0.58 ? wornRust : ink,
      0.12 + wear() * 0.2,
    );
    ctx.lineWidth = 1.6 + wear() * 2.2;
    ctx.stroke();
  }

  for (let i = 0; i < 36; i += 1) {
    const s = 55 + wear() * 910;
    const p = profile(s);
    const q = -p.top + 14 + wear() * (p.top + p.bottom - 28);
    const length = 28 + wear() * 125;
    const bend = (wear() - 0.5) * 8;

    ctx.beginPath();
    ctx.moveTo(s, q);
    ctx.bezierCurveTo(
      s + length * 0.34,
      q + bend,
      s + length * 0.72,
      q - bend * 0.35,
      s + length,
      q + bend * 0.25,
    );
    ctx.strokeStyle = env.rgba(
      wear() < 0.34 ? wornRust : recess,
      0.07 + wear() * 0.13,
    );
    ctx.lineWidth = 1.3 + wear() * 1.8;
    ctx.stroke();
  }

  for (let i = 0; i < joints.length; i += 1) {
    const s = joints[i] + 13;
    const p = profile(s);
    for (let j = 0; j < 5; j += 1) {
      const q = p.bottom - 6 - j * 8 - wear() * 5;
      const w = 3 + wear() * 7;
      const h = 2 + wear() * 3;
      ctx.fillStyle = env.rgba(wornRust, 0.24 + wear() * 0.24);
      ctx.fillRect(s + wear() * 7, q, w, h);
    }
  }

  ctx.restore();

  ctx.save();
  ctx.translate(ox, oy);
  ctx.rotate(angle);
  ctx.globalCompositeOperation = 'source-atop';

  const distanceFog = ctx.createLinearGradient(840, 0, 1195, 0);
  distanceFog.addColorStop(0, env.rgba(haze, 0));
  distanceFog.addColorStop(0.42, env.rgba(haze, 0.18));
  distanceFog.addColorStop(0.74, env.rgba(haze, 0.43));
  distanceFog.addColorStop(1, env.rgba(haze, 0.7));
  ctx.fillStyle = distanceFog;
  ctx.fillRect(820, -230, 410, 470);
  ctx.restore();

  function pixelDither(x, y) {
    let h = Math.imul((x | 0) + 1, 521288629);
    h ^= Math.imul((y | 0) + 1, 668265263);
    h ^= meta.seed;
    h = Math.imul(h ^ (h >>> 15), 2246822519);
    h ^= h >>> 13;
    return ((h >>> 24) / 255 - 0.5) * (3 / 255);
  }

  env.mask((x, y) => {
    const local = localCoordinates(x, y);
    const s = local.s;
    const q = local.q;
    const p = profile(s);

    let bodyCoverage = 0;
    if (s > -44 && s < 1225) {
      const sideEdge = Math.min(q + p.top, p.bottom - q);
      const endEdge = Math.min(s + 44, 1225 - s);
      const sideCoverage = env.clamp((sideEdge + 2) / 4, 0, 1);
      const endCoverage = env.clamp((endEdge + 2) / 4, 0, 1);
      bodyCoverage = Math.min(sideCoverage, endCoverage);
    }

    let cableCoverage = 0;
    if (s > 21 && s < 989) {
      const alongEdge = Math.min(s - 25, 985 - s);
      const alongCoverage = env.clamp((alongEdge + 2) / 4, 0, 1);

      for (let i = 0; i < 4; i += 1) {
        const distance = Math.abs(q - cableQ(s, i));
        const coverage = env.clamp((10 - distance) / 4, 0, 1) * alongCoverage;
        cableCoverage = Math.max(cableCoverage, coverage);
      }
    }

    let supportCoverage = 0;
    for (let i = 0; i < hangers.length; i += 1) {
      const hs = hangers[i];
      const hp = profile(hs);
      const q0 = hp.bottom - 5;
      const q1 = cableQ(hs, 3) + 5;
      const edgeX = 7 - Math.abs(s - hs);
      const edgeY = Math.min(q - q0, q1 - q);
      const edge = Math.min(edgeX, edgeY);
      supportCoverage = Math.max(
        supportCoverage,
        env.clamp((edge + 2) / 4, 0, 1),
      );
    }

    const silhouette = Math.max(
      bodyCoverage,
      cableCoverage,
      supportCoverage,
    );
    if (silhouette <= 0) return 0;

    const fadeStart = 910;
    const fadeEnd = 1195;
    if (s >= fadeEnd) return 0;

    let dissolve = 1;
    if (s > fadeStart) {
      const t = env.clamp((s - fadeStart) / (fadeEnd - fadeStart), 0, 1);
      dissolve = 1 - env.smoothstep(t);
      if (t > 0 && t < 1) {
        dissolve = env.clamp(dissolve + pixelDither(x, y), 0, 1);
      }
    }

    return silhouette * dissolve;
  });
}
