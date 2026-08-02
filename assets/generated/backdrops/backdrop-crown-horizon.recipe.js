export const meta = {
  id: 'backdrop-crown-horizon',
  size: { w: 1024, h: 256 },
  seed: 161447,
  roles: ['deep-teal', 'haze', 'ink', 'hot-magenta'],
};

export function render(ctx, env) {
  const W = env.width;
  const H = env.height;
  const teal = env.PALETTE['deep-teal'];
  const haze = env.PALETTE.haze;
  const ink = env.PALETTE.ink;
  const magenta = env.PALETTE['hot-magenta'];

  const bgDark = env.mix(env.shade(teal, -0.26), haze, 0.23);
  const bgLight = env.mix(
    env.shade(teal, 0.17),
    env.shade(haze, 0.12),
    0.46,
  );
  const fogLow = env.mix(teal, haze, 0.58);
  const fogHigh = env.mix(
    env.shade(teal, 0.22),
    env.shade(haze, 0.18),
    0.6,
  );
  const towerFar = env.mix(fogLow, ink, 0.12);
  const towerMid = env.mix(fogLow, ink, 0.22);
  const towerNear = env.mix(env.mix(teal, haze, 0.56), ink, 0.28);

  const rgb = (hex) => env.hexToRgb(hex);
  const bgDarkRgb = rgb(bgDark);
  const bgLightRgb = rgb(bgLight);
  const fogLowRgb = rgb(fogLow);
  const fogHighRgb = rgb(fogHigh);

  function clamp01(t) {
    return env.clamp(t, 0, 1);
  }

  function smooth(t) {
    t = clamp01(t);
    return t * t * (3 - 2 * t);
  }

  function mixRgb(a, b, t, alpha = 255) {
    t = clamp01(t);
    return [
      Math.round(a.r + (b.r - a.r) * t),
      Math.round(a.g + (b.g - a.g) * t),
      Math.round(a.b + (b.b - a.b) * t),
      Math.round(alpha),
    ];
  }

  env.field((x, y, u, v) => {
    const broad = env.fbm(x * 0.68, y * 0.68, {
      octaves: 4,
      gain: 0.52,
      lacunarity: 2.03,
      period: 768,
      seed: meta.seed + 11,
    });
    const drift = env.noise(x * 0.19, y * 0.27, {
      period: 512,
      seed: meta.seed + 12,
    });
    const edge = Math.abs(u - 0.5) * 2;
    const light = clamp01(
      0.18 +
        v * 0.52 +
        (1 - u) * 0.08 +
        (broad - 0.5) * 0.2 +
        (drift - 0.5) * 0.1 -
        edge * edge * 0.06,
    );
    return mixRgb(bgDarkRgb, bgLightRgb, light);
  });

  env.field(
    (x, y, u) => {
      const n = env.fbm(x * 0.42, y * 0.58, {
        octaves: 3,
        gain: 0.55,
        lacunarity: 2,
        period: 640,
        seed: meta.seed + 21,
      });
      const centerA =
        76 + (n - 0.5) * 27 + Math.sin(u * Math.PI * 4.2) * 7;
      const centerB =
        154 + (n - 0.5) * 39 + Math.sin(u * Math.PI * 2.5 + 0.8) * 10;
      const bankA = Math.exp(-Math.pow((y - centerA) / 31, 2));
      const bankB = Math.exp(-Math.pow((y - centerB) / 44, 2));
      const alpha = (bankA * 15 + bankB * 17) * (0.75 + n * 0.25);
      if (alpha < 0.45) return null;
      return mixRgb(fogLowRgb, fogHighRgb, 0.28 + n * 0.34, alpha);
    },
    { blend: 'over' },
  );

  function drawTower(opts) {
    const {
      x,
      base,
      w,
      h,
      color,
      alpha,
      blur,
      detail,
      r,
      finials,
    } = opts;

    const lean =
      opts.lean !== undefined ? opts.lean : (r() - 0.5) * w * 0.24;
    const bend = (r() - 0.5) * w * 0.1;
    const profile = [
      { f: 0, hw: 0.52 },
      { f: 0.15, hw: 0.58 },
      { f: 0.18, hw: 0.46 },
      { f: 0.36, hw: 0.43 },
      { f: 0.39, hw: 0.34 },
      { f: 0.58, hw: 0.31 },
      { f: 0.61, hw: 0.22 },
      { f: 0.79, hw: 0.19 },
      { f: 0.82, hw: 0.11 },
      { f: 0.94, hw: 0.07 },
      { f: 1, hw: 0 },
    ];

    const left = [];
    const right = [];

    for (const p of profile) {
      const center =
        x +
        lean * p.f +
        Math.sin(p.f * Math.PI) * bend +
        (r() - 0.5) * w * 0.025 * (1 - p.f);
      const asymL = 1 + (r() - 0.5) * 0.09;
      const asymR = 1 + (r() - 0.5) * 0.09;
      const py = base - h * p.f;
      left.push({ x: center - w * p.hw * asymL, y: py });
      right.push({ x: center + w * p.hw * asymR, y: py });
    }

    const trace = () => {
      ctx.beginPath();
      ctx.moveTo(left[0].x, left[0].y);
      for (let i = 1; i < left.length; i++) {
        ctx.lineTo(left[i].x, left[i].y);
      }
      for (let i = right.length - 1; i >= 0; i--) {
        ctx.lineTo(right[i].x, right[i].y);
      }
      ctx.closePath();
    };

    const light = env.mix(color, fogHigh, 0.36);
    const dark = env.mix(color, ink, 0.27);
    const occlusion = env.mix(color, ink, 0.48);
    const tip = {
      x: (left[left.length - 1].x + right[right.length - 1].x) * 0.5,
      y: left[left.length - 1].y,
    };

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.filter = blur > 0 ? `blur(${blur}px)` : 'none';
    const bodyGradient = ctx.createLinearGradient(
      x - w * 0.8,
      base - h,
      x + w * 0.75,
      base,
    );
    bodyGradient.addColorStop(0, light);
    bodyGradient.addColorStop(0.42, color);
    bodyGradient.addColorStop(1, dark);
    ctx.fillStyle = bodyGradient;
    trace();
    ctx.fill();
    ctx.restore();

    if (detail > 0) {
      ctx.save();
      trace();
      ctx.clip();
      ctx.filter = blur > 0.8 ? `blur(${blur * 0.24}px)` : 'none';

      let sx = x - w * 0.55 + r() * 3;
      let stripeIndex = 0;
      while (sx < x + w * 0.58) {
        const stripeColor = stripeIndex % 3 === 0 ? light : occlusion;
        ctx.strokeStyle = env.rgba(
          stripeColor,
          alpha * detail * (stripeIndex % 3 === 0 ? 0.13 : 0.09),
        );
        ctx.lineWidth = 0.65 + r() * 0.75;
        ctx.beginPath();
        ctx.moveTo(sx, base + 2);
        ctx.lineTo(sx + lean * 0.72 + (r() - 0.5) * 2, base - h * 0.9);
        ctx.stroke();
        sx += 3.2 + r() * 4.8;
        stripeIndex++;
      }

      const seamIndices = [2, 4, 6, 8];
      for (const index of seamIndices) {
        const l = left[index];
        const rr = right[index];

        ctx.strokeStyle = env.rgba(light, alpha * detail * 0.18);
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        ctx.moveTo(l.x, l.y - 0.55);
        ctx.lineTo(rr.x, rr.y - 0.55);
        ctx.stroke();

        ctx.strokeStyle = env.rgba(occlusion, alpha * detail * 0.3);
        ctx.lineWidth = 1.05;
        ctx.beginPath();
        ctx.moveTo(l.x, l.y + 0.8);
        ctx.lineTo(rr.x, rr.y + 0.8);
        ctx.stroke();
      }

      ctx.restore();

      ctx.save();
      ctx.filter = blur > 1 ? `blur(${blur * 0.18}px)` : 'none';
      ctx.lineWidth = 0.7 + detail * 0.55;

      ctx.strokeStyle = env.rgba(light, alpha * detail * 0.22);
      ctx.beginPath();
      ctx.moveTo(left[0].x, left[0].y);
      for (let i = 1; i < left.length; i++) {
        ctx.lineTo(left[i].x, left[i].y);
      }
      ctx.stroke();

      ctx.strokeStyle = env.rgba(occlusion, alpha * detail * 0.32);
      ctx.beginPath();
      ctx.moveTo(right[0].x, right[0].y);
      for (let i = 1; i < right.length; i++) {
        ctx.lineTo(right[i].x, right[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }

    if (finials) {
      const capY = tip.y + h * 0.18;
      ctx.save();
      ctx.lineCap = 'square';
      for (let i = -2; i <= 2; i++) {
        const px = tip.x + i * w * 0.105;
        const topY = tip.y + 3 + Math.abs(i) * 3.2;
        ctx.strokeStyle = env.rgba(
          i < 0 ? light : dark,
          alpha * (0.27 + detail * 0.2),
        );
        ctx.lineWidth = i === 0 ? 1.15 : 0.75;
        ctx.beginPath();
        ctx.moveTo(px, capY);
        ctx.lineTo(px + lean * 0.04, topY);
        ctx.stroke();
      }
      ctx.strokeStyle = env.rgba(occlusion, alpha * 0.3);
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(tip.x - w * 0.25, capY);
      ctx.lineTo(tip.x + w * 0.25, capY);
      ctx.stroke();
      ctx.restore();
    }

    return tip;
  }

  function drawTowerLayer(config) {
    const r = env.stream(config.name);
    for (let i = 0; i < config.count; i++) {
      const t = (i + 0.5) / config.count;
      const envelope = Math.pow(Math.sin(Math.PI * t), 0.72);
      const central = Math.exp(-Math.pow((t - 0.5) / 0.22, 2));
      const x =
        config.x0 +
        (config.x1 - config.x0) * t +
        (r() - 0.5) * ((config.x1 - config.x0) / config.count) * 0.72;
      const h =
        config.minH +
        envelope * config.span * (0.48 + r() * 0.3) +
        central * config.span * 0.4;
      const edgeAlpha = 0.16 + envelope * 0.84;
      drawTower({
        x,
        base: config.base + (r() - 0.5) * 9,
        w: config.minW + r() * (config.maxW - config.minW),
        h,
        color: config.color,
        alpha: config.alpha * edgeAlpha,
        blur: config.blur,
        detail: config.detail,
        r,
        finials: config.detail > 0.4 && r() > 0.73,
      });
    }
  }

  drawTowerLayer({
    name: 'rear-spires',
    count: 31,
    x0: 34,
    x1: 990,
    base: 197,
    minH: 17,
    span: 88,
    minW: 7,
    maxW: 18,
    color: towerFar,
    alpha: 0.46,
    blur: 1.75,
    detail: 0.12,
  });

  env.field(
    (x, y, u, v) => {
      const n = env.fbm(x * 0.5, y * 0.72, {
        octaves: 3,
        gain: 0.52,
        lacunarity: 2.08,
        period: 512,
        seed: meta.seed + 31,
      });
      const center =
        143 + (n - 0.5) * 32 + Math.sin(u * Math.PI * 3.1 + 1.7) * 8;
      const bank = Math.exp(-Math.pow((y - center) / 29, 2));
      const lower = smooth((v - 0.62) / 0.38);
      const alpha = bank * (15 + n * 10) + lower * 15;
      if (alpha < 0.5) return null;
      return mixRgb(fogLowRgb, fogHighRgb, 0.2 + n * 0.42, alpha);
    },
    { blend: 'over' },
  );

  const massR = env.stream('foundation-mass');
  const massPoints = [];
  const massSteps = 74;

  for (let i = 0; i <= massSteps; i++) {
    const t = i / massSteps;
    const x = 48 + t * 928;
    const envelope = Math.pow(Math.sin(Math.PI * t), 0.62);
    const core = Math.exp(-Math.pow((t - 0.5) / 0.25, 2));
    const top =
      234 -
      envelope * (18 + core * 32 + massR() * 12) -
      Math.sin(t * Math.PI * 11) * envelope * 2.5;
    massPoints.push({ x, y: top });
  }

  const traceMass = () => {
    ctx.beginPath();
    ctx.moveTo(massPoints[0].x, massPoints[0].y);
    for (let i = 1; i < massPoints.length; i++) {
      ctx.lineTo(massPoints[i].x, massPoints[i].y);
    }
    ctx.lineTo(976, H);
    ctx.lineTo(48, H);
    ctx.closePath();
  };

  const massGradient = ctx.createLinearGradient(38, 0, 986, 0);
  massGradient.addColorStop(0, env.rgba(towerMid, 0));
  massGradient.addColorStop(0.12, env.rgba(towerMid, 0.28));
  massGradient.addColorStop(0.32, env.rgba(towerMid, 0.56));
  massGradient.addColorStop(0.5, env.rgba(towerNear, 0.68));
  massGradient.addColorStop(0.68, env.rgba(towerMid, 0.56));
  massGradient.addColorStop(0.88, env.rgba(towerMid, 0.28));
  massGradient.addColorStop(1, env.rgba(towerMid, 0));

  ctx.fillStyle = massGradient;
  traceMass();
  ctx.fill();

  ctx.save();
  traceMass();
  ctx.clip();
  let striationX = 88 + massR() * 5;
  let striationIndex = 0;
  while (striationX < 940) {
    const c =
      striationIndex % 4 === 0
        ? env.mix(towerMid, fogHigh, 0.28)
        : env.mix(towerMid, ink, 0.3);
    ctx.strokeStyle = env.rgba(c, striationIndex % 4 === 0 ? 0.11 : 0.075);
    ctx.lineWidth = 0.7 + massR() * 1.1;
    ctx.beginPath();
    ctx.moveTo(striationX, 148);
    ctx.lineTo(striationX + (massR() - 0.5) * 5, H);
    ctx.stroke();
    striationX += 5 + massR() * 8;
    striationIndex++;
  }
  ctx.restore();

  const massLight = env.mix(towerMid, fogHigh, 0.34);
  const massDark = env.mix(towerMid, ink, 0.38);

  ctx.strokeStyle = env.rgba(massLight, 0.24);
  ctx.lineWidth = 1.05;
  ctx.beginPath();
  ctx.moveTo(massPoints[0].x, massPoints[0].y - 0.8);
  for (let i = 1; i < massPoints.length; i++) {
    ctx.lineTo(massPoints[i].x, massPoints[i].y - 0.8);
  }
  ctx.stroke();

  ctx.strokeStyle = env.rgba(massDark, 0.3);
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(massPoints[0].x, massPoints[0].y + 1.5);
  for (let i = 1; i < massPoints.length; i++) {
    ctx.lineTo(massPoints[i].x, massPoints[i].y + 1.5);
  }
  ctx.stroke();

  function drawButtress(x0, y0, x1, y1, width, color, alpha) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = Math.max(1, Math.hypot(dx, dy));
    const nx = (-dy / length) * width * 0.5;
    const ny = (dx / length) * width * 0.5;
    const light = env.mix(color, fogHigh, 0.38);
    const dark = env.mix(color, ink, 0.42);

    ctx.save();
    ctx.globalAlpha = alpha;
    const gradient = ctx.createLinearGradient(
      x0 + nx,
      y0 + ny,
      x0 - nx,
      y0 - ny,
    );
    gradient.addColorStop(0, light);
    gradient.addColorStop(0.45, color);
    gradient.addColorStop(1, dark);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(x0 + nx, y0 + ny);
    ctx.lineTo(x1 + nx * 0.68, y1 + ny * 0.68);
    ctx.lineTo(x1 - nx * 0.68, y1 - ny * 0.68);
    ctx.lineTo(x0 - nx, y0 - ny);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = env.rgba(light, 0.34);
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(x0 + nx, y0 + ny);
    ctx.lineTo(x1 + nx * 0.68, y1 + ny * 0.68);
    ctx.stroke();

    ctx.strokeStyle = env.rgba(dark, 0.48);
    ctx.lineWidth = 1.35;
    ctx.beginPath();
    ctx.moveTo(x0 - nx, y0 - ny);
    ctx.lineTo(x1 - nx * 0.68, y1 - ny * 0.68);
    ctx.stroke();

    ctx.strokeStyle = env.rgba(dark, 0.2);
    ctx.lineWidth = Math.max(0.8, width * 0.14);
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    ctx.restore();
  }

  drawButtress(218, 230, 390, 160, 17, towerMid, 0.46);
  drawButtress(292, 224, 452, 137, 13, towerMid, 0.48);
  drawButtress(388, 211, 520, 154, 12, towerNear, 0.38);
  drawButtress(505, 184, 664, 213, 14, towerNear, 0.36);
  drawButtress(574, 150, 744, 226, 16, towerMid, 0.46);
  drawButtress(637, 170, 820, 232, 18, towerMid, 0.36);

  drawTowerLayer({
    name: 'middle-spires',
    count: 22,
    x0: 92,
    x1: 932,
    base: 215,
    minH: 25,
    span: 96,
    minW: 11,
    maxW: 27,
    color: towerMid,
    alpha: 0.61,
    blur: 0.78,
    detail: 0.35,
  });

  const landmarkR = env.stream('crown-landmarks');
  const landmarkSpecs = [
    { x: 512, base: 222, w: 43, h: 192, lean: 0, alpha: 0.75 },
    { x: 468, base: 222, w: 35, h: 164, lean: -2, alpha: 0.69 },
    { x: 557, base: 223, w: 38, h: 171, lean: 2, alpha: 0.71 },
    { x: 416, base: 224, w: 32, h: 142, lean: -1, alpha: 0.63 },
    { x: 615, base: 225, w: 34, h: 150, lean: 2, alpha: 0.65 },
    { x: 360, base: 226, w: 31, h: 116, lean: -2, alpha: 0.57 },
    { x: 676, base: 227, w: 31, h: 122, lean: 1, alpha: 0.57 },
    { x: 302, base: 229, w: 28, h: 91, lean: -1, alpha: 0.48 },
    { x: 730, base: 230, w: 29, h: 95, lean: 2, alpha: 0.48 },
  ];

  const accentTips = [];

  for (let i = 0; i < landmarkSpecs.length; i++) {
    const spec = landmarkSpecs[i];
    const tip = drawTower({
      ...spec,
      color: i < 5 ? towerNear : towerMid,
      blur: i < 5 ? 0.28 : 0.5,
      detail: i < 5 ? 0.74 : 0.48,
      r: landmarkR,
      finials: i < 7,
    });
    if (i < 5) accentTips.push(tip);
  }

  drawTowerLayer({
    name: 'lower-spires',
    count: 18,
    x0: 132,
    x1: 892,
    base: 241,
    minH: 14,
    span: 51,
    minW: 13,
    maxW: 29,
    color: towerNear,
    alpha: 0.48,
    blur: 0.18,
    detail: 0.55,
  });

  env.field(
    (x, y, u, v) => {
      const n = env.fbm(x * 0.56, y * 0.7, {
        octaves: 4,
        gain: 0.51,
        lacunarity: 2.04,
        period: 640,
        seed: meta.seed + 71,
      });
      const fine = env.noise(x * 0.92, y * 0.92, {
        period: 256,
        seed: meta.seed + 72,
      });
      const centerA =
        137 + (n - 0.5) * 31 + Math.sin(u * Math.PI * 5 + 0.4) * 7;
      const centerB =
        202 + (n - 0.5) * 43 + Math.sin(u * Math.PI * 2.2 + 2.1) * 11;
      const bankA = Math.exp(-Math.pow((y - centerA) / 23, 2));
      const bankB = Math.exp(-Math.pow((y - centerB) / 32, 2));
      const lower = smooth((v - 0.72) / 0.28);
      const edge = Math.pow(Math.abs(u - 0.5) * 2, 2.7);
      const alpha =
        bankA * (13 + n * 12) +
        bankB * (21 + n * 19) +
        lower * (20 + n * 30) +
        edge * 9 +
        (fine - 0.5) * 2.4;
      if (alpha < 0.55) return null;
      return mixRgb(
        fogLowRgb,
        fogHighRgb,
        0.34 + n * 0.35,
        env.clamp(alpha, 0, 78),
      );
    },
    { blend: 'over' },
  );

  const brightMagenta = env.shade(magenta, 0.08);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  for (let i = 0; i < accentTips.length; i++) {
    const tip = accentTips[i];
    const radius = i === 0 ? 10 : i < 3 ? 8 : 6.5;
    const bloom = ctx.createRadialGradient(
      tip.x,
      tip.y,
      0,
      tip.x,
      tip.y,
      radius,
    );
    bloom.addColorStop(0, env.rgba(magenta, i === 0 ? 0.31 : 0.23));
    bloom.addColorStop(0.28, env.rgba(magenta, i === 0 ? 0.16 : 0.11));
    bloom.addColorStop(0.68, env.rgba(magenta, 0.035));
    bloom.addColorStop(1, env.rgba(magenta, 0));
    ctx.fillStyle = bloom;
    ctx.fillRect(
      tip.x - radius,
      tip.y - radius,
      radius * 2,
      radius * 2,
    );

    const px = Math.round(tip.x);
    const py = Math.round(tip.y);
    ctx.fillStyle = env.rgba(magenta, i === 0 ? 0.62 : 0.46);
    ctx.fillRect(px, py - 3, 1, 7);
    ctx.fillStyle = brightMagenta;
    ctx.globalAlpha = i === 0 ? 1 : 0.91;
    ctx.fillRect(px - 1, py - 1, i === 0 ? 3 : 2, i === 0 ? 3 : 2);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}
