export const meta = {
  id: 'backdrop-spine-coil',
  size: { w: 512, h: 512 },
  seed: 187307,
  roles: ['deep-teal', 'haze', 'ink', 'hull', 'warm-white'],
};

export function render(ctx, env) {
  const W = env.width;
  const H = env.height;
  const P = env.PALETTE;

  ctx.clearRect(0, 0, W, H);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const hex = {
    void: env.shade(P.ink, -0.28),
    ink: P.ink,
    joint: env.mix(P.ink, P.haze, 0.18),
    hazeDark: env.shade(P.haze, -0.27),
    haze: P.haze,
    hazeLight: env.shade(P.haze, 0.13),
    hullDark: env.shade(P.hull, -0.34),
    hullMid: P.hull,
    hullLight: env.shade(P.hull, 0.18),
    hullGlint: env.shade(P.hull, 0.31),
    fog: env.mix(P['deep-teal'], P.haze, 0.52),
    fogDeep: env.mix(P['deep-teal'], P.haze, 0.31),
    warmDim: env.mix(P['warm-white'], P.haze, 0.18),
    warm: P['warm-white'],
  };

  const rgb = {};
  for (const key of Object.keys(hex)) rgb[key] = env.hexToRgb(hex[key]);

  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const smooth = (v) => {
    v = clamp(v);
    return v * v * (3 - 2 * v);
  };
  const mixRgb = (a, b, t) => {
    t = clamp(t);
    return {
      r: a.r + (b.r - a.r) * t,
      g: a.g + (b.g - a.g) * t,
      b: a.b + (b.b - a.b) * t,
    };
  };
  const pixel = (c, a = 255) => [
    Math.round(clamp(c.r, 0, 255)),
    Math.round(clamp(c.g, 0, 255)),
    Math.round(clamp(c.b, 0, 255)),
    Math.round(clamp(a, 0, 255)),
  ];

  function centerX(y) {
    return 252 + 16 * Math.sin((y - 30) / 88) + 0.04 * (y - 256);
  }

  function roundBoxLocal(lx, ly, hw, hh, r) {
    const qx = Math.abs(lx) - Math.max(0, hw - r);
    const qy = Math.abs(ly) - Math.max(0, hh - r);
    return (
      Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) +
      Math.min(Math.max(qx, qy), 0) -
      r
    );
  }

  function roundBoxD(x, y, cx, cy, hw, hh, r) {
    return roundBoxLocal(x - cx, y - cy, hw, hh, r);
  }

  function roundedPath(x, y, w, h, r) {
    r = Math.min(r, w * 0.5, h * 0.5);
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

  const segmentYs = [496, 437, 377, 316, 255, 194, 134, 74, 16];
  const segments = segmentYs.map((cy, index) => {
    const angle = 0.038 * Math.sin(cy * 0.031 + 0.6);
    return {
      index,
      cy,
      cx: centerX(cy),
      hw: 78 + cy * 0.046,
      hh: 23 + cy * 0.008,
      radius: 10 + cy * 0.003,
      angle,
      cos: Math.cos(angle),
      sin: Math.sin(angle),
    };
  });

  const geometryRng = env.stream('rib-geometry');
  const ribs = [];

  for (let si = 1; si <= 7; si++) {
    const seg = segments[si];
    for (const side of [-1, 1]) {
      const localRootX = side * (seg.hw - 8);
      const rootX = seg.cx + seg.cos * localRootX;
      const rootY = seg.cy + seg.sin * localRootX;
      const inset = 8 + geometryRng() * 25;
      const tipX = side < 0 ? inset : W - inset;
      const dy = 37 - si * 0.7 + geometryRng() * 10;
      const bend = -(19 + geometryRng() * 10);
      const rootWidth = 22 - si * 1.18 + geometryRng() * 1.6;
      const phase = geometryRng();

      const rib = {
        side,
        rootX,
        rootY,
        tipX,
        dy,
        bend,
        rootWidth,
        phase,
        valid: new Uint8Array(W),
        tAtX: new Float32Array(W),
        yAtX: new Float32Array(W),
        widthAtX: new Float32Array(W),
        normAtX: new Float32Array(W),
      };

      const span = tipX - rootX;
      for (let x = 0; x < W; x++) {
        const rawT = (x + 0.5 - rootX) / span;
        if (rawT < 0 || rawT > 1) continue;

        const t = rawT;
        const cy =
          rootY +
          dy * t +
          bend * Math.sin(Math.PI * t) +
          2.2 * Math.sin((2 * t + phase) * Math.PI) * t * (1 - t);
        const dydt =
          dy +
          bend * Math.PI * Math.cos(Math.PI * t) +
          2.2 *
            (
              2 * Math.PI * Math.cos((2 * t + phase) * Math.PI) * t * (1 - t) +
              Math.sin((2 * t + phase) * Math.PI) * (1 - 2 * t)
            );
        const slope = dydt / span;
        const width = Math.max(4.5, rootWidth * (1 - 0.72 * t));

        rib.valid[x] = 1;
        rib.tAtX[x] = t;
        rib.yAtX[x] = cy;
        rib.widthAtX[x] = width;
        rib.normAtX[x] = Math.sqrt(1 + slope * slope);
      }

      ribs.push(rib);
    }
  }

  const lowerGallerySegment = segments[2];
  const upperGallerySegment = segments[5];
  const galleries = [
    {
      x: lowerGallerySegment.cx - 111,
      y: lowerGallerySegment.cy - lowerGallerySegment.hh - 15,
      w: 106,
      h: 29,
      count: 8,
    },
    {
      x: upperGallerySegment.cx + 8,
      y: upperGallerySegment.cy - upperGallerySegment.hh - 8,
      w: 108,
      h: 28,
      count: 8,
    },
  ];

  function subjectAt(x, y) {
    const xi = Math.max(0, Math.min(W - 1, Math.floor(x)));
    const coreHalf = 38 + clamp(y, 0, H) * 0.036;
    const coreD = Math.abs(x - centerX(y)) - coreHalf;

    let unionD = coreD;
    let segmentD = Infinity;
    let segment = null;
    let localX = 0;
    let localY = 0;

    for (const seg of segments) {
      const dx = x - seg.cx;
      const dy = y - seg.cy;
      const lx = dx * seg.cos + dy * seg.sin;
      const ly = -dx * seg.sin + dy * seg.cos;
      const d = roundBoxLocal(lx, ly, seg.hw, seg.hh, seg.radius);
      if (d < segmentD) {
        segmentD = d;
        segment = seg;
        localX = lx;
        localY = ly;
      }
      if (d < unionD) unionD = d;
    }

    let ribD = Infinity;
    let rib = null;
    let ribT = 0;
    let ribY = 0;
    let ribWidth = 1;
    let ribNorm = 1;

    for (const candidate of ribs) {
      if (!candidate.valid[xi]) continue;
      const norm = candidate.normAtX[xi];
      const d =
        Math.abs(y - candidate.yAtX[xi]) / norm -
        candidate.widthAtX[xi];

      if (d < ribD) {
        ribD = d;
        rib = candidate;
        ribT = candidate.tAtX[xi];
        ribY = candidate.yAtX[xi];
        ribWidth = candidate.widthAtX[xi];
        ribNorm = norm;
      }
      if (d < unionD) unionD = d;
    }

    let galleryD = Infinity;
    let gallery = null;
    for (const candidate of galleries) {
      const d = roundBoxD(
        x,
        y,
        candidate.x + candidate.w * 0.5,
        candidate.y + candidate.h * 0.5,
        candidate.w * 0.5,
        candidate.h * 0.5,
        5
      );
      if (d < galleryD) {
        galleryD = d;
        gallery = candidate;
      }
      if (d < unionD) unionD = d;
    }

    let kind;
    if (galleryD <= 0) kind = 'gallery';
    else if (segmentD <= 0) kind = 'drum';
    else if (ribD <= 0) kind = 'rib';
    else if (coreD <= 0) kind = 'joint';
    else if (galleryD === unionD) kind = 'gallery';
    else if (segmentD === unionD) kind = 'drum';
    else if (ribD === unionD) kind = 'rib';
    else kind = 'joint';

    return {
      d: unionD,
      kind,
      segment,
      localX,
      localY,
      rib,
      ribT,
      ribY,
      ribWidth,
      ribNorm,
      gallery,
    };
  }

  function depthAmount(sample, y) {
    const topDepth = smooth((176 - y) / 176) * 0.72;
    const tipDepth =
      sample.kind === 'rib'
        ? smooth((sample.ribT - 0.26) / 0.74) * 0.88
        : 0;
    return Math.max(topDepth, tipDepth);
  }

  env.field((x, y, u, v) => {
    const sample = subjectAt(x + 0.5, y + 0.5);
    if (sample.d > 0) return null;

    const longGrain = env.fbm(x * 0.072, y * 0.31, {
      octaves: 3,
      gain: 0.55,
      lacunarity: 2,
      period: 193,
      seed: meta.seed + 11,
    });
    const blotch = env.fbm(x * 0.045, y * 0.052, {
      octaves: 3,
      gain: 0.58,
      lacunarity: 2.05,
      period: 227,
      seed: meta.seed + 29,
    });
    const run = env.ridge(x * 0.48, y * 0.022, {
      octaves: 2,
      gain: 0.55,
      lacunarity: 2,
      period: 251,
      seed: meta.seed + 47,
    });

    const directionalLight = 0.105 * (1 - u) + 0.035 * (1 - v);
    let surface;

    if (sample.kind === 'drum') {
      const seg = sample.segment;
      const nx = sample.localX / seg.hw;
      const ny = sample.localY / seg.hh;
      const sideFalloff = smooth((Math.abs(nx) - 0.67) / 0.33);
      const lip = smooth((Math.abs(ny) - 0.61) / 0.39);
      const horizontalBand =
        1 -
        smooth(
          Math.abs(Math.abs(ny) - 0.46) / 0.105
        );

      const seamStep = 28 + (seg.index % 3) * 3;
      const seamPhase =
        (sample.localX + seg.hw + seg.index * 7) / seamStep;
      const seamFrac = seamPhase - Math.floor(seamPhase);
      const seam = smooth((0.075 - Math.min(seamFrac, 1 - seamFrac)) / 0.075);

      let tone =
        0.48 +
        directionalLight +
        (longGrain - 0.5) * 0.18 +
        (blotch - 0.5) * 0.13 -
        sideFalloff * 0.17 -
        lip * 0.16 -
        seam * 0.11;

      tone += ny < 0 ? horizontalBand * 0.08 : -horizontalBand * 0.09;
      surface = mixRgb(rgb.hullDark, rgb.hullLight, clamp(tone, 0.08, 0.88));
    } else if (sample.kind === 'rib') {
      const q =
        (y + 0.5 - sample.ribY) /
        Math.max(1, sample.ribWidth * sample.ribNorm);
      const panelPhase =
        sample.ribT * (6.1 + sample.rib.phase) + sample.rib.phase;
      const panelFrac = panelPhase - Math.floor(panelPhase);
      const seam = smooth(
        (0.08 - Math.min(panelFrac, 1 - panelFrac)) / 0.08
      );

      let tone =
        0.43 +
        directionalLight +
        (longGrain - 0.5) * 0.2 +
        (blotch - 0.5) * 0.1 -
        clamp(q, -1, 1) * 0.115 -
        seam * 0.16;

      tone -= smooth((Math.abs(q) - 0.65) / 0.35) * 0.15;
      surface = mixRgb(rgb.hazeDark, rgb.hullLight, clamp(tone, 0.08, 0.82));
    } else if (sample.kind === 'gallery') {
      let tone =
        0.34 +
        directionalLight +
        (longGrain - 0.5) * 0.16 +
        (blotch - 0.5) * 0.1;
      surface = mixRgb(rgb.hazeDark, rgb.hullMid, clamp(tone, 0.06, 0.68));
    } else {
      const tone =
        0.2 +
        directionalLight * 0.4 +
        (blotch - 0.5) * 0.11;
      surface = mixRgb(rgb.void, rgb.hazeDark, clamp(tone, 0.05, 0.48));
    }

    const fluidDarken =
      smooth((run - 0.55) / 0.35) *
      (0.05 + 0.08 * smooth((blotch - 0.35) / 0.5));
    surface = mixRgb(surface, rgb.ink, fluidDarken);

    const depth = depthAmount(sample, y);
    const fogTarget = mixRgb(rgb.fog, rgb.haze, 0.18 + depth * 0.25);
    surface = mixRgb(surface, fogTarget, depth * 0.61);

    return pixel(surface);
  });

  function ribPoint(rib, t, offset = 0) {
    const x = rib.rootX + (rib.tipX - rib.rootX) * t;
    const y =
      rib.rootY +
      rib.dy * t +
      rib.bend * Math.sin(Math.PI * t) +
      2.2 * Math.sin((2 * t + rib.phase) * Math.PI) * t * (1 - t);
    const width = Math.max(4.5, rib.rootWidth * (1 - 0.72 * t));
    return { x, y: y + offset * width, width };
  }

  function traceRib(rib, offset) {
    ctx.beginPath();
    for (let i = 0; i <= 30; i++) {
      const p = ribPoint(rib, i / 30, offset);
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
  }

  for (const rib of ribs) {
    ctx.save();

    traceRib(rib, 0.72);
    ctx.strokeStyle = env.rgba(hex.void, 0.78);
    ctx.lineWidth = 4.2;
    ctx.stroke();

    traceRib(rib, -0.72);
    ctx.strokeStyle = env.rgba(hex.hullLight, 0.62);
    ctx.lineWidth = 2.1;
    ctx.stroke();

    traceRib(rib, 0.12);
    ctx.strokeStyle = env.rgba(hex.joint, 0.63);
    ctx.lineWidth = 1.8;
    ctx.stroke();

    for (const t of [0.16, 0.31, 0.47, 0.63, 0.78]) {
      const p = ribPoint(rib, t);
      const dxdt = rib.tipX - rib.rootX;
      const dydt = rib.dy + rib.bend * Math.PI * Math.cos(Math.PI * t);
      const length = Math.hypot(dxdt, dydt);
      const nx = -dydt / length;
      const ny = dxdt / length;
      const reach = p.width * 0.82;

      ctx.beginPath();
      ctx.moveTo(p.x - nx * reach, p.y - ny * reach);
      ctx.lineTo(p.x + nx * reach, p.y + ny * reach);
      ctx.strokeStyle = env.rgba(hex.void, 0.62 * (1 - t * 0.5));
      ctx.lineWidth = 2.6;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(p.x - nx * reach - 1, p.y - ny * reach - 1);
      ctx.lineTo(p.x + nx * reach - 1, p.y + ny * reach - 1);
      ctx.strokeStyle = env.rgba(hex.hullLight, 0.38 * (1 - t * 0.55));
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    for (const t of [0.21, 0.43, 0.61]) {
      const p = ribPoint(rib, t, -0.35);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.1, 0, Math.PI * 2);
      ctx.fillStyle = env.rgba(hex.void, 0.76);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(p.x - 0.55, p.y - 0.55, 0.85, 0, Math.PI * 2);
      ctx.fillStyle = env.rgba(hex.hullGlint, 0.63);
      ctx.fill();
    }

    ctx.restore();
  }

  for (const seg of segments) {
    ctx.save();
    ctx.translate(seg.cx, seg.cy);
    ctx.rotate(seg.angle);

    roundedPath(-seg.hw, -seg.hh, seg.hw * 2, seg.hh * 2, seg.radius);
    ctx.clip();

    for (const by of [-10, 10]) {
      ctx.beginPath();
      ctx.moveTo(-seg.hw + 5, by + 1.5);
      ctx.lineTo(seg.hw - 5, by + 1.5);
      ctx.strokeStyle = env.rgba(hex.void, 0.73);
      ctx.lineWidth = 3.4;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-seg.hw + 7, by - 1);
      ctx.lineTo(seg.hw - 7, by - 1);
      ctx.strokeStyle = env.rgba(hex.hullLight, 0.48);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    const seamStep = 28 + (seg.index % 3) * 3;
    for (
      let sx = -seg.hw + 22;
      sx < seg.hw - 15;
      sx += seamStep
    ) {
      ctx.beginPath();
      ctx.moveTo(sx + 1.5, -seg.hh + 5);
      ctx.lineTo(sx + 1.5, seg.hh - 5);
      ctx.strokeStyle = env.rgba(hex.void, 0.68);
      ctx.lineWidth = 2.3;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(sx - 0.5, -seg.hh + 6);
      ctx.lineTo(sx - 0.5, seg.hh - 6);
      ctx.strokeStyle = env.rgba(hex.hullLight, 0.34);
      ctx.lineWidth = 1.1;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.ellipse(0, 0, seg.hw * 0.27, seg.hh * 0.36, 0, 0, Math.PI * 2);
    ctx.fillStyle = env.rgba(hex.joint, 0.3);
    ctx.fill();
    ctx.strokeStyle = env.rgba(hex.void, 0.66);
    ctx.lineWidth = 2.7;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(
      -1,
      -1.5,
      seg.hw * 0.23,
      seg.hh * 0.27,
      0,
      Math.PI,
      Math.PI * 2
    );
    ctx.strokeStyle = env.rgba(hex.hullLight, 0.46);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    for (let b = -3; b <= 3; b++) {
      const bx = b * (seg.hw * 0.22);
      for (const by of [-seg.hh + 6, seg.hh - 6]) {
        ctx.beginPath();
        ctx.arc(bx, by, 2, 0, Math.PI * 2);
        ctx.fillStyle = env.rgba(hex.void, 0.8);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(bx - 0.55, by - 0.55, 0.78, 0, Math.PI * 2);
        ctx.fillStyle = env.rgba(hex.hullGlint, 0.62);
        ctx.fill();
      }
    }

    ctx.restore();

    ctx.save();
    ctx.translate(seg.cx, seg.cy);
    ctx.rotate(seg.angle);

    roundedPath(-seg.hw, -seg.hh, seg.hw * 2, seg.hh * 2, seg.radius);
    ctx.strokeStyle = env.rgba(hex.void, 0.77);
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-seg.hw + seg.radius, -seg.hh + 2);
    ctx.lineTo(seg.hw - seg.radius, -seg.hh + 2);
    ctx.strokeStyle = env.rgba(hex.hullLight, 0.55);
    ctx.lineWidth = 2.3;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-seg.hw + seg.radius, seg.hh - 1.5);
    ctx.lineTo(seg.hw - seg.radius, seg.hh - 1.5);
    ctx.strokeStyle = env.rgba(hex.void, 0.72);
    ctx.lineWidth = 3.7;
    ctx.stroke();

    ctx.restore();
  }

  for (let i = 0; i < segments.length - 1; i++) {
    const a = segments[i];
    const b = segments[i + 1];
    const y = (a.cy + b.cy) * 0.5;
    const x = centerX(y);
    const rx = 41 + y * 0.018;
    const ry = 6.5 + y * 0.002;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((a.angle + b.angle) * 0.5);

    ctx.beginPath();
    ctx.ellipse(0, 1.5, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = env.rgba(hex.void, 0.76);
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(-1, -1, rx - 3, Math.max(2, ry - 2.5), 0, Math.PI, Math.PI * 2);
    ctx.strokeStyle = env.rgba(hex.hazeLight, 0.32);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    ctx.restore();
  }

  for (const g of galleries) {
    ctx.save();

    roundedPath(g.x + 1, g.y + 9, g.w, g.h - 7, 5);
    ctx.fillStyle = env.rgba(hex.void, 0.63);
    ctx.fill();

    const bodyGradient = ctx.createLinearGradient(
      g.x,
      g.y + 5,
      g.x + g.w,
      g.y + g.h
    );
    bodyGradient.addColorStop(0, env.rgba(hex.hullLight, 0.74));
    bodyGradient.addColorStop(0.42, env.rgba(hex.hazeDark, 0.82));
    bodyGradient.addColorStop(1, env.rgba(hex.ink, 0.88));

    roundedPath(g.x, g.y + 6, g.w, g.h - 7, 5);
    ctx.fillStyle = bodyGradient;
    ctx.fill();
    ctx.strokeStyle = env.rgba(hex.void, 0.9);
    ctx.lineWidth = 2.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(g.x + 5, g.y + 4);
    ctx.lineTo(g.x + g.w - 5, g.y + 4);
    ctx.strokeStyle = env.rgba(hex.void, 0.86);
    ctx.lineWidth = 3.2;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(g.x + 6, g.y + 2.5);
    ctx.lineTo(g.x + g.w - 6, g.y + 2.5);
    ctx.strokeStyle = env.rgba(hex.hullGlint, 0.68);
    ctx.lineWidth = 1.6;
    ctx.stroke();

    for (let x = g.x + 10; x < g.x + g.w - 8; x += 13) {
      ctx.beginPath();
      ctx.moveTo(x, g.y + 3);
      ctx.lineTo(x, g.y + 9);
      ctx.strokeStyle = env.rgba(hex.hullLight, 0.54);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    for (let x = g.x + 22; x < g.x + g.w - 14; x += 27) {
      ctx.beginPath();
      ctx.moveTo(x - 5, g.y + g.h - 3);
      ctx.lineTo(x, g.y + g.h - 10);
      ctx.lineTo(x + 6, g.y + g.h - 3);
      ctx.strokeStyle = env.rgba(hex.void, 0.82);
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }

    ctx.restore();
  }

  env.field((x, y) => {
    const sample = subjectAt(x + 0.5, y + 0.5);
    if (sample.d > 0) return null;

    let occlusion = 0;

    if (sample.kind === 'joint') {
      occlusion += 44;
    } else if (sample.kind === 'drum') {
      const ny = Math.abs(sample.localY / sample.segment.hh);
      const nx = Math.abs(sample.localX / sample.segment.hw);
      occlusion += 39 * smooth((ny - 0.68) / 0.32);
      occlusion += 18 * smooth((nx - 0.82) / 0.18);
    } else if (sample.kind === 'rib') {
      const q =
        (y + 0.5 - sample.ribY) /
        Math.max(1, sample.ribWidth * sample.ribNorm);
      occlusion += 31 * smooth((q + 0.05) / 0.95);
      occlusion += 37 * (1 - smooth(sample.ribT / 0.17));
    } else if (sample.kind === 'gallery') {
      const g = sample.gallery;
      occlusion +=
        34 *
        smooth(
          ((y + 0.5 - g.y) / g.h - 0.53) / 0.47
        );
    }

    const fluid = env.ridge(x * 0.71, y * 0.024, {
      octaves: 3,
      gain: 0.54,
      lacunarity: 2,
      period: 257,
      seed: meta.seed + 83,
    });
    const cluster = env.noise(x * 0.083, y * 0.061, {
      period: 223,
      seed: meta.seed + 101,
    });
    occlusion +=
      55 *
      smooth((fluid - 0.58) / 0.32) *
      smooth((cluster - 0.31) / 0.56);

    if (occlusion < 1) return null;
    return pixel(rgb.ink, Math.min(105, occlusion));
  }, { blend: 'over' });

  for (const rib of ribs) {
    const gradient = ctx.createRadialGradient(
      rib.rootX - 2,
      rib.rootY + 4,
      2,
      rib.rootX,
      rib.rootY + 4,
      rib.rootWidth * 1.65
    );
    gradient.addColorStop(0, env.rgba(hex.void, 0.72));
    gradient.addColorStop(0.55, env.rgba(hex.ink, 0.38));
    gradient.addColorStop(1, env.rgba(hex.ink, 0));

    ctx.beginPath();
    ctx.ellipse(
      rib.rootX,
      rib.rootY + 3,
      rib.rootWidth * 1.55,
      rib.rootWidth * 1.1,
      0,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  const wearRng = env.stream('surface-wear');

  for (const seg of segments) {
    ctx.save();
    ctx.translate(seg.cx, seg.cy);
    ctx.rotate(seg.angle);

    for (let i = 0; i < 6; i++) {
      const sx = (wearRng() * 2 - 1) * (seg.hw - 15);
      const sy = (wearRng() * 2 - 1) * (seg.hh - 8);
      const length = 5 + wearRng() * 13;
      const drop = 1 + wearRng() * 4;

      ctx.beginPath();
      ctx.moveTo(sx + 1.5, sy + 2);
      ctx.lineTo(sx + length + 1.5, sy + drop + 2);
      ctx.strokeStyle = env.rgba(hex.void, 0.46);
      ctx.lineWidth = 2.1;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(sx + length, sy + drop);
      ctx.strokeStyle = env.rgba(hex.hullGlint, 0.34);
      ctx.lineWidth = 1.6;
      ctx.stroke();
    }

    for (const side of [-1, 1]) {
      const chipX = side * (seg.hw - 7);
      const chipY = -seg.hh + 7 + wearRng() * 8;

      ctx.fillStyle = env.rgba(hex.void, 0.7);
      ctx.fillRect(chipX - 2, chipY + 2, 5, 3);
      ctx.fillStyle = env.rgba(hex.hullGlint, 0.53);
      ctx.fillRect(chipX - 3, chipY, 4, 2);
    }

    ctx.restore();
  }

  for (const rib of ribs) {
    for (let i = 0; i < 3; i++) {
      const t = 0.09 + wearRng() * 0.56;
      const p = ribPoint(rib, t, -0.48);
      const direction = rib.side * (4 + wearRng() * 7);

      ctx.beginPath();
      ctx.moveTo(p.x + 1, p.y + 2);
      ctx.lineTo(p.x + direction + 1, p.y + 3);
      ctx.strokeStyle = env.rgba(hex.void, 0.48);
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + direction, p.y + 1);
      ctx.strokeStyle = env.rgba(hex.hullGlint, 0.38);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  for (const g of galleries) {
    const usable = g.w - 18;
    const step = usable / g.count;
    const wy = g.y + 13;

    for (let i = 0; i < g.count; i++) {
      const wx = g.x + 9 + i * step + (step - 4) * 0.5;

      if (i === 2 || i === 5) {
        const glow = ctx.createRadialGradient(
          wx + 2,
          wy + 1.5,
          1,
          wx + 2,
          wy + 1.5,
          8
        );
        glow.addColorStop(0, env.rgba(hex.warmDim, 0.25));
        glow.addColorStop(1, env.rgba(hex.warmDim, 0));
        ctx.beginPath();
        ctx.arc(wx + 2, wy + 1.5, 8, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.fill();
      }

      roundedPath(wx - 1.5, wy - 1.5, 7, 6, 1.5);
      ctx.fillStyle = env.rgba(hex.void, 0.92);
      ctx.fill();

      ctx.fillStyle = env.rgba(hex.warmDim, 0.91);
      ctx.fillRect(wx, wy, 4, 3);
      ctx.fillStyle = env.rgba(hex.warm, 0.82);
      ctx.fillRect(wx, wy, 2, 1);
    }
  }

  env.field((x, y) => {
    const sample = subjectAt(x + 0.5, y + 0.5);
    if (sample.d > 0) return null;

    const depth = depthAmount(sample, y);
    if (depth < 0.015) return null;

    const fogColor = mixRgb(rgb.fogDeep, rgb.haze, 0.34 + depth * 0.28);
    return pixel(fogColor, 122 * depth);
  }, { blend: 'over' });

  env.mask((x, y) => {
    const sample = subjectAt(x + 0.5, y + 0.5);
    if (sample.d >= 0) return 0;

    const edge = smooth((-sample.d) / 3.35);

    const rawTop = clamp((y - 5) / 140);
    let topFade = smooth(rawTop);

    if (rawTop > 0 && rawTop < 1) {
      const dither =
        (env.noise(x * 13.17, y * 17.91, {
          period: 257,
          seed: meta.seed + 907,
        }) -
          0.5) *
        (2.8 / 255);
      topFade = clamp(topFade + dither);
    }

    let tipFade = 1;
    if (sample.kind === 'rib') {
      const rawTip = clamp((sample.ribT - 0.55) / 0.43);
      tipFade = 1 - smooth(rawTip);

      if (rawTip > 0 && rawTip < 1) {
        const dither =
          (env.noise(x * 19.23, y * 11.71, {
            period: 251,
            seed: meta.seed + 953,
          }) -
            0.5) *
          (2.4 / 255);
        tipFade = clamp(tipFade + dither);
      }

      if (sample.ribT >= 0.98) tipFade = 0;
    }

    return edge * topFade * tipFade;
  });
}
