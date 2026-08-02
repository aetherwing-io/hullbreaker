export const meta = {
  id: 'backdrop-colony-cluster',
  size: { w: 512, h: 256 },
  seed: 597251,
  roles: ['haze', 'ink', 'hull', 'deep-teal', 'rust-orange', 'warm-white'],
};

export function render(ctx, env) {
  const W = env.width;
  const H = env.height;
  const P = env.PALETTE;
  const C = {
    haze: P.haze,
    ink: P.ink,
    hull: P.hull,
    teal: P['deep-teal'],
    rust: P['rust-orange'],
    warm: P['warm-white'],
  };

  const paintRng = env.stream('plate-patchwork');
  const wearRng = env.stream('directed-wear');
  const windowRng = env.stream('inhabited-windows');
  const textureMasks = [];

  const rgb = (hex) => env.hexToRgb(hex);
  const lerp = (a, b, t) => a + (b - a) * t;
  const mixRgb = (a, b, t, alpha = 255) => [
    lerp(a.r, b.r, t),
    lerp(a.g, b.g, t),
    lerp(a.b, b.b, t),
    alpha,
  ];

  function polygon(points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
  }

  function boundsOf(points) {
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const p of points) {
      x0 = Math.min(x0, p[0]);
      y0 = Math.min(y0, p[1]);
      x1 = Math.max(x1, p[0]);
      y1 = Math.max(y1, p[1]);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }

  function makeScheme(role, fog = 0, variation = 0) {
    const anchor = P[role];
    const mid = env.shade(
      env.mix(anchor, C.haze, env.clamp(fog, 0, 0.82)),
      variation,
    );
    const frameAnchor = role === 'rust-orange' ? C.hull : C.rust;
    return {
      base: mid,
      light: env.shade(mid, 0.14),
      dark: env.shade(mid, -0.25),
      gap: env.mix(C.ink, C.teal, 0.18 + fog * 0.43),
      frame: env.shade(
        env.mix(frameAnchor, C.haze, Math.min(0.76, fog * 0.86)),
        variation * 0.35,
      ),
    };
  }

  function plate(points, scheme, grain = 1) {
    const b = boundsOf(points);

    ctx.save();
    ctx.translate(2.5, 3.5);
    polygon(points);
    ctx.fillStyle = env.rgba(scheme.gap, 0.62);
    ctx.fill();
    ctx.restore();

    const baseGradient = ctx.createLinearGradient(
      b.x,
      b.y,
      b.x + b.w * 0.85,
      b.y + b.h,
    );
    baseGradient.addColorStop(0, scheme.light);
    baseGradient.addColorStop(0.38, scheme.base);
    baseGradient.addColorStop(1, scheme.dark);
    polygon(points);
    ctx.fillStyle = baseGradient;
    ctx.fill();

    ctx.save();
    polygon(points);
    ctx.clip();

    const bands = 4 + Math.floor(paintRng() * 4);
    for (let i = 0; i < bands; i++) {
      const yy = b.y + paintRng() * b.h;
      const hh = 1.5 + paintRng() * Math.max(2, b.h * 0.18);
      const tone = paintRng() < 0.53 ? scheme.light : scheme.dark;
      ctx.fillStyle = env.rgba(tone, (0.045 + paintRng() * 0.11) * grain);
      ctx.fillRect(
        b.x - 3,
        yy,
        b.w * (0.48 + paintRng() * 0.58),
        hh,
      );
    }

    const patches = 2 + Math.floor(paintRng() * 3);
    for (let i = 0; i < patches; i++) {
      const px = b.x + paintRng() * b.w * 0.78;
      const py = b.y + paintRng() * b.h * 0.78;
      const pw = b.w * (0.12 + paintRng() * 0.3);
      const ph = b.h * (0.12 + paintRng() * 0.26);
      ctx.fillStyle = env.rgba(
        paintRng() < 0.5 ? scheme.dark : scheme.light,
        (0.045 + paintRng() * 0.08) * grain,
      );
      ctx.beginPath();
      ctx.moveTo(px, py + ph * 0.18);
      ctx.lineTo(px + pw * 0.88, py);
      ctx.lineTo(px + pw, py + ph * 0.72);
      ctx.lineTo(px + pw * 0.1, py + ph);
      ctx.closePath();
      ctx.fill();
    }

    ctx.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      const sy = b.y + paintRng() * b.h;
      const sx = b.x + paintRng() * b.w * 0.25;
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(
        Math.min(b.x + b.w, sx + b.w * (0.36 + paintRng() * 0.54)),
        sy + (paintRng() - 0.5) * 1.5,
      );
      ctx.strokeStyle = env.rgba(
        paintRng() < 0.5 ? scheme.light : scheme.dark,
        0.12 * grain,
      );
      ctx.stroke();
    }
    ctx.restore();

    polygon(points);
    ctx.lineWidth = 2;
    ctx.strokeStyle = env.rgba(scheme.gap, 0.78);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(
      points[points.length - 1][0],
      points[points.length - 1][1],
    );
    ctx.lineTo(points[0][0], points[0][1]);
    ctx.lineTo(points[1][0], points[1][1]);
    ctx.lineWidth = 1.45;
    ctx.strokeStyle = env.rgba(scheme.light, 0.8);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(points[1][0], points[1][1]);
    for (let i = 2; i < points.length - 1; i++) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.lineWidth = 2.1;
    ctx.strokeStyle = env.rgba(scheme.dark, 0.82);
    ctx.stroke();

    const boltIndices = [
      0,
      1,
      Math.floor(points.length / 2),
      points.length - 1,
    ];
    for (const index of boltIndices) {
      const p = points[index];
      ctx.fillStyle = env.rgba(scheme.gap, 0.78);
      ctx.fillRect(p[0] - 1.4, p[1] - 1.4, 3, 3);
      ctx.fillStyle = env.rgba(scheme.light, 0.7);
      ctx.fillRect(p[0] - 1, p[1] - 1, 1.2, 1.2);
    }
  }

  function shadowBand(x, y, w, depth, color, alpha = 0.58) {
    const g = ctx.createLinearGradient(0, y, 0, y + depth);
    g.addColorStop(0, env.rgba(color, alpha));
    g.addColorStop(0.38, env.rgba(color, alpha * 0.55));
    g.addColorStop(1, env.rgba(color, 0));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, w, depth);
  }

  function crate(x, y, w, h, role, fog, variation, roof = true) {
    const scheme = makeScheme(role, fog, variation);
    const cut = Math.min(6, Math.max(3, Math.floor(Math.min(w, h) * 0.12)));
    const points = [
      [x + cut, y],
      [x + w - cut, y],
      [x + w, y + cut],
      [x + w, y + h - cut],
      [x + w - cut, y + h],
      [x + cut, y + h],
      [x, y + h - cut],
      [x, y + cut],
    ];

    plate(points, scheme, 1);

    ctx.save();
    polygon(points);
    ctx.clip();

    const divisions = w > 120 ? 4 : w > 72 ? 3 : 2;
    for (let i = 1; i < divisions; i++) {
      const sx = x + (w * i) / divisions;
      ctx.fillStyle = env.rgba(scheme.gap, 0.62);
      ctx.fillRect(sx, y + 3, 2.4, h - 6);
      ctx.fillStyle = env.rgba(scheme.light, 0.38);
      ctx.fillRect(sx - 0.7, y + 4, 0.8, h - 8);
    }

    for (const fx of [x + 7, x + w - 10]) {
      ctx.fillStyle = env.rgba(scheme.gap, 0.68);
      ctx.fillRect(fx + 1.5, y + 4, 4.2, h - 8);
      ctx.fillStyle = env.rgba(scheme.frame, 0.78);
      ctx.fillRect(fx, y + 4, 2.4, h - 8);
      ctx.fillStyle = env.rgba(
        env.shade(scheme.frame, 0.13),
        0.48,
      );
      ctx.fillRect(fx, y + 4, 0.8, h - 8);
    }

    ctx.fillStyle = env.rgba(scheme.gap, 0.54);
    ctx.fillRect(x + 4, y + 7, w - 8, 2);
    ctx.fillRect(x + 4, y + h - 9, w - 8, 2);
    ctx.fillStyle = env.rgba(scheme.light, 0.3);
    ctx.fillRect(x + 5, y + 6, w - 10, 0.9);
    ctx.restore();

    textureMasks.push({
      x: x + 3,
      y: y + 5,
      w: w - 6,
      h: h - 9,
      light: rgb(scheme.light),
      dark: rgb(scheme.dark),
      seed: textureMasks.length + 1,
    });

    if (roof) {
      const roofScheme = makeScheme(
        'rust-orange',
        Math.min(0.72, fog + 0.04),
        variation + 0.025,
      );
      const roofPoints = [
        [x + 2, y - 5],
        [x + w - 7, y - 5],
        [x + w + 4, y],
        [x + w + 1, y + 4],
        [x - 3, y + 4],
        [x - 4, y + 1],
      ];
      plate(roofPoints, roofScheme, 0.85);
      shadowBand(x - 2, y + 3, w + 4, 10, scheme.gap, 0.58);
    }

    return { x, y, w, h, role, scheme };
  }

  function drawStrut(x1, y1, x2, y2, width, fog = 0.2) {
    const dark = env.mix(C.ink, C.teal, 0.2 + fog * 0.42);
    const metal = env.mix(C.hull, C.haze, fog);
    ctx.lineCap = 'butt';

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = width + 4;
    ctx.strokeStyle = env.rgba(dark, 0.78);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = width;
    ctx.strokeStyle = env.rgba(metal, 0.9);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1 - 1, y1 - 1);
    ctx.lineTo(x2 - 1, y2 - 1);
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = env.rgba(env.shade(metal, 0.15), 0.68);
    ctx.stroke();
  }

  function trussBeam(x1, y1, x2, y2, width, fog = 0.3) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const dark = env.mix(C.ink, C.teal, 0.2 + fog * 0.4);
    const metal = env.mix(C.hull, C.haze, fog);
    const brace = env.mix(C.rust, C.haze, Math.min(0.74, fog + 0.08));

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = width + 4;
    ctx.strokeStyle = env.rgba(dark, 0.58);
    ctx.stroke();

    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(x1 + nx * width * 0.5 * side, y1 + ny * width * 0.5 * side);
      ctx.lineTo(x2 + nx * width * 0.5 * side, y2 + ny * width * 0.5 * side);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = env.rgba(metal, 0.82);
      ctx.stroke();
    }

    const segments = Math.max(3, Math.floor(len / 14));
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      const side0 = i % 2 === 0 ? -1 : 1;
      const side1 = -side0;
      ctx.beginPath();
      ctx.moveTo(
        lerp(x1, x2, t0) + nx * width * 0.5 * side0,
        lerp(y1, y2, t0) + ny * width * 0.5 * side0,
      );
      ctx.lineTo(
        lerp(x1, x2, t1) + nx * width * 0.5 * side1,
        lerp(y1, y2, t1) + ny * width * 0.5 * side1,
      );
      ctx.lineWidth = 1.7;
      ctx.strokeStyle = env.rgba(brace, 0.66);
      ctx.stroke();
    }
  }

  function hazeBloom(cx, cy, radius, alpha) {
    const fog = env.mix(C.teal, C.haze, 0.7);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
    g.addColorStop(0, env.rgba(fog, alpha));
    g.addColorStop(0.54, env.rgba(fog, alpha * 0.45));
    g.addColorStop(1, env.rgba(fog, 0));
    ctx.fillStyle = g;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }

  const bgDark = rgb(env.mix(C.teal, C.haze, 0.32));
  const bgLight = rgb(env.mix(C.teal, C.haze, 0.7));

  env.field((x, y, u, v) => {
    const broad = env.fbm(x * 0.5, y * 0.5, {
      octaves: 4,
      gain: 0.52,
      lacunarity: 2,
      period: 196,
      seed: meta.seed + 11,
    });
    const horizontal = env.noise(x * 0.18, y * 1.1, {
      period: 132,
      seed: meta.seed + 29,
    });
    const lightRamp = (1 - u) * 0.13 + (1 - v) * 0.07;
    const t = env.clamp(
      0.31 +
        lightRamp +
        v * 0.09 +
        (broad - 0.5) * 0.22 +
        (horizontal - 0.5) * 0.08,
      0,
      1,
    );
    return mixRgb(bgDark, bgLight, t);
  });

  hazeBloom(102, 74, 105, 0.1);
  hazeBloom(286, 47, 125, 0.09);
  hazeBloom(438, 111, 105, 0.11);
  hazeBloom(244, 208, 138, 0.065);

  const farRib = env.mix(C.haze, C.teal, 0.48);
  const farEdge = env.mix(C.hull, C.teal, 0.71);
  const farVoid = env.mix(C.ink, C.teal, 0.53);

  ctx.save();
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.moveTo(-45, 72);
  ctx.bezierCurveTo(78, 29, 146, 52, 190, 147);
  ctx.bezierCurveTo(211, 190, 206, 227, 185, 271);
  ctx.lineWidth = 26;
  ctx.strokeStyle = env.rgba(farRib, 0.18);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-43, 69);
  ctx.bezierCurveTo(76, 32, 141, 54, 183, 148);
  ctx.lineWidth = 3;
  ctx.strokeStyle = env.rgba(farEdge, 0.2);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(563, 56);
  ctx.bezierCurveTo(448, 21, 402, 80, 421, 166);
  ctx.bezierCurveTo(432, 214, 476, 239, 538, 255);
  ctx.lineWidth = 34;
  ctx.strokeStyle = env.rgba(farRib, 0.18);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(552, 61);
  ctx.bezierCurveTo(452, 30, 414, 82, 431, 166);
  ctx.lineWidth = 4;
  ctx.strokeStyle = env.rgba(farVoid, 0.18);
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.translate(474, 133);
  ctx.rotate(-0.34);
  ctx.beginPath();
  ctx.ellipse(0, 0, 85, 40, 0, 0, Math.PI * 2);
  ctx.lineWidth = 22;
  ctx.strokeStyle = env.rgba(farRib, 0.16);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(0, 0, 84, 39, 0, 0, Math.PI * 2);
  ctx.lineWidth = 3;
  ctx.strokeStyle = env.rgba(farEdge, 0.17);
  ctx.stroke();
  ctx.restore();

  const hullShadow = env.mix(C.ink, C.teal, 0.34);
  polygon([
    [-20, 228],
    [51, 215],
    [116, 221],
    [180, 208],
    [240, 216],
    [303, 203],
    [364, 211],
    [427, 195],
    [532, 199],
    [532, 268],
    [-20, 268],
  ]);
  ctx.fillStyle = hullShadow;
  ctx.fill();

  plate(
    [
      [-13, 219],
      [70, 207],
      [107, 218],
      [96, 256],
      [-13, 256],
    ],
    makeScheme('hull', 0.43, -0.07),
    0.9,
  );
  plate(
    [
      [69, 208],
      [165, 207],
      [188, 219],
      [177, 256],
      [95, 256],
      [106, 218],
    ],
    makeScheme('rust-orange', 0.32, -0.08),
    0.95,
  );
  plate(
    [
      [163, 207],
      [253, 210],
      [285, 224],
      [271, 256],
      [176, 256],
      [187, 219],
    ],
    makeScheme('hull', 0.22, -0.11),
    1,
  );
  plate(
    [
      [251, 210],
      [354, 204],
      [382, 220],
      [371, 256],
      [270, 256],
      [284, 224],
    ],
    makeScheme('rust-orange', 0.22, -0.08),
    1,
  );
  plate(
    [
      [352, 204],
      [447, 196],
      [474, 215],
      [467, 256],
      [370, 256],
      [381, 220],
    ],
    makeScheme('hull', 0.32, -0.08),
    0.95,
  );
  plate(
    [
      [446, 196],
      [526, 198],
      [526, 256],
      [466, 256],
      [473, 215],
    ],
    makeScheme('rust-orange', 0.48, -0.08),
    0.88,
  );

  function vent(x, y, w, h, fog) {
    const gap = env.mix(C.ink, C.teal, 0.2 + fog * 0.42);
    const metal = env.mix(C.hull, C.haze, fog);
    ctx.fillStyle = env.rgba(gap, 0.8);
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = env.rgba(env.shade(metal, 0.12), 0.55);
    ctx.fillRect(x, y, w, 1.4);
    for (let sx = x + 4; sx < x + w - 3; sx += 8) {
      ctx.fillStyle = env.rgba(metal, 0.62);
      ctx.fillRect(sx, y + 2, 3, h - 4);
      ctx.fillStyle = env.rgba(gap, 0.58);
      ctx.fillRect(sx + 3, y + 3, 2, h - 5);
    }
  }

  vent(14, 232, 67, 11, 0.46);
  vent(197, 229, 62, 12, 0.23);
  vent(397, 225, 73, 12, 0.39);

  drawStrut(48, 215, 62, 170, 6, 0.4);
  drawStrut(91, 217, 122, 166, 5, 0.34);
  drawStrut(151, 213, 166, 155, 7, 0.2);
  drawStrut(231, 215, 251, 155, 6, 0.16);
  drawStrut(309, 211, 322, 157, 7, 0.22);
  drawStrut(404, 207, 422, 157, 6, 0.34);
  drawStrut(474, 210, 463, 175, 5, 0.5);

  trussBeam(71, 133, 76, 89, 9, 0.4);
  trussBeam(75, 91, 181, 68, 10, 0.35);
  ctx.beginPath();
  ctx.moveTo(167, 71);
  ctx.lineTo(167, 104);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = env.rgba(env.mix(C.ink, C.teal, 0.37), 0.62);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(162, 104);
  ctx.quadraticCurveTo(167, 109, 171, 104);
  ctx.lineWidth = 2;
  ctx.strokeStyle = env.rgba(env.mix(C.hull, C.haze, 0.38), 0.7);
  ctx.stroke();

  const edgeLeft = crate(3, 178, 46, 34, 'hull', 0.58, -0.04, false);
  const edgeRight = crate(451, 176, 59, 31, 'hull', 0.58, -0.03, false);

  const leftLower = crate(
    35,
    165,
    116,
    47,
    'rust-orange',
    0.28,
    -0.05,
    true,
  );
  const centerLower = crate(
    135,
    158,
    158,
    54,
    'hull',
    0.16,
    -0.045,
    true,
  );
  const rightLower = crate(
    286,
    161,
    169,
    50,
    'rust-orange',
    0.27,
    -0.02,
    true,
  );

  const leftMid = crate(56, 130, 99, 38, 'hull', 0.31, -0.02, true);
  const centerMid = crate(
    151,
    113,
    132,
    48,
    'rust-orange',
    0.15,
    0.015,
    true,
  );
  const rightMid = crate(304, 118, 145, 45, 'hull', 0.25, -0.015, true);

  const centerUpper = crate(175, 79, 105, 38, 'hull', 0.14, 0.015, true);
  const rightUpper = crate(
    330,
    83,
    105,
    38,
    'rust-orange',
    0.25,
    0.01,
    true,
  );

  const centerTop = crate(
    197,
    55,
    70,
    28,
    'rust-orange',
    0.18,
    0.035,
    true,
  );
  const rightTop = crate(364, 60, 69, 26, 'hull', 0.31, 0.015, true);

  drawStrut(98, 124, 93, 131, 4, 0.3);
  drawStrut(140, 124, 146, 131, 4, 0.3);

  const tankX = 88;
  const tankY = 97;
  const tankW = 62;
  const tankH = 27;
  const tankScheme = makeScheme('hull', 0.29, 0.025);

  function tankPath() {
    ctx.beginPath();
    ctx.moveTo(tankX + 9, tankY);
    ctx.lineTo(tankX + tankW - 9, tankY);
    ctx.quadraticCurveTo(
      tankX + tankW,
      tankY,
      tankX + tankW,
      tankY + tankH * 0.5,
    );
    ctx.quadraticCurveTo(
      tankX + tankW,
      tankY + tankH,
      tankX + tankW - 9,
      tankY + tankH,
    );
    ctx.lineTo(tankX + 9, tankY + tankH);
    ctx.quadraticCurveTo(
      tankX,
      tankY + tankH,
      tankX,
      tankY + tankH * 0.5,
    );
    ctx.quadraticCurveTo(tankX, tankY, tankX + 9, tankY);
    ctx.closePath();
  }

  ctx.save();
  ctx.translate(2, 3);
  tankPath();
  ctx.fillStyle = env.rgba(tankScheme.gap, 0.66);
  ctx.fill();
  ctx.restore();

  const tankGradient = ctx.createLinearGradient(
    tankX,
    tankY,
    tankX + tankW,
    tankY + tankH,
  );
  tankGradient.addColorStop(0, tankScheme.light);
  tankGradient.addColorStop(0.5, tankScheme.base);
  tankGradient.addColorStop(1, tankScheme.dark);
  tankPath();
  ctx.fillStyle = tankGradient;
  ctx.fill();

  ctx.save();
  tankPath();
  ctx.clip();
  ctx.fillStyle = env.rgba(tankScheme.frame, 0.78);
  ctx.fillRect(tankX + 27, tankY - 1, 7, tankH + 2);
  ctx.fillStyle = env.rgba(tankScheme.gap, 0.48);
  ctx.fillRect(tankX + 33, tankY, 2, tankH);
  for (const sx of [tankX + 13, tankX + tankW - 15]) {
    ctx.fillStyle = env.rgba(tankScheme.gap, 0.52);
    ctx.fillRect(sx, tankY, 2.5, tankH);
    ctx.fillStyle = env.rgba(tankScheme.light, 0.36);
    ctx.fillRect(sx - 0.8, tankY + 1, 0.8, tankH - 2);
  }
  ctx.restore();

  tankPath();
  ctx.lineWidth = 2;
  ctx.strokeStyle = env.rgba(tankScheme.gap, 0.8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tankX + 8, tankY + 1);
  ctx.lineTo(tankX + tankW - 9, tankY + 1);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = env.rgba(tankScheme.light, 0.74);
  ctx.stroke();
  shadowBand(
    tankX + 4,
    tankY + tankH - 1,
    tankW - 8,
    8,
    tankScheme.gap,
    0.42,
  );

  textureMasks.push({
    x: tankX + 9,
    y: tankY + 2,
    w: tankW - 18,
    h: tankH - 4,
    light: rgb(tankScheme.light),
    dark: rgb(tankScheme.dark),
    seed: textureMasks.length + 1,
  });

  env.field(
    (x, y) => {
      let mask = null;
      for (let i = textureMasks.length - 1; i >= 0; i--) {
        const candidate = textureMasks[i];
        if (
          x >= candidate.x &&
          x < candidate.x + candidate.w &&
          y >= candidate.y &&
          y < candidate.y + candidate.h
        ) {
          mask = candidate;
          break;
        }
      }
      if (!mask) return null;

      const elongated = env.fbm(
        (x + mask.seed * 37) * 0.28,
        (y - mask.seed * 19) * 1.25,
        {
          octaves: 3,
          gain: 0.5,
          lacunarity: 2,
          period: 128,
          seed: meta.seed + 401,
        },
      );
      const banding = env.noise(
        (x + mask.seed * 11) * 0.1,
        (y + mask.seed * 7) * 1.85,
        {
          period: 94,
          seed: meta.seed + 419,
        },
      );
      const value = (elongated - 0.5) * 0.82 + (banding - 0.5) * 0.3;
      const source = value >= 0 ? mask.light : mask.dark;
      const alpha = env.clamp(5 + Math.abs(value) * 31, 5, 23);
      return [source.r, source.g, source.b, alpha];
    },
    { blend: 'over' },
  );

  function wearRect(module, count) {
    const { x, y, w, h, role, scheme } = module;
    const stain =
      role === 'hull'
        ? env.shade(C.rust, -0.18)
        : env.shade(scheme.dark, -0.05);
    const chip =
      role === 'hull'
        ? env.shade(C.hull, 0.12)
        : env.shade(C.rust, 0.17);

    for (let i = 0; i < count; i++) {
      const sx = x + 7 + wearRng() * Math.max(1, w - 14);
      const sy = y + 4 + wearRng() * Math.min(9, h * 0.25);
      const length = 5 + wearRng() * Math.max(7, h * 0.55);
      const width = 0.8 + wearRng() * 1.7;
      const g = ctx.createLinearGradient(0, sy, 0, sy + length);
      g.addColorStop(0, env.rgba(stain, 0.28));
      g.addColorStop(0.28, env.rgba(stain, 0.18));
      g.addColorStop(1, env.rgba(stain, 0));
      ctx.fillStyle = g;
      ctx.fillRect(sx, sy, width, length);

      ctx.fillStyle = env.rgba(scheme.gap, 0.72);
      ctx.beginPath();
      ctx.arc(sx + width * 0.5, sy, 1.45, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = env.rgba(chip, 0.56);
      ctx.fillRect(sx - 0.3, sy - 0.8, 1.2, 1);
    }

    for (let i = 0; i < Math.max(2, Math.floor(count * 0.55)); i++) {
      const cx = x + 5 + wearRng() * (w - 10);
      const cw = 2 + wearRng() * 5;
      ctx.fillStyle = env.rgba(chip, 0.26 + wearRng() * 0.2);
      ctx.fillRect(cx, y + 1 + wearRng() * 2, cw, 1.2);
      ctx.fillStyle = env.rgba(scheme.gap, 0.2);
      ctx.fillRect(cx + 1, y + 2.2, Math.max(1, cw - 1), 1);
    }
  }

  wearRect(edgeLeft, 3);
  wearRect(edgeRight, 3);
  wearRect(leftLower, 7);
  wearRect(centerLower, 8);
  wearRect(rightLower, 9);
  wearRect(leftMid, 5);
  wearRect(centerMid, 7);
  wearRect(rightMid, 7);
  wearRect(centerUpper, 5);
  wearRect(rightUpper, 6);
  wearRect(centerTop, 4);
  wearRect(rightTop, 4);

  function strokePipe(draw, fog) {
    const dark = env.mix(C.ink, C.teal, 0.21 + fog * 0.42);
    const metal = env.mix(C.hull, C.haze, fog);
    ctx.beginPath();
    draw(ctx);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 6;
    ctx.strokeStyle = env.rgba(dark, 0.76);
    ctx.stroke();
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = env.rgba(metal, 0.82);
    ctx.stroke();
  }

  strokePipe((c) => {
    c.moveTo(146, 113);
    c.bezierCurveTo(159, 116, 150, 138, 163, 151);
  }, 0.28);
  ctx.fillStyle = env.rgba(env.mix(C.rust, C.haze, 0.26), 0.74);
  ctx.fillRect(151, 123, 7, 2.5);
  ctx.fillRect(154, 140, 7, 2.5);

  strokePipe((c) => {
    c.moveTo(287, 205);
    c.bezierCurveTo(331, 211, 399, 207, 449, 201);
  }, 0.25);
  for (const cx of [314, 358, 407]) {
    ctx.fillStyle = env.rgba(env.mix(C.rust, C.haze, 0.22), 0.72);
    ctx.fillRect(cx, 203, 4, 5);
  }

  const warmHigh = env.shade(C.warm, -0.03);
  const warmMid = env.shade(C.warm, -0.13);
  const warmLow = env.shade(C.warm, -0.25);

  function windows(x, y, count, step, fog, litFraction) {
    const rowWidth = (count - 1) * step + 5;
    const recess = env.mix(C.ink, C.teal, 0.2 + fog * 0.46);
    const casing = env.mix(C.hull, C.haze, Math.min(0.78, fog + 0.16));
    const dimLight = env.mix(warmLow, C.haze, fog * 0.42);
    const midLight = env.mix(warmMid, C.haze, fog * 0.29);
    const states = [];

    ctx.fillStyle = env.rgba(recess, 0.64);
    ctx.fillRect(x - 3, y - 2, rowWidth + 6, 7);
    ctx.fillStyle = env.rgba(env.shade(casing, 0.12), 0.28);
    ctx.fillRect(x - 2, y - 2, rowWidth + 4, 1);

    for (let i = 0; i < count; i++) {
      const roll = windowRng();
      states.push({
        lit:
          roll < litFraction ||
          (i === Math.floor(count * 0.53) && roll < litFraction + 0.24),
        bright: windowRng() < 0.16,
        width: windowRng() < 0.28 ? 5 : 4,
      });
    }

    for (let i = 0; i < count; i++) {
      if (!states[i].lit) continue;
      const wx = x + i * step;
      const glow = states[i].bright ? midLight : dimLight;
      ctx.fillStyle = env.rgba(glow, 0.13);
      ctx.fillRect(wx - 1, y + 3, 7, 2);
      ctx.fillStyle = env.rgba(glow, 0.075);
      ctx.fillRect(wx, y + 5, 5, 2);
      ctx.fillStyle = env.rgba(glow, 0.035);
      ctx.fillRect(wx + 1, y + 7, 3, 2);
    }

    for (let i = 0; i < count; i++) {
      const wx = x + i * step;
      const state = states[i];
      ctx.fillStyle = env.rgba(casing, 0.64);
      ctx.fillRect(wx - 1, y - 1, 6, 4.5);
      ctx.fillStyle = env.rgba(recess, 0.92);
      ctx.fillRect(wx, y, state.width, 2.7);
      if (state.lit) {
        const light = state.bright ? warmHigh : state.width === 5 ? warmMid : warmLow;
        const fogged = env.mix(light, C.haze, fog * 0.34);
        ctx.fillStyle = env.rgba(fogged, state.bright ? 0.96 : 0.84);
        ctx.fillRect(wx, y, state.width, 2.35);
        ctx.fillStyle = env.rgba(warmHigh, state.bright ? 0.68 : 0.32);
        ctx.fillRect(wx + 0.5, y, Math.max(1, state.width - 1), 0.75);
      }
    }
  }

  windows(10, 188, 4, 8, 0.58, 0.48);
  windows(460, 187, 5, 8, 0.58, 0.45);

  windows(47, 179, 11, 8, 0.28, 0.62);
  windows(47, 194, 11, 8, 0.28, 0.56);

  windows(150, 174, 13, 8.5, 0.16, 0.68);
  windows(150, 192, 13, 8.5, 0.16, 0.6);

  windows(303, 177, 15, 9, 0.27, 0.63);
  windows(303, 194, 15, 9, 0.27, 0.57);

  windows(68, 141, 10, 8, 0.31, 0.6);
  windows(68, 154, 10, 8, 0.31, 0.52);

  windows(165, 127, 12, 8.5, 0.15, 0.7);
  windows(165, 144, 12, 8.5, 0.15, 0.61);

  windows(319, 132, 13, 9, 0.25, 0.62);
  windows(319, 149, 13, 9, 0.25, 0.56);

  windows(188, 91, 9, 9, 0.14, 0.67);
  windows(188, 104, 9, 9, 0.14, 0.58);

  windows(343, 95, 9, 9, 0.25, 0.62);
  windows(343, 108, 9, 9, 0.25, 0.53);

  windows(208, 68, 6, 8, 0.18, 0.65);
  windows(375, 72, 6, 8, 0.31, 0.55);

  const doorX = 270;
  const doorY = 181;
  const doorW = 13;
  const doorH = 25;
  const doorGap = env.mix(C.ink, C.teal, 0.24);

  ctx.fillStyle = env.rgba(warmMid, 0.11);
  ctx.beginPath();
  ctx.moveTo(doorX + 2, doorY + doorH - 1);
  ctx.lineTo(doorX + doorW - 2, doorY + doorH - 1);
  ctx.lineTo(doorX + doorW + 5, doorY + doorH + 8);
  ctx.lineTo(doorX - 5, doorY + doorH + 8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = env.rgba(doorGap, 0.94);
  ctx.fillRect(doorX, doorY, doorW, doorH);
  ctx.strokeStyle = env.rgba(env.shade(C.hull, 0.08), 0.82);
  ctx.lineWidth = 2;
  ctx.strokeRect(doorX - 1, doorY - 1, doorW + 2, doorH + 2);
  ctx.fillStyle = warmHigh;
  ctx.fillRect(doorX + 3, doorY + 4, 7, 6);
  ctx.fillStyle = env.rgba(warmHigh, 0.22);
  ctx.fillRect(doorX + 2, doorY + 10, 9, 5);
  ctx.fillStyle = env.rgba(env.mix(C.rust, C.haze, 0.2), 0.78);
  ctx.fillRect(doorX + 1, doorY + doorH - 4, doorW - 2, 3);

  function catwalk(x1, y1, x2, y2, fog, rail = true) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / len;
    const uy = dy / len;
    const nx = uy;
    const ny = -ux;
    const dark = env.mix(C.ink, C.teal, 0.19 + fog * 0.46);
    const deck = env.mix(C.hull, C.haze, fog);
    const rust = env.mix(C.rust, C.haze, Math.min(0.76, fog + 0.08));

    ctx.beginPath();
    ctx.moveTo(x1 - nx * 2, y1 - ny * 2);
    ctx.lineTo(x2 - nx * 2, y2 - ny * 2);
    ctx.lineWidth = 8;
    ctx.strokeStyle = env.rgba(dark, 0.78);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.lineWidth = 4.6;
    ctx.strokeStyle = env.rgba(deck, 0.94);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1 + nx, y1 + ny);
    ctx.lineTo(x2 + nx, y2 + ny);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = env.rgba(env.shade(deck, 0.14), 0.78);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x1 - nx, y1 - ny);
    ctx.lineTo(x2 - nx, y2 - ny);
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = env.rgba(rust, 0.76);
    ctx.stroke();

    const segments = Math.max(2, Math.floor(len / 13));
    const below = 7;
    for (let i = 0; i < segments; i++) {
      const t0 = i / segments;
      const t1 = (i + 1) / segments;
      ctx.beginPath();
      ctx.moveTo(
        lerp(x1, x2, t0),
        lerp(y1, y2, t0),
      );
      ctx.lineTo(
        lerp(x1, x2, t1) - nx * below,
        lerp(y1, y2, t1) - ny * below,
      );
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = env.rgba(dark, 0.66);
      ctx.stroke();
    }

    if (rail) {
      const railHeight = 8;
      ctx.beginPath();
      ctx.moveTo(x1 + nx * railHeight, y1 + ny * railHeight);
      ctx.lineTo(x2 + nx * railHeight, y2 + ny * railHeight);
      ctx.lineWidth = 2;
      ctx.strokeStyle = env.rgba(deck, 0.78);
      ctx.stroke();

      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const px = lerp(x1, x2, t);
        const py = lerp(y1, y2, t);
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + nx * railHeight, py + ny * railHeight);
        ctx.lineWidth = 1.8;
        ctx.strokeStyle = env.rgba(deck, 0.72);
        ctx.stroke();
      }
    }
  }

  catwalk(4, 188, 39, 181, 0.56, true);
  catwalk(19, 158, 61, 153, 0.43, true);
  catwalk(145, 116, 178, 105, 0.23, true);
  catwalk(276, 111, 334, 106, 0.22, true);
  catwalk(126, 169, 318, 166, 0.13, true);
  catwalk(279, 151, 310, 166, 0.2, true);
  catwalk(433, 131, 512, 120, 0.5, true);
  catwalk(450, 188, 512, 178, 0.54, true);

  function ladder(x, y1, y2, fog) {
    const dark = env.mix(C.ink, C.teal, 0.2 + fog * 0.45);
    const metal = env.mix(C.hull, C.haze, fog);

    for (const lx of [x - 3, x + 3]) {
      ctx.beginPath();
      ctx.moveTo(lx, y1);
      ctx.lineTo(lx, y2);
      ctx.lineWidth = 3.2;
      ctx.strokeStyle = env.rgba(dark, 0.68);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(lx - 0.6, y1);
      ctx.lineTo(lx - 0.6, y2);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = env.rgba(metal, 0.8);
      ctx.stroke();
    }

    for (let y = y1 + 4; y < y2 - 2; y += 6) {
      ctx.beginPath();
      ctx.moveTo(x - 3, y);
      ctx.lineTo(x + 3, y);
      ctx.lineWidth = 1.7;
      ctx.strokeStyle = env.rgba(metal, 0.74);
      ctx.stroke();
    }
  }

  ladder(123, 133, 166, 0.3);
  ladder(157, 82, 114, 0.18);
  ladder(295, 121, 166, 0.2);
  ladder(451, 132, 191, 0.42);

  function mast(x, baseY, topY, fog, bright) {
    const dark = env.mix(C.ink, C.teal, 0.2 + fog * 0.42);
    const metal = env.mix(C.hull, C.haze, fog);

    ctx.beginPath();
    ctx.moveTo(x, topY + 9);
    ctx.lineTo(x - 25, baseY);
    ctx.moveTo(x, topY + 13);
    ctx.lineTo(x + 25, baseY);
    ctx.lineWidth = 1.1;
    ctx.strokeStyle = env.rgba(metal, 0.34);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x, baseY);
    ctx.lineTo(x, topY);
    ctx.lineWidth = 4;
    ctx.strokeStyle = env.rgba(dark, 0.8);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - 0.7, baseY);
    ctx.lineTo(x - 0.7, topY);
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = env.rgba(env.shade(metal, 0.14), 0.88);
    ctx.stroke();

    for (let y = topY + 8; y < baseY - 5; y += 10) {
      const half = 6 + ((y - topY) / Math.max(1, baseY - topY)) * 4;
      ctx.beginPath();
      ctx.moveTo(x - half, y);
      ctx.lineTo(x + half, y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = env.rgba(metal, 0.78);
      ctx.stroke();
      ctx.fillStyle = env.rgba(dark, 0.7);
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    }

    if (bright) {
      const g = ctx.createRadialGradient(x, topY, 0, x, topY, 12);
      g.addColorStop(0, env.rgba(warmHigh, 0.42));
      g.addColorStop(0.35, env.rgba(warmMid, 0.18));
      g.addColorStop(1, env.rgba(warmMid, 0));
      ctx.fillStyle = g;
      ctx.fillRect(x - 12, topY - 12, 24, 24);
      ctx.fillStyle = warmHigh;
      ctx.fillRect(x - 1.5, topY - 1.5, 3, 3);
    } else {
      ctx.fillStyle = env.rgba(env.shade(metal, 0.17), 0.82);
      ctx.fillRect(x - 1, topY - 1, 2, 3);
    }
  }

  mast(222, 51, 18, 0.13, true);
  mast(398, 56, 27, 0.32, false);
  mast(116, 96, 74, 0.35, false);

  ctx.beginPath();
  ctx.moveTo(251, 52);
  ctx.lineTo(251, 34);
  ctx.lineWidth = 3;
  ctx.strokeStyle = env.rgba(env.mix(C.ink, C.teal, 0.26), 0.76);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(250.3, 52);
  ctx.lineTo(250.3, 34);
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = env.rgba(env.mix(C.hull, C.haze, 0.18), 0.8);
  ctx.stroke();

  const atmosphericRgb = rgb(env.mix(C.teal, C.haze, 0.63));
  env.field(
    (x, y, u, v) => {
      const side = env.clamp((Math.abs(u - 0.5) - 0.28) / 0.22, 0, 1);
      const lower = env.clamp((v - 0.84) / 0.16, 0, 1);
      if (side <= 0 && lower <= 0) return null;
      const dither = env.noise(x * 0.71, y * 0.71, {
        period: 74,
        seed: meta.seed + 991,
      });
      const alpha =
        255 *
        env.clamp(
          side * 0.29 + lower * 0.045 + (dither - 0.5) * 0.018,
          0,
          0.34,
        );
      if (alpha < 0.75) return null;
      return [
        atmosphericRgb.r,
        atmosphericRgb.g,
        atmosphericRgb.b,
        alpha,
      ];
    },
    { blend: 'over' },
  );
}
