export const meta = {
  id: 'backdrop-spine-coil',
  size: { w: 512, h: 512 },
  seed: 187307,
  roles: ['deep-teal', 'haze', 'ink', 'hull', 'warm-white'],
};

export function render(ctx, env) {
  const W = env.width;
  const H = env.height;
  const TAU = Math.PI * 2;
  const deep = env.PALETTE['deep-teal'];
  const haze = env.PALETTE.haze;
  const ink = env.PALETTE.ink;
  const hull = env.PALETTE.hull;
  const warm = env.PALETTE['warm-white'];
  const clamp = env.clamp;
  const lerp = env.lerp;

  ctx.imageSmoothingEnabled = true;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const bgTop = env.hexToRgb(
    env.shade(env.mix(deep, haze, 0.58), 0.12)
  );
  const bgBottom = env.hexToRgb(
    env.shade(env.mix(deep, haze, 0.2), -0.2)
  );

  env.field((x, y, u, v) => {
    const broad = env.fbm(x * 0.37, y * 0.31, {
      octaves: 4,
      gain: 0.53,
      lacunarity: 2.03,
      period: 223,
      seed: env.seed + 11,
    });
    const verticalGrain = env.noise(x * 1.84, y * 0.19, {
      period: 137,
      seed: env.seed + 12,
    });
    const fine = env.noise(x * 3.1, y * 2.3, {
      period: 89,
      seed: env.seed + 13,
    });

    const depth = clamp(
      env.smoothstep(v) * 0.82 +
        (broad - 0.5) * 0.17 +
        (u - 0.5) * 0.055,
      0,
      1
    );
    const grain = (fine - 0.5) * 2.8 + (verticalGrain - 0.5) * 1.7;

    return [
      Math.round(clamp(lerp(bgTop.r, bgBottom.r, depth) + grain, 0, 255)),
      Math.round(clamp(lerp(bgTop.g, bgBottom.g, depth) + grain, 0, 255)),
      Math.round(clamp(lerp(bgTop.b, bgBottom.b, depth) + grain, 0, 255)),
      255,
    ];
  }, { blend: 'replace' });

  const ghostDark = env.shade(env.mix(deep, haze, 0.61), -0.14);
  const ghostLight = env.shade(env.mix(deep, haze, 0.72), 0.05);

  ctx.save();
  ctx.filter = 'blur(2.2px)';

  const ghostArcs = [
    [-122, 137, 210, 124, 0.23, -1.32, 1.18, 26, 0.1],
    [-76, 342, 192, 116, -0.18, -1.24, 1.05, 19, 0.08],
    [624, 158, 224, 137, -0.16, 1.9, 4.36, 28, 0.11],
    [590, 382, 185, 112, 0.27, 1.82, 4.45, 20, 0.09],
  ];

  for (const arc of ghostArcs) {
    ctx.beginPath();
    ctx.ellipse(
      arc[0], arc[1], arc[2], arc[3],
      arc[4], arc[5], arc[6]
    );
    ctx.lineWidth = arc[7];
    ctx.strokeStyle = env.rgba(ghostDark, arc[8]);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(
      arc[0] - 2, arc[1] - 3, arc[2], arc[3],
      arc[4], arc[5], arc[6]
    );
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = env.rgba(ghostLight, arc[8] * 0.72);
    ctx.stroke();
  }

  const ghostTubes = [
    [-24, -34, 45, 87, 101, 171, 77, 284, 34, 0.075],
    [550, -28, 488, 91, 447, 151, 472, 278, 42, 0.07],
    [91, 540, 132, 447, 130, 391, 92, 324, 28, 0.055],
    [439, 546, 406, 464, 420, 391, 461, 319, 31, 0.06],
  ];

  for (const tube of ghostTubes) {
    ctx.beginPath();
    ctx.moveTo(tube[0], tube[1]);
    ctx.bezierCurveTo(
      tube[2], tube[3], tube[4], tube[5], tube[6], tube[7]
    );
    ctx.lineWidth = tube[8];
    ctx.strokeStyle = env.rgba(ghostDark, tube[9]);
    ctx.stroke();

    ctx.setLineDash([19, 8]);
    ctx.lineWidth = 2;
    ctx.strokeStyle = env.rgba(ghostLight, tube[9] * 0.75);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();

  const vertebrae = [
    { cx: 220, cy: 18,  w: 78,  h: 44, depth: 0.12, angle: -0.026 },
    { cx: 228, cy: 81,  w: 92,  h: 50, depth: 0.24, angle: -0.019 },
    { cx: 236, cy: 149, w: 108, h: 56, depth: 0.38, angle: -0.009 },
    { cx: 246, cy: 224, w: 126, h: 62, depth: 0.53, angle: 0.008 },
    { cx: 258, cy: 306, w: 146, h: 68, depth: 0.68, angle: 0.024 },
    { cx: 274, cy: 397, w: 166, h: 75, depth: 0.84, angle: 0.04 },
    { cx: 294, cy: 497, w: 190, h: 86, depth: 0.98, angle: 0.055 },
  ];

  for (const v of vertebrae) {
    v.c = Math.cos(v.angle);
    v.s = Math.sin(v.angle);
    v.metal = env.mix(haze, hull, 0.1 + v.depth * 0.5);
    v.light = env.mix(haze, hull, 0.22 + v.depth * 0.56);
    v.dark = env.mix(haze, ink, 0.12 + v.depth * 0.46);
    v.midDark = env.shade(v.metal, -0.09);
  }

  function spineCurve(offsetX = 0) {
    ctx.beginPath();
    ctx.moveTo(218 + offsetX, -30);
    ctx.bezierCurveTo(
      216 + offsetX, 85,
      230 + offsetX, 165,
      244 + offsetX, 236
    );
    ctx.bezierCurveTo(
      257 + offsetX, 310,
      270 + offsetX, 407,
      301 + offsetX, 550
    );
  }

  ctx.save();
  const coreOuter = ctx.createLinearGradient(0, 0, 0, H);
  coreOuter.addColorStop(0, env.rgba(env.mix(haze, ink, 0.24), 0.11));
  coreOuter.addColorStop(0.5, env.rgba(env.mix(haze, ink, 0.52), 0.42));
  coreOuter.addColorStop(1, env.rgba(env.mix(haze, ink, 0.72), 0.72));
  spineCurve();
  ctx.lineWidth = 58;
  ctx.strokeStyle = coreOuter;
  ctx.stroke();

  const coreInner = ctx.createLinearGradient(0, 0, 0, H);
  coreInner.addColorStop(0, env.rgba(env.mix(haze, hull, 0.08), 0.06));
  coreInner.addColorStop(0.55, env.rgba(env.mix(haze, hull, 0.18), 0.22));
  coreInner.addColorStop(1, env.rgba(env.mix(haze, hull, 0.3), 0.34));
  spineCurve(-5);
  ctx.lineWidth = 28;
  ctx.strokeStyle = coreInner;
  ctx.stroke();

  for (const offset of [-13, 14]) {
    const cable = ctx.createLinearGradient(0, 0, 0, H);
    cable.addColorStop(0, env.rgba(haze, 0.04));
    cable.addColorStop(1, env.rgba(env.mix(haze, hull, 0.35), 0.43));
    spineCurve(offset);
    ctx.lineWidth = 3;
    ctx.strokeStyle = cable;
    ctx.stroke();
  }
  ctx.restore();

  const ribRng = env.stream('backdrop-spine-ribs');

  function drawRib(v, side, reach, sweep) {
    const bx = v.cx + side * v.w * 0.4;
    const by = v.cy + v.h * 0.025;
    const p0 = { x: bx, y: by };
    const p1 = {
      x: bx + side * reach * 0.25,
      y: by + sweep * 0.05 - 7,
    };
    const p2 = {
      x: bx + side * reach * 0.72,
      y: by + sweep * 0.78,
    };
    const p3 = {
      x: bx + side * reach,
      y: by + sweep,
    };
    const rootThickness = 15 + v.depth * 12;
    const tipThickness = 3.5;
    const samples = 26;
    const top = [];
    const bottom = [];

    function geometry(t) {
      const m = 1 - t;
      const x =
        m * m * m * p0.x +
        3 * m * m * t * p1.x +
        3 * m * t * t * p2.x +
        t * t * t * p3.x;
      const y =
        m * m * m * p0.y +
        3 * m * m * t * p1.y +
        3 * m * t * t * p2.y +
        t * t * t * p3.y;
      const dx =
        3 * m * m * (p1.x - p0.x) +
        6 * m * t * (p2.x - p1.x) +
        3 * t * t * (p3.x - p2.x);
      const dy =
        3 * m * m * (p1.y - p0.y) +
        6 * m * t * (p2.y - p1.y) +
        3 * t * t * (p3.y - p2.y);
      const length = Math.hypot(dx, dy) || 1;
      let nx = -dy / length;
      let ny = dx / length;

      if (ny > 0) {
        nx = -nx;
        ny = -ny;
      }

      const taper = Math.pow(t, 0.82);
      const half = lerp(rootThickness, tipThickness, taper) * 0.5;

      return {
        x,
        y,
        nx,
        ny,
        tx: dx / length,
        ty: dy / length,
        half,
      };
    }

    for (let i = 0; i < samples; i++) {
      const g = geometry(i / (samples - 1));
      top.push({
        x: g.x + g.nx * g.half,
        y: g.y + g.ny * g.half,
      });
      bottom.push({
        x: g.x - g.nx * g.half,
        y: g.y - g.ny * g.half,
      });
    }

    function ribPath(dx = 0, dy = 0) {
      ctx.beginPath();
      ctx.moveTo(top[0].x + dx, top[0].y + dy);
      for (let i = 1; i < top.length; i++) {
        ctx.lineTo(top[i].x + dx, top[i].y + dy);
      }
      for (let i = bottom.length - 1; i >= 0; i--) {
        ctx.lineTo(bottom[i].x + dx, bottom[i].y + dy);
      }
      ctx.closePath();
    }

    const tipColor = env.mix(deep, haze, 0.6);
    const ribBase = env.mix(
      haze,
      hull,
      clamp(0.12 + v.depth * 0.46 + (side < 0 ? 0.04 : 0), 0, 0.75)
    );
    const ribMid = env.mix(haze, hull, 0.06 + v.depth * 0.23);
    const ribDark = env.mix(haze, ink, 0.12 + v.depth * 0.43);

    ctx.save();
    ribPath(1.5, 4);
    const shadow = ctx.createLinearGradient(p3.x, p3.y, p0.x, p0.y);
    shadow.addColorStop(0, env.rgba(tipColor, 0));
    shadow.addColorStop(0.45, env.rgba(ribDark, 0.06 + v.depth * 0.1));
    shadow.addColorStop(1, env.rgba(ribDark, 0.28 + v.depth * 0.42));
    ctx.fillStyle = shadow;
    ctx.fill();

    ribPath();
    const body = ctx.createLinearGradient(p3.x, p3.y, p0.x, p0.y);
    body.addColorStop(0, env.rgba(tipColor, 0.025 + v.depth * 0.018));
    body.addColorStop(0.26, env.rgba(ribMid, 0.09 + v.depth * 0.16));
    body.addColorStop(0.68, env.rgba(ribBase, 0.29 + v.depth * 0.38));
    body.addColorStop(1, env.rgba(ribBase, 0.52 + v.depth * 0.43));
    ctx.fillStyle = body;
    ctx.fill();

    const underside = ctx.createLinearGradient(p3.x, p3.y, p0.x, p0.y);
    underside.addColorStop(0, env.rgba(ribDark, 0));
    underside.addColorStop(0.55, env.rgba(ribDark, 0.13 + v.depth * 0.16));
    underside.addColorStop(1, env.rgba(ribDark, 0.44 + v.depth * 0.36));
    ctx.beginPath();
    ctx.moveTo(bottom[0].x, bottom[0].y);
    for (let i = 1; i < bottom.length; i++) {
      ctx.lineTo(bottom[i].x, bottom[i].y);
    }
    ctx.lineWidth = 2.2 + v.depth * 1.8;
    ctx.strokeStyle = underside;
    ctx.stroke();

    const edgeLight = ctx.createLinearGradient(p3.x, p3.y, p0.x, p0.y);
    edgeLight.addColorStop(0, env.rgba(v.light, 0));
    edgeLight.addColorStop(0.48, env.rgba(v.light, 0.08 + v.depth * 0.12));
    edgeLight.addColorStop(1, env.rgba(v.light, 0.28 + v.depth * 0.35));
    ctx.beginPath();
    ctx.moveTo(top[0].x, top[0].y);
    for (let i = 1; i < top.length; i++) {
      ctx.lineTo(top[i].x, top[i].y);
    }
    ctx.lineWidth = 1.2 + v.depth * 1.25;
    ctx.strokeStyle = edgeLight;
    ctx.stroke();

    for (let seam = 0; seam < 6; seam++) {
      const t = 0.13 + seam * 0.135;
      const g = geometry(t);
      const fade = Math.pow(1 - t, 0.8);
      const ax = g.x + g.nx * g.half * 0.88;
      const ay = g.y + g.ny * g.half * 0.88;
      const bx2 = g.x - g.nx * g.half * 0.88;
      const by2 = g.y - g.ny * g.half * 0.88;

      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx2, by2);
      ctx.lineWidth = 1.6 + v.depth * 0.9;
      ctx.strokeStyle = env.rgba(
        ribDark,
        (0.13 + v.depth * 0.34) * fade
      );
      ctx.stroke();

      const shift = 1.25;
      ctx.beginPath();
      ctx.moveTo(ax - g.tx * shift, ay - g.ty * shift);
      ctx.lineTo(bx2 - g.tx * shift, by2 - g.ty * shift);
      ctx.lineWidth = 0.9 + v.depth * 0.55;
      ctx.strokeStyle = env.rgba(
        v.light,
        (0.07 + v.depth * 0.17) * fade
      );
      ctx.stroke();
    }

    const wearCount = 5 + Math.round(v.depth * 8);
    for (let i = 0; i < wearCount; i++) {
      const t0 = 0.06 + ribRng() * 0.77;
      const t1 = Math.min(0.91, t0 + 0.025 + ribRng() * 0.07);
      const g0 = geometry(t0);
      const g1 = geometry(t1);
      const offset = (ribRng() - 0.5) * g0.half * 0.78;
      const isLight = ribRng() > 0.38;

      ctx.beginPath();
      ctx.moveTo(
        g0.x + g0.nx * offset,
        g0.y + g0.ny * offset
      );
      ctx.lineTo(
        g1.x + g1.nx * offset,
        g1.y + g1.ny * offset
      );
      ctx.lineWidth = 0.7 + ribRng() * 1.1;
      ctx.strokeStyle = env.rgba(
        isLight ? v.light : ribDark,
        (0.045 + v.depth * 0.13) * (1 - t0)
      );
      ctx.stroke();
    }

    const rootShade = ctx.createRadialGradient(
      p0.x - 3, p0.y - 3, 1,
      p0.x, p0.y, 31
    );
    rootShade.addColorStop(
      0,
      env.rgba(ribDark, 0.24 + v.depth * 0.34)
    );
    rootShade.addColorStop(0.52, env.rgba(ribDark, 0.11 + v.depth * 0.13));
    rootShade.addColorStop(1, env.rgba(ribDark, 0));
    ctx.fillStyle = rootShade;
    ctx.beginPath();
    ctx.ellipse(p0.x, p0.y, 32, 17, v.angle, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  for (let i = 1; i < vertebrae.length; i++) {
    const v = vertebrae[i];
    const phase = i % 2 ? -1 : 1;
    drawRib(v, -1, 176 + i * 8, phase * (21 + i * 3));
    drawRib(v, 1, 220 - i * 7, -phase * (31 + i * 2.2));
  }

  function drawJoint(v, direction) {
    const y = direction * (v.h * 0.5 + 4);
    const alpha = 0.23 + v.depth * 0.63;
    const jointDark = env.mix(haze, ink, 0.27 + v.depth * 0.55);
    const jointEdge = env.mix(haze, hull, 0.08 + v.depth * 0.25);

    ctx.save();
    ctx.translate(v.cx, v.cy);
    ctx.rotate(v.angle);

    const soft = ctx.createRadialGradient(
      -v.w * 0.07, y - 3, 1,
      0, y, v.w * 0.44
    );
    soft.addColorStop(0, env.rgba(jointDark, alpha));
    soft.addColorStop(0.48, env.rgba(jointDark, alpha * 0.78));
    soft.addColorStop(1, env.rgba(jointDark, 0));

    ctx.fillStyle = soft;
    ctx.beginPath();
    ctx.ellipse(0, y, v.w * 0.43, 14, 0, 0, TAU);
    ctx.fill();

    ctx.fillStyle = env.rgba(jointDark, alpha * 0.86);
    ctx.beginPath();
    ctx.ellipse(0, y, v.w * 0.31, 6.2, 0, 0, TAU);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(0, y - 0.8, v.w * 0.35, 9.2, 0, Math.PI, TAU);
    ctx.lineWidth = 1.3 + v.depth * 0.9;
    ctx.strokeStyle = env.rgba(jointEdge, 0.08 + v.depth * 0.22);
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(0, y + 0.8, v.w * 0.35, 9.2, 0, 0, Math.PI);
    ctx.lineWidth = 2 + v.depth;
    ctx.strokeStyle = env.rgba(jointDark, 0.2 + v.depth * 0.4);
    ctx.stroke();

    ctx.restore();
  }

  for (const v of vertebrae) {
    drawJoint(v, -1);
    drawJoint(v, 1);
  }

  function bodyPath(v) {
    const w = v.w;
    const h = v.h;

    ctx.beginPath();
    ctx.moveTo(-w * 0.29, -h * 0.5);
    ctx.bezierCurveTo(
      -w * 0.42, -h * 0.515,
      -w * 0.5, -h * 0.4,
      -w * 0.5, -h * 0.24
    );
    ctx.bezierCurveTo(
      -w * 0.535, -h * 0.08,
      -w * 0.525, h * 0.14,
      -w * 0.48, h * 0.3
    );
    ctx.bezierCurveTo(
      -w * 0.44, h * 0.445,
      -w * 0.35, h * 0.5,
      -w * 0.27, h * 0.5
    );
    ctx.lineTo(w * 0.27, h * 0.5);
    ctx.bezierCurveTo(
      w * 0.38, h * 0.49,
      w * 0.47, h * 0.4,
      w * 0.49, h * 0.27
    );
    ctx.bezierCurveTo(
      w * 0.53, h * 0.1,
      w * 0.525, -h * 0.12,
      w * 0.495, -h * 0.27
    );
    ctx.bezierCurveTo(
      w * 0.47, -h * 0.42,
      w * 0.39, -h * 0.5,
      w * 0.29, -h * 0.5
    );
    ctx.closePath();
  }

  function halfWidth(v, localY) {
    const t = (localY + v.h * 0.5) / v.h;
    if (t < 0 || t > 1) return 0;
    return v.w * (
      0.305 +
      0.208 * Math.pow(Math.sin(Math.PI * t), 0.62)
    );
  }

  function drawBodyBase(v) {
    ctx.save();
    ctx.translate(v.cx + 3, v.cy + 4);
    ctx.rotate(v.angle);
    bodyPath(v);
    ctx.fillStyle = env.rgba(v.dark, 0.35 + v.depth * 0.55);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.translate(v.cx, v.cy);
    ctx.rotate(v.angle);
    bodyPath(v);

    const metal = ctx.createLinearGradient(
      -v.w * 0.5, -v.h * 0.52,
      v.w * 0.5, v.h * 0.52
    );
    metal.addColorStop(0, v.light);
    metal.addColorStop(0.18, v.metal);
    metal.addColorStop(0.7, v.midDark);
    metal.addColorStop(1, v.dark);
    ctx.fillStyle = metal;
    ctx.fill();

    ctx.save();
    bodyPath(v);
    ctx.clip();
    const undercut = ctx.createLinearGradient(
      0, -v.h * 0.08,
      0, v.h * 0.54
    );
    undercut.addColorStop(0, env.rgba(v.dark, 0));
    undercut.addColorStop(
      0.72,
      env.rgba(v.dark, 0.08 + v.depth * 0.11)
    );
    undercut.addColorStop(
      1,
      env.rgba(v.dark, 0.23 + v.depth * 0.25)
    );
    ctx.fillStyle = undercut;
    ctx.fillRect(-v.w, -v.h, v.w * 2, v.h * 2);
    ctx.restore();

    bodyPath(v);
    ctx.lineWidth = 1.8 + v.depth * 1.6;
    ctx.strokeStyle = env.rgba(v.dark, 0.24 + v.depth * 0.5);
    ctx.stroke();
    ctx.restore();
  }

  for (const v of vertebrae) {
    drawBodyBase(v);
  }

  const textureLight = env.hexToRgb(env.shade(hull, 0.08));
  const textureDark = env.hexToRgb(env.mix(ink, haze, 0.36));

  env.field((x, y) => {
    let found = -1;
    let localX = 0;
    let localY = 0;
    let edge = 0;

    for (let i = vertebrae.length - 1; i >= 0; i--) {
      const v = vertebrae[i];
      const dx = x - v.cx;
      const dy = y - v.cy;
      const lx = v.c * dx + v.s * dy;
      const ly = -v.s * dx + v.c * dy;
      const hw = halfWidth(v, ly);

      if (hw > 0 && Math.abs(lx) < hw - 1.3) {
        found = i;
        localX = lx;
        localY = ly;
        edge = clamp((hw - Math.abs(lx) - 1.3) / 5, 0, 1);
        break;
      }
    }

    if (found < 0) return null;

    const v = vertebrae[found];
    const alongPlate = env.fbm(
      x * 0.31 + found * 13,
      y * 2.65,
      {
        octaves: 3,
        gain: 0.5,
        lacunarity: 2.08,
        period: 173,
        seed: env.seed + 271 + found * 17,
      }
    );
    const fluidLane = env.noise(
      x * 2.18,
      y * 0.17 + found * 9,
      {
        period: 149,
        seed: env.seed + 341 + found,
      }
    );
    const broadBlotch = env.noise(
      localX * 0.23,
      localY * 0.63,
      {
        period: 97,
        seed: env.seed + 419 + found,
      }
    );

    const signed =
      (alongPlate - 0.5) * 0.78 +
      (fluidLane - 0.5) * 0.31 +
      (broadBlotch - 0.5) * 0.26;
    const alpha = Math.round(
      (3.5 + Math.abs(signed) * 25) *
      (0.32 + v.depth * 0.68) *
      env.smoothstep(edge)
    );
    const color = signed < 0 ? textureDark : textureLight;

    return [color.r, color.g, color.b, alpha];
  }, { blend: 'over' });

  const detailRng = env.stream('backdrop-spine-surface');

  function beltPath(v, y, height) {
    const hw = Math.max(8, halfWidth(v, y) - 2);
    ctx.beginPath();
    ctx.moveTo(-hw, y - height * 0.46);
    ctx.quadraticCurveTo(0, y - height * 0.63, hw, y - height * 0.46);
    ctx.lineTo(hw - 1.5, y + height * 0.47);
    ctx.quadraticCurveTo(0, y + height * 0.62, -hw + 1.5, y + height * 0.47);
    ctx.closePath();
    return hw;
  }

  function drawBodyDetails(v) {
    const d = v.depth;

    ctx.save();
    ctx.translate(v.cx, v.cy);
    ctx.rotate(v.angle);

    ctx.save();
    bodyPath(v);
    ctx.clip();

    const blotches = 7 + Math.round(v.w * v.h / 520);
    for (let i = 0; i < blotches; i++) {
      const x = (detailRng() - 0.5) * v.w * 1.03;
      const y = (detailRng() - 0.5) * v.h * 0.92;
      const rx = 4 + detailRng() * 14;
      const ry = 1.2 + detailRng() * 3.4;
      const pale = detailRng() > 0.72;

      ctx.fillStyle = env.rgba(
        pale ? v.light : v.dark,
        0.018 + detailRng() * (0.035 + d * 0.035)
      );
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, detailRng() * 0.12 - 0.06, 0, TAU);
      ctx.fill();
    }

    for (const sx of [-v.w * 0.235, v.w * 0.215]) {
      ctx.beginPath();
      ctx.moveTo(sx, -v.h * 0.4);
      ctx.lineTo(sx + v.h * 0.035, v.h * 0.39);
      ctx.lineWidth = 1.5 + d * 1.35;
      ctx.strokeStyle = env.rgba(v.dark, 0.18 + d * 0.39);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(sx - 1.5, -v.h * 0.39);
      ctx.lineTo(sx - 1.5 + v.h * 0.035, v.h * 0.38);
      ctx.lineWidth = 0.8 + d * 0.6;
      ctx.strokeStyle = env.rgba(v.light, 0.07 + d * 0.18);
      ctx.stroke();
    }

    const belts = [
      [-v.h * 0.3, 7 + d * 3],
      [v.h * 0.01, 9 + d * 4],
      [v.h * 0.31, 7 + d * 3],
    ];

    for (const belt of belts) {
      const y = belt[0];
      const bh = belt[1];
      const hw = beltPath(v, y, bh);
      const beltFill = ctx.createLinearGradient(
        -hw, y - bh,
        hw, y + bh
      );
      beltFill.addColorStop(0, v.light);
      beltFill.addColorStop(0.45, v.metal);
      beltFill.addColorStop(1, v.dark);
      ctx.globalAlpha = 0.2 + d * 0.18;
      ctx.fillStyle = beltFill;
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.moveTo(-hw + 1, y + bh * 0.46);
      ctx.quadraticCurveTo(0, y + bh * 0.63, hw - 1, y + bh * 0.46);
      ctx.lineWidth = 1.8 + d * 1.2;
      ctx.strokeStyle = env.rgba(v.dark, 0.27 + d * 0.43);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-hw + 2, y - bh * 0.46);
      ctx.quadraticCurveTo(0, y - bh * 0.63, hw - 2, y - bh * 0.46);
      ctx.lineWidth = 1 + d * 0.75;
      ctx.strokeStyle = env.rgba(v.light, 0.12 + d * 0.31);
      ctx.stroke();
    }

    const dripCount = 3 + Math.round(d * 7);
    for (let i = 0; i < dripCount; i++) {
      const sourceY = belts[Math.floor(detailRng() * belts.length)][0] + 3;
      const x = (detailRng() - 0.5) * v.w * 0.72;
      const length = 7 + detailRng() * (12 + d * 19);
      const bend = (detailRng() - 0.5) * 2.5;

      ctx.beginPath();
      ctx.moveTo(x, sourceY);
      ctx.bezierCurveTo(
        x + bend * 0.2, sourceY + length * 0.34,
        x + bend, sourceY + length * 0.7,
        x + bend * 0.7, sourceY + length
      );
      ctx.lineWidth = 1.1 + detailRng() * (1.3 + d);
      ctx.strokeStyle = env.rgba(
        v.dark,
        0.06 + detailRng() * (0.08 + d * 0.12)
      );
      ctx.stroke();

      if (detailRng() > 0.62) {
        ctx.beginPath();
        ctx.moveTo(x - 0.9, sourceY + 1);
        ctx.lineTo(x - 0.5, sourceY + length * 0.48);
        ctx.lineWidth = 0.7;
        ctx.strokeStyle = env.rgba(v.light, 0.035 + d * 0.06);
        ctx.stroke();
      }
    }

    const scratchCount = 6 + Math.round(v.w / 9);
    for (let i = 0; i < scratchCount; i++) {
      const edgeBias = detailRng();
      const side = detailRng() < 0.5 ? -1 : 1;
      const x = edgeBias < 0.58
        ? side * (v.w * (0.25 + detailRng() * 0.22))
        : (detailRng() - 0.5) * v.w * 0.72;
      const y = (detailRng() - 0.5) * v.h * 0.82;
      const length = 4 + detailRng() * (8 + d * 13);
      const isLight = detailRng() > 0.32;

      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(
        x + side * length,
        y + (detailRng() - 0.5) * 2
      );
      ctx.lineWidth = 0.65 + detailRng() * 1.05;
      ctx.strokeStyle = env.rgba(
        isLight ? v.light : v.dark,
        0.055 + detailRng() * (0.08 + d * 0.1)
      );
      ctx.stroke();
    }

    const boltRows = [-v.h * 0.3, v.h * 0.01, v.h * 0.31];
    for (const y of boltRows) {
      for (const x of [-v.w * 0.37, v.w * 0.37]) {
        const radius = 1.7 + d * 0.65;
        ctx.fillStyle = env.rgba(v.dark, 0.34 + d * 0.48);
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, TAU);
        ctx.fill();

        ctx.fillStyle = env.rgba(v.light, 0.12 + d * 0.31);
        ctx.beginPath();
        ctx.arc(
          x - radius * 0.3,
          y - radius * 0.32,
          radius * 0.34,
          0,
          TAU
        );
        ctx.fill();
      }
    }

    ctx.restore();

    ctx.beginPath();
    ctx.moveTo(-v.w * 0.29, -v.h * 0.5);
    ctx.bezierCurveTo(
      -v.w * 0.42, -v.h * 0.515,
      -v.w * 0.5, -v.h * 0.4,
      -v.w * 0.5, -v.h * 0.23
    );
    ctx.bezierCurveTo(
      -v.w * 0.535, -v.h * 0.08,
      -v.w * 0.52, v.h * 0.12,
      -v.w * 0.48, v.h * 0.28
    );
    ctx.lineWidth = 1.2 + d * 1.2;
    ctx.strokeStyle = env.rgba(v.light, 0.13 + d * 0.36);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(v.w * 0.29, -v.h * 0.5);
    ctx.bezierCurveTo(
      v.w * 0.44, -v.h * 0.47,
      v.w * 0.515, -v.h * 0.31,
      v.w * 0.51, -v.h * 0.08
    );
    ctx.bezierCurveTo(
      v.w * 0.52, v.h * 0.18,
      v.w * 0.43, v.h * 0.46,
      v.w * 0.27, v.h * 0.5
    );
    ctx.lineWidth = 2 + d * 1.45;
    ctx.strokeStyle = env.rgba(v.dark, 0.25 + d * 0.51);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-v.w * 0.27, v.h * 0.5);
    ctx.quadraticCurveTo(0, v.h * 0.54, v.w * 0.27, v.h * 0.5);
    ctx.lineWidth = 2.2 + d * 1.4;
    ctx.strokeStyle = env.rgba(v.dark, 0.29 + d * 0.49);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-v.w * 0.28, -v.h * 0.5);
    ctx.quadraticCurveTo(0, -v.h * 0.54, v.w * 0.28, -v.h * 0.5);
    ctx.lineWidth = 1.1 + d;
    ctx.strokeStyle = env.rgba(v.light, 0.14 + d * 0.31);
    ctx.stroke();

    ctx.restore();
  }

  for (const v of vertebrae) {
    drawBodyDetails(v);
  }

  const galleryRng = env.stream('backdrop-spine-galleries');

  function drawGallery(v, side) {
    const p0 = side * v.w * 0.04;
    const p1 = side * (v.w * 0.56 + 24);
    const d = v.depth;
    const galleryDark = env.mix(haze, ink, 0.32 + d * 0.48);
    const galleryMetal = env.mix(haze, hull, 0.18 + d * 0.48);
    const galleryLight = env.mix(haze, hull, 0.32 + d * 0.52);
    const warmDim = env.mix(warm, haze, 0.1);

    function podPath(dy = 0) {
      ctx.beginPath();
      ctx.moveTo(p0, -6 + dy);
      ctx.lineTo(p1, -4 + dy);
      ctx.lineTo(p1, 7 + dy);
      ctx.lineTo(p0, 8 + dy);
      ctx.closePath();
    }

    ctx.save();
    ctx.translate(v.cx, v.cy);
    ctx.rotate(v.angle);

    ctx.strokeStyle = env.rgba(galleryDark, 0.45 + d * 0.42);
    ctx.lineWidth = 2.2 + d * 0.7;
    for (const t of [0.22, 0.52, 0.82]) {
      const x = lerp(p0, p1, t);
      const attach = clamp(x * 0.72, -v.w * 0.43, v.w * 0.43);
      ctx.beginPath();
      ctx.moveTo(x, 7);
      ctx.lineTo(attach, v.h * 0.35);
      ctx.stroke();
    }

    podPath(4);
    ctx.fillStyle = env.rgba(galleryDark, 0.54 + d * 0.4);
    ctx.fill();

    podPath();
    const shell = ctx.createLinearGradient(0, -7, 0, 9);
    shell.addColorStop(0, galleryLight);
    shell.addColorStop(0.4, galleryMetal);
    shell.addColorStop(1, galleryDark);
    ctx.fillStyle = shell;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(p0, -6);
    ctx.lineTo(p1, -4);
    ctx.lineWidth = 1.2 + d * 0.7;
    ctx.strokeStyle = env.rgba(galleryLight, 0.32 + d * 0.4);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(p0, 8);
    ctx.lineTo(p1, 7);
    ctx.lineWidth = 2.1 + d;
    ctx.strokeStyle = env.rgba(galleryDark, 0.44 + d * 0.44);
    ctx.stroke();

    for (let i = 0; i < 5; i++) {
      const start = 0.08 + galleryRng() * 0.55;
      const length = 0.08 + galleryRng() * 0.2;
      const y = -2 + galleryRng() * 7;
      ctx.beginPath();
      ctx.moveTo(lerp(p0, p1, start), y);
      ctx.lineTo(lerp(p0, p1, Math.min(0.94, start + length)), y + 0.4);
      ctx.lineWidth = 0.8 + galleryRng() * 0.8;
      ctx.strokeStyle = env.rgba(
        galleryRng() > 0.7 ? galleryLight : galleryDark,
        0.07 + d * 0.08
      );
      ctx.stroke();
    }

    const count = Math.max(7, Math.floor(Math.abs(p1 - p0) / 10));
    for (let i = 0; i < count; i++) {
      const t = (i + 0.72) / (count + 0.45);
      const x = lerp(p0, p1, t);
      const y = 1.2 - t * 0.7;

      const glow = ctx.createRadialGradient(x, y, 0.4, x, y, 5.2);
      glow.addColorStop(0, env.rgba(warm, 0.2 + d * 0.16));
      glow.addColorStop(1, env.rgba(warm, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(x - 6, y - 6, 12, 12);

      ctx.fillStyle = env.rgba(galleryDark, 0.75);
      ctx.fillRect(x - 2.25, y - 1.8, 4.5, 3.7);

      ctx.fillStyle = env.rgba(
        i === count - 2 ? warm : warmDim,
        i === count - 2 ? 0.92 : 0.62 + d * 0.17
      );
      ctx.fillRect(x - 1.5, y - 1.15, 3, 2.35);
    }

    const railY0 = -11.5;
    const railY1 = -9.5;
    ctx.beginPath();
    ctx.moveTo(p0, railY0);
    ctx.lineTo(p1, railY1);
    ctx.lineWidth = 1.25 + d * 0.35;
    ctx.strokeStyle = env.rgba(galleryLight, 0.28 + d * 0.35);
    ctx.stroke();

    const posts = Math.max(5, Math.floor(Math.abs(p1 - p0) / 17));
    for (let i = 0; i <= posts; i++) {
      const t = i / posts;
      const x = lerp(p0, p1, t);
      const topY = lerp(railY0, railY1, t);
      const baseY = lerp(-6, -4, t);

      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, baseY);
      ctx.lineWidth = 1.1 + d * 0.3;
      ctx.strokeStyle = env.rgba(galleryDark, 0.34 + d * 0.35);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(x - 0.7, topY);
      ctx.lineTo(x - 0.7, baseY);
      ctx.lineWidth = 0.65;
      ctx.strokeStyle = env.rgba(galleryLight, 0.11 + d * 0.16);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawGallery(vertebrae[4], -1);
  drawGallery(vertebrae[5], 1);

  const atmosphere = env.hexToRgb(env.mix(deep, haze, 0.53));

  env.field((x, y, u, v) => {
    const heightFade = Math.pow(1 - v, 1.35);
    const cloud = env.fbm(x * 0.48, y * 0.21, {
      octaves: 3,
      gain: 0.54,
      lacunarity: 2,
      period: 211,
      seed: env.seed + 701,
    });
    const veil = Math.max(0, (cloud - 0.53) / 0.47);
    const dither = env.noise(x * 4.73, y * 4.17, {
      period: 127,
      seed: env.seed + 702,
    }) - 0.5;
    const edge =
      Math.max(0, (Math.abs(u - 0.5) - 0.35) / 0.15);

    const alpha = Math.round(clamp(
      7 +
      72 * heightFade +
      24 * veil +
      10 * edge +
      dither * 4,
      4,
      112
    ));

    return [atmosphere.r, atmosphere.g, atmosphere.b, alpha];
  }, { blend: 'over' });
}
