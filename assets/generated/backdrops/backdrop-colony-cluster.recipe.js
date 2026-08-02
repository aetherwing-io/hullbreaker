export const meta = {
  id: 'backdrop-colony-cluster',
  size: { w: 512, h: 256 },
  seed: 597251,
  roles: ['haze', 'ink', 'hull', 'deep-teal', 'rust-orange', 'warm-white'],
};

export function render(ctx, env) {
  const P = env.PALETTE;
  const C = {
    ink: env.shade(P.ink, 0),
    inkDeep: env.shade(P.ink, -0.18),
    inkSoft: env.mix(P.ink, P.haze, 0.18),

    hazeLight: env.shade(P.haze, 0.16),
    haze: env.shade(P.haze, 0),
    hazeDark: env.shade(P.haze, -0.22),
    hazeDeep: env.mix(P.haze, P.ink, 0.48),

    hullLight: env.shade(P.hull, 0.18),
    hull: env.shade(P.hull, 0),
    hullDark: env.shade(P.hull, -0.22),
    hullDeep: env.mix(P.hull, P.ink, 0.58),

    rustLight: env.shade(P['rust-orange'], 0.17),
    rust: env.shade(P['rust-orange'], 0),
    rustDark: env.shade(P['rust-orange'], -0.24),
    rustDeep: env.mix(P['rust-orange'], P.ink, 0.43),

    tealLight: env.mix(P['deep-teal'], P.haze, 0.58),
    teal: env.mix(P['deep-teal'], P.haze, 0.38),
    tealDark: env.mix(P['deep-teal'], P.ink, 0.34),
    tealDeep: env.mix(P['deep-teal'], P.ink, 0.54),

    warmLight: env.shade(P['warm-white'], 0.08),
    warm: env.shade(P['warm-white'], -0.06),
    warmDim: env.shade(P['warm-white'], -0.38),
    warmDeep: env.shade(P['warm-white'], -0.58),
  };

  const rustMat = {
    light: C.rustLight,
    mid: C.rust,
    dark: C.rustDark,
    deep: C.rustDeep,
    variants: [C.rustLight, C.rust, C.rustDark],
  };
  const hullMat = {
    light: C.hullLight,
    mid: C.hull,
    dark: C.hullDark,
    deep: C.hullDeep,
    variants: [C.hullLight, C.hull, C.hullDark],
  };
  const hazeMat = {
    light: C.hazeLight,
    mid: C.haze,
    dark: C.hazeDark,
    deep: C.hazeDeep,
    variants: [C.hazeLight, C.haze, C.hazeDark],
  };
  const tealMat = {
    light: C.tealLight,
    mid: C.teal,
    dark: C.tealDark,
    deep: C.tealDeep,
    variants: [C.tealLight, C.teal, C.tealDark],
  };

  const panelRng = env.stream('panel-patches');
  const habitatRng = env.stream('habitats');
  const windowRng = env.stream('window-state');
  const wearRng = env.stream('wear');
  const shelfRng = env.stream('shelf');
  const windows = [];
  const streaks = [];
  const wear = [];

  ctx.clearRect(0, 0, env.width, env.height);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  function polygon(points) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i += 1) {
      ctx.lineTo(points[i][0], points[i][1]);
    }
    ctx.closePath();
  }

  function chamferPath(x, y, w, h, cut = 4) {
    const c = Math.min(cut, w * 0.22, h * 0.28);
    polygon([
      [x + c, y],
      [x + w - c, y],
      [x + w, y + c],
      [x + w, y + h - c],
      [x + w - c, y + h],
      [x + c, y + h],
      [x, y + h - c],
      [x, y + c],
    ]);
  }

  function softLine(x1, y1, x2, y2, color, width, highlight) {
    ctx.save();
    ctx.strokeStyle = env.rgba(C.inkDeep, 0.23);
    ctx.lineWidth = width + 4;
    ctx.shadowColor = env.rgba(C.inkDeep, 0.26);
    ctx.shadowBlur = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = env.rgba(color, 0.96);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    if (highlight) {
      ctx.strokeStyle = env.rgba(highlight, 0.56);
      ctx.lineWidth = Math.max(1, width * 0.27);
      ctx.beginPath();
      ctx.moveTo(x1 - 0.6, y1 - 0.7);
      ctx.lineTo(x2 - 0.6, y2 - 0.7);
      ctx.stroke();
    }
    ctx.restore();
  }

  function softCurve(points, color, width, highlight) {
    ctx.save();
    ctx.strokeStyle = env.rgba(C.inkDeep, 0.25);
    ctx.lineWidth = width + 5;
    ctx.shadowColor = env.rgba(C.inkDeep, 0.25);
    ctx.shadowBlur = 2;
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    ctx.bezierCurveTo(
      points[2], points[3],
      points[4], points[5],
      points[6], points[7],
    );
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = env.rgba(color, 0.96);
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(points[0], points[1]);
    ctx.bezierCurveTo(
      points[2], points[3],
      points[4], points[5],
      points[6], points[7],
    );
    ctx.stroke();

    ctx.strokeStyle = env.rgba(highlight, 0.46);
    ctx.lineWidth = Math.max(1, width * 0.24);
    ctx.beginPath();
    ctx.moveTo(points[0] - 1, points[1] - 1);
    ctx.bezierCurveTo(
      points[2] - 1, points[3] - 1,
      points[4] - 1, points[5] - 1,
      points[6] - 1, points[7] - 1,
    );
    ctx.stroke();
    ctx.restore();
  }

  function metalPanel(x, y, w, h, mat, cut = 4) {
    ctx.save();
    ctx.shadowColor = env.rgba(C.inkDeep, 0.48);
    ctx.shadowBlur = 3;
    ctx.shadowOffsetY = 2;
    chamferPath(x, y, w, h, cut);
    const base = ctx.createLinearGradient(x, y, x + w * 0.78, y + h);
    base.addColorStop(0, env.rgba(mat.light, 1));
    base.addColorStop(0.42, env.rgba(mat.mid, 1));
    base.addColorStop(1, env.rgba(mat.dark, 1));
    ctx.fillStyle = base;
    ctx.fill();
    ctx.restore();

    ctx.save();
    chamferPath(x, y, w, h, cut);
    ctx.clip();

    const count = Math.max(2, Math.floor(w / 25));
    for (let i = 0; i < count; i += 1) {
      const left = x + (w * i) / count + (panelRng() - 0.5) * 2;
      const right = x + (w * (i + 1)) / count + (panelRng() - 0.5) * 2;
      const color = mat.variants[Math.floor(panelRng() * mat.variants.length)];
      ctx.fillStyle = env.rgba(color, 0.22 + panelRng() * 0.22);
      ctx.fillRect(left, y, right - left + 1, h);

      if (i > 0) {
        ctx.fillStyle = env.rgba(mat.deep, 0.62);
        ctx.fillRect(left - 1, y + 2, 2, h - 4);
        ctx.fillStyle = env.rgba(mat.light, 0.25);
        ctx.fillRect(left + 1, y + 3, 1, h - 6);
      }
    }

    for (let i = 0; i < 6; i += 1) {
      const yy = y + 3 + panelRng() * Math.max(2, h - 6);
      const start = x + panelRng() * w * 0.22;
      const length = w * (0.32 + panelRng() * 0.62);
      const color = panelRng() > 0.55 ? mat.light : mat.dark;
      ctx.fillStyle = env.rgba(color, 0.08 + panelRng() * 0.12);
      ctx.fillRect(start, yy, length, 1 + panelRng() * 1.4);
    }
    ctx.restore();

    ctx.strokeStyle = env.rgba(C.inkDeep, 0.82);
    ctx.lineWidth = 2.4;
    chamferPath(x, y, w, h, cut);
    ctx.stroke();

    ctx.strokeStyle = env.rgba(mat.light, 0.88);
    ctx.lineWidth = 1.7;
    ctx.beginPath();
    ctx.moveTo(x + cut, y + 1);
    ctx.lineTo(x + w - cut, y + 1);
    ctx.moveTo(x + 1, y + cut);
    ctx.lineTo(x + 1, y + h - cut);
    ctx.stroke();

    ctx.strokeStyle = env.rgba(mat.deep, 0.92);
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(x + cut, y + h - 1);
    ctx.lineTo(x + w - cut, y + h - 1);
    ctx.moveTo(x + w - 1, y + cut);
    ctx.lineTo(x + w - 1, y + h - cut);
    ctx.stroke();

    const boltStep = Math.max(14, w / 5);
    for (let bx = x + 8; bx < x + w - 5; bx += boltStep) {
      for (const by of [y + 3.5, y + h - 3.5]) {
        ctx.fillStyle = env.rgba(C.inkDeep, 0.92);
        ctx.beginPath();
        ctx.arc(bx, by, 1.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = env.rgba(mat.light, 0.8);
        ctx.beginPath();
        ctx.arc(bx - 0.45, by - 0.45, 0.65, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function occlusionBand(x, y, w, depth) {
    ctx.save();
    polygon([
      [x + 2, y],
      [x + w - 2, y],
      [x + w - 7, y + depth],
      [x + 7, y + depth],
    ]);
    const shadow = ctx.createLinearGradient(0, y, 0, y + depth);
    shadow.addColorStop(0, env.rgba(C.inkDeep, 0.62));
    shadow.addColorStop(0.42, env.rgba(C.inkDeep, 0.28));
    shadow.addColorStop(1, env.rgba(C.inkDeep, 0));
    ctx.fillStyle = shadow;
    ctx.fill();
    ctx.restore();
  }

  function beam(x, y, w, h, mat) {
    ctx.save();
    ctx.shadowColor = env.rgba(C.inkDeep, 0.42);
    ctx.shadowBlur = 2.5;
    ctx.shadowOffsetY = 2;
    chamferPath(x, y, w, h, Math.min(2.5, h * 0.35));
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, env.rgba(mat.light, 1));
    g.addColorStop(0.38, env.rgba(mat.mid, 1));
    g.addColorStop(1, env.rgba(mat.deep, 1));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = env.rgba(C.inkDeep, 0.82);
    ctx.lineWidth = 1.8;
    chamferPath(x, y, w, h, Math.min(2.5, h * 0.35));
    ctx.stroke();

    ctx.strokeStyle = env.rgba(mat.light, 0.76);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(x + 3, y + 0.8);
    ctx.lineTo(x + w - 3, y + 0.8);
    ctx.stroke();
  }

  function queueWindows(x, y, w, h, strength) {
    const rows = h >= 27 ? 2 : 1;
    const cols = Math.max(4, Math.floor((w - 12) / 8));
    const pitch = (w - 14) / cols;
    const firstY = y + 9;
    const lastY = y + h - 9;

    for (let row = 0; row < rows; row += 1) {
      const wy = rows === 1
        ? y + h * 0.5 - 1.5
        : env.lerp(firstY, lastY, row);
      for (let col = 0; col < cols; col += 1) {
        const ww = env.clamp(pitch - 3, 3.5, 5.5);
        const wx = x + 7 + col * pitch + (pitch - ww) * 0.5;
        const patternedDark = (col + row * 3) % 7 === 0;
        windows.push({
          x: wx,
          y: wy,
          w: ww,
          h: 3,
          lit: !patternedDark && windowRng() > 0.24,
          strength: strength * (0.78 + windowRng() * 0.22),
          clip: [x, y, w, h],
        });
      }
    }
  }

  function habitat(x, y, w, h, mat, strength = 1) {
    occlusionBand(x - 1, y + h - 1, w + 2, 10);
    metalPanel(x, y, w, h, mat, 4);

    const roofMat = mat === rustMat ? hullMat : rustMat;
    beam(x - 3, y - 3, w + 6, 5, roofMat);

    for (let rx = x + 12; rx < x + w - 8; rx += 12) {
      ctx.strokeStyle = env.rgba(mat.deep, 0.56);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(rx, y + 5);
      ctx.lineTo(rx, y + h - 5);
      ctx.stroke();

      ctx.strokeStyle = env.rgba(mat.light, 0.25);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx + 2, y + 6);
      ctx.lineTo(rx + 2, y + h - 6);
      ctx.stroke();
    }

    const capW = Math.min(11, w * 0.16);
    ctx.fillStyle = env.rgba(mat.deep, 0.32);
    chamferPath(x + w - capW - 2, y + 4, capW, h - 8, 2);
    ctx.fill();
    ctx.strokeStyle = env.rgba(mat.light, 0.35);
    ctx.lineWidth = 1;
    ctx.stroke();

    const ventCount = 1 + Math.floor(habitatRng() * 3);
    for (let i = 0; i < ventCount; i += 1) {
      const vx = x + 8 + habitatRng() * Math.max(5, w - 22);
      const vw = 6 + habitatRng() * 7;
      const vh = 3 + habitatRng() * 3;
      ctx.fillStyle = env.rgba(C.inkDeep, 0.45);
      ctx.fillRect(vx - 1, y - vh - 2, vw + 2, vh + 3);
      const vg = ctx.createLinearGradient(vx, y - vh - 2, vx + vw, y);
      vg.addColorStop(0, env.rgba(roofMat.light, 1));
      vg.addColorStop(1, env.rgba(roofMat.dark, 1));
      ctx.fillStyle = vg;
      ctx.fillRect(vx, y - vh - 2, vw, vh + 1);
      ctx.strokeStyle = env.rgba(C.inkDeep, 0.8);
      ctx.lineWidth = 1;
      ctx.strokeRect(vx, y - vh - 2, vw, vh + 1);
    }

    const streakCount = Math.max(2, Math.floor(w / 28));
    for (let i = 0; i < streakCount; i += 1) {
      streaks.push({
        x: x + 7 + wearRng() * (w - 14),
        y: y + 4,
        len: 5 + wearRng() * Math.max(5, h - 11),
        alpha: 0.22 + wearRng() * 0.28,
      });
    }

    for (let i = 0; i < 3; i += 1) {
      wear.push({
        x: x + 3 + wearRng() * (w - 8),
        y: y + 3 + wearRng() * (h - 7),
        len: 4 + wearRng() * 9,
        mat,
      });
    }

    queueWindows(x, y, w, h, strength);
  }

  function lattice(x, y, w, h, mat) {
    softLine(x, y, x, y + h, mat.dark, 4, mat.light);
    softLine(x + w, y, x + w, y + h, mat.dark, 4, mat.light);
    softLine(x, y, x + w, y, mat.mid, 4, mat.light);
    softLine(x, y + h, x + w, y + h, mat.dark, 4, mat.light);

    const bays = Math.max(2, Math.floor(h / 24));
    for (let i = 0; i < bays; i += 1) {
      const top = y + (h * i) / bays;
      const bottom = y + (h * (i + 1)) / bays;
      softLine(x, top, x + w, bottom, mat.dark, 2.5, mat.light);
      softLine(x + w, top, x, bottom, mat.dark, 2.5, mat.light);
      softLine(x, bottom, x + w, bottom, mat.mid, 2.4, mat.light);
    }
  }

  function catwalk(x1, y1, x2, y2, mat) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const nx = -dy / length;
    const ny = dx / length;

    ctx.save();
    ctx.strokeStyle = env.rgba(C.inkDeep, 0.48);
    ctx.lineWidth = 10;
    ctx.shadowColor = env.rgba(C.inkDeep, 0.38);
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1 + 2);
    ctx.lineTo(x2, y2 + 2);
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = env.rgba(mat.deep, 1);
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.strokeStyle = env.rgba(mat.mid, 1);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(x1, y1 - 1);
    ctx.lineTo(x2, y2 - 1);
    ctx.stroke();

    ctx.strokeStyle = env.rgba(mat.light, 0.82);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x1, y1 - 2);
    ctx.lineTo(x2, y2 - 2);
    ctx.stroke();

    const railOffset = 8;
    ctx.strokeStyle = env.rgba(C.inkDeep, 0.22);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(x1 - nx * railOffset, y1 - ny * railOffset);
    ctx.lineTo(x2 - nx * railOffset, y2 - ny * railOffset);
    ctx.stroke();

    ctx.strokeStyle = env.rgba(mat.light, 0.92);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1 - nx * railOffset, y1 - ny * railOffset);
    ctx.lineTo(x2 - nx * railOffset, y2 - ny * railOffset);
    ctx.stroke();

    const bays = Math.max(2, Math.floor(length / 18));
    for (let i = 0; i <= bays; i += 1) {
      const t = i / bays;
      const px = env.lerp(x1, x2, t);
      const py = env.lerp(y1, y2, t);
      ctx.strokeStyle = env.rgba(mat.dark, 0.95);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px - nx * railOffset, py - ny * railOffset);
      ctx.stroke();

      if (i < bays) {
        const nt = (i + 1) / bays;
        const qx = env.lerp(x1, x2, nt);
        const qy = env.lerp(y1, y2, nt);
        ctx.strokeStyle = env.rgba(mat.dark, 0.76);
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py + 3);
        ctx.lineTo(qx, qy + 9);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawShelf() {
    const top = [
      [0, 231], [42, 223], [87, 226], [132, 220],
      [180, 224], [228, 218], [276, 222], [324, 216],
      [375, 220], [421, 214], [466, 221], [512, 218],
    ];
    const shape = top.concat([[512, 256], [0, 256]]);

    ctx.save();
    ctx.shadowColor = env.rgba(C.inkDeep, 0.5);
    ctx.shadowBlur = 4;
    ctx.shadowOffsetY = 2;
    polygon(shape);
    const base = ctx.createLinearGradient(0, 216, 0, 256);
    base.addColorStop(0, env.rgba(C.hullLight, 1));
    base.addColorStop(0.28, env.rgba(C.hull, 1));
    base.addColorStop(1, env.rgba(C.hullDeep, 1));
    ctx.fillStyle = base;
    ctx.fill();
    ctx.restore();

    ctx.save();
    polygon(shape);
    ctx.clip();

    const sections = [
      [0, 58, tealMat],
      [58, 116, rustMat],
      [116, 175, hullMat],
      [175, 232, rustMat],
      [232, 292, hazeMat],
      [292, 351, rustMat],
      [351, 414, hullMat],
      [414, 470, rustMat],
      [470, 512, tealMat],
    ];

    for (let i = 0; i < sections.length; i += 1) {
      const [sx, ex, mat] = sections[i];
      ctx.fillStyle = env.rgba(mat.mid, 0.74 + shelfRng() * 0.18);
      polygon([
        [sx - 3, 211 + shelfRng() * 15],
        [ex + 3, 211 + shelfRng() * 15],
        [ex + 3, 256],
        [sx - 3, 256],
      ]);
      ctx.fill();

      ctx.strokeStyle = env.rgba(C.inkDeep, 0.74);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(ex, 216);
      ctx.lineTo(ex - 5 + shelfRng() * 10, 256);
      ctx.stroke();

      ctx.strokeStyle = env.rgba(mat.light, 0.28);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ex + 2, 219);
      ctx.lineTo(ex - 3 + shelfRng() * 8, 256);
      ctx.stroke();
    }

    for (let i = 0; i < 11; i += 1) {
      const yy = 225 + shelfRng() * 27;
      ctx.fillStyle = env.rgba(
        shelfRng() > 0.55 ? C.hullLight : C.inkSoft,
        0.06 + shelfRng() * 0.13,
      );
      ctx.fillRect(18 + shelfRng() * 45, yy, 390 + shelfRng() * 100, 1 + shelfRng() * 2);
    }
    ctx.restore();

    ctx.strokeStyle = env.rgba(C.inkDeep, 0.88);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(top[0][0], top[0][1] + 2);
    for (let i = 1; i < top.length; i += 1) {
      ctx.lineTo(top[i][0], top[i][1] + 2);
    }
    ctx.stroke();

    ctx.strokeStyle = env.rgba(C.hullLight, 0.92);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(top[0][0], top[0][1] - 1);
    for (let i = 1; i < top.length; i += 1) {
      ctx.lineTo(top[i][0], top[i][1] - 1);
    }
    ctx.stroke();

    for (let x = 76; x < 449; x += 18) {
      ctx.fillStyle = env.rgba(C.inkDeep, 0.9);
      ctx.fillRect(x - 1, 235, 5, 4);
      if (windowRng() > 0.34) {
        ctx.fillStyle = env.rgba(C.warmDim, 0.84);
        ctx.fillRect(x, 236, 3, 2);
      }
    }
  }

  function drawMasts() {
    softLine(246, 20, 246, 105, C.hullDark, 3, C.hullLight);
    softLine(237, 46, 255, 46, C.hullDark, 2.5, C.hullLight);
    softLine(232, 61, 260, 61, C.hullDark, 2.5, C.hullLight);
    softLine(239, 80, 253, 80, C.hullDark, 2.5, C.hullLight);
    softLine(246, 20, 240, 34, C.hazeDark, 2, C.hazeLight);
    softLine(246, 20, 252, 34, C.hazeDark, 2, C.hazeLight);

    softLine(285, 37, 285, 92, C.rustDark, 3, C.rustLight);
    softLine(276, 53, 294, 53, C.rustDark, 2.5, C.rustLight);
    softLine(279, 68, 291, 68, C.rustDark, 2.2, C.rustLight);

    softLine(330, 28, 330, 121, C.hazeDark, 3, C.hazeLight);
    softLine(319, 48, 341, 48, C.hazeDark, 2.5, C.hazeLight);
    softLine(322, 67, 338, 67, C.hazeDark, 2.3, C.hazeLight);
    softLine(330, 28, 337, 39, C.hazeDark, 2, C.hazeLight);

    softLine(180, 52, 180, 121, C.hullDark, 3, C.hullLight);
    softLine(168, 73, 190, 73, C.hullDark, 2.5, C.hullLight);
  }

  function drawDish() {
    ctx.save();
    ctx.shadowColor = env.rgba(C.inkDeep, 0.34);
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.moveTo(164, 67);
    ctx.quadraticCurveTo(177, 86, 195, 70);
    ctx.quadraticCurveTo(179, 75, 164, 67);
    ctx.closePath();
    const g = ctx.createLinearGradient(164, 64, 194, 82);
    g.addColorStop(0, env.rgba(C.hullLight, 1));
    g.addColorStop(1, env.rgba(C.hullDark, 1));
    ctx.fillStyle = g;
    ctx.fill();
    ctx.restore();

    ctx.strokeStyle = env.rgba(C.inkDeep, 0.9);
    ctx.lineWidth = 2.4;
    ctx.stroke();
    softLine(180, 74, 184, 91, C.hullDark, 3, C.hullLight);
    softLine(179, 72, 190, 65, C.hullDark, 2, C.hullLight);
  }

  function drawCrane() {
    lattice(424, 103, 18, 113, hazeMat);
    softLine(418, 104, 483, 84, C.rustDark, 6, C.rustLight);
    softLine(424, 109, 480, 90, C.rust, 3, C.rustLight);
    softLine(433, 101, 449, 93, C.rustDark, 2.2, C.rustLight);
    softLine(448, 94, 463, 88, C.rustDark, 2.2, C.rustLight);
    softLine(463, 89, 478, 84, C.rustDark, 2.2, C.rustLight);
    softLine(476, 88, 476, 137, C.inkSoft, 2, C.hazeLight);
    metalPanel(467, 135, 18, 14, rustMat, 3);
  }

  function drawTank() {
    softLine(376, 147, 370, 214, C.hullDark, 5, C.hullLight);
    softLine(413, 147, 421, 215, C.hullDark, 5, C.hullLight);
    softLine(376, 163, 417, 207, C.hullDark, 3, C.hullLight);
    softLine(414, 163, 374, 207, C.hullDark, 3, C.hullLight);

    ctx.save();
    ctx.shadowColor = env.rgba(C.inkDeep, 0.48);
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.moveTo(371, 118);
    ctx.quadraticCurveTo(394, 108, 418, 118);
    ctx.lineTo(418, 148);
    ctx.quadraticCurveTo(394, 158, 371, 148);
    ctx.closePath();
    const body = ctx.createLinearGradient(371, 0, 418, 0);
    body.addColorStop(0, env.rgba(C.hullDark, 1));
    body.addColorStop(0.34, env.rgba(C.hullLight, 1));
    body.addColorStop(0.68, env.rgba(C.hull, 1));
    body.addColorStop(1, env.rgba(C.hullDeep, 1));
    ctx.fillStyle = body;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(394.5, 118, 23.5, 7, 0, 0, Math.PI * 2);
    const top = ctx.createLinearGradient(374, 112, 415, 124);
    top.addColorStop(0, env.rgba(C.hullLight, 1));
    top.addColorStop(1, env.rgba(C.hullDark, 1));
    ctx.fillStyle = top;
    ctx.fill();
    ctx.strokeStyle = env.rgba(C.inkDeep, 0.86);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    for (const bx of [377, 393, 410]) {
      ctx.strokeStyle = env.rgba(C.rustDark, 0.9);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx, 116);
      ctx.lineTo(bx, 150);
      ctx.stroke();
      ctx.strokeStyle = env.rgba(C.rustLight, 0.45);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bx - 1, 117);
      ctx.lineTo(bx - 1, 149);
      ctx.stroke();
      streaks.push({
        x: bx,
        y: 123,
        len: 20 + wearRng() * 12,
        alpha: 0.3 + wearRng() * 0.2,
      });
    }

    ctx.strokeStyle = env.rgba(C.inkDeep, 0.9);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(394.5, 148, 23.5, 6, 0, 0, Math.PI);
    ctx.stroke();

    softCurve(
      [418, 137, 438, 139, 436, 173, 451, 176],
      C.rustDark,
      5,
      C.rustLight,
    );
  }

  function drawRustStreak(item) {
    const g = ctx.createLinearGradient(0, item.y, 0, item.y + item.len);
    g.addColorStop(0, env.rgba(C.rustDeep, item.alpha));
    g.addColorStop(0.28, env.rgba(C.rustDark, item.alpha * 0.82));
    g.addColorStop(1, env.rgba(C.rustDark, 0));
    ctx.fillStyle = g;
    ctx.fillRect(item.x, item.y, 1.5, item.len);

    ctx.fillStyle = env.rgba(C.inkDeep, 0.72);
    ctx.beginPath();
    ctx.arc(item.x + 0.7, item.y, 1.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = env.rgba(C.hullLight, 0.54);
    ctx.beginPath();
    ctx.arc(item.x + 0.3, item.y - 0.35, 0.55, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawWear(item) {
    ctx.strokeStyle = env.rgba(item.mat.light, 0.38);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(item.x, item.y);
    ctx.lineTo(item.x + item.len, item.y - 1.2);
    ctx.stroke();

    ctx.strokeStyle = env.rgba(item.mat.deep, 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(item.x + 1, item.y + 1.4);
    ctx.lineTo(item.x + item.len * 0.72, item.y + 0.5);
    ctx.stroke();
  }

  function drawWindow(item) {
    if (item.lit) {
      ctx.save();
      chamferPath(
        item.clip[0],
        item.clip[1],
        item.clip[2],
        item.clip[3],
        4,
      );
      ctx.clip();
      const spill = ctx.createLinearGradient(
        0,
        item.y + item.h,
        0,
        item.y + item.h + 8,
      );
      spill.addColorStop(0, env.rgba(C.warmDim, 0.2 * item.strength));
      spill.addColorStop(1, env.rgba(C.warmDim, 0));
      ctx.fillStyle = spill;
      ctx.fillRect(item.x - 2, item.y + item.h, item.w + 4, 8);
      ctx.restore();
    }

    ctx.fillStyle = env.rgba(C.inkDeep, 0.94);
    ctx.fillRect(item.x - 1, item.y - 1, item.w + 2, item.h + 2);

    if (item.lit) {
      ctx.fillStyle = env.rgba(C.warmDim, 0.92 * item.strength);
      ctx.fillRect(item.x, item.y, item.w, item.h);
      ctx.fillStyle = env.rgba(C.warmLight, 0.9 * item.strength);
      ctx.fillRect(item.x + 0.5, item.y + 0.4, item.w - 1, 1.1);
    } else {
      ctx.fillStyle = env.rgba(C.inkSoft, 0.9);
      ctx.fillRect(item.x, item.y, item.w, item.h);
      ctx.fillStyle = env.rgba(C.hazeLight, 0.18);
      ctx.fillRect(item.x + 0.5, item.y + 0.4, item.w - 1, 0.8);
    }
  }

  function drawBeacon(x, y, radius) {
    const glow = ctx.createRadialGradient(x, y, 0, x, y, radius);
    glow.addColorStop(0, env.rgba(C.warmLight, 0.7));
    glow.addColorStop(0.3, env.rgba(C.warm, 0.25));
    glow.addColorStop(1, env.rgba(C.warmDim, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = env.rgba(C.inkDeep, 0.86);
    ctx.beginPath();
    ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = env.rgba(C.warmLight, 1);
    ctx.beginPath();
    ctx.arc(x, y, 1.6, 0, Math.PI * 2);
    ctx.fill();
  }

  drawShelf();

  softCurve(
    [42, 226, 49, 169, 71, 144, 93, 119],
    C.tealDark,
    8,
    C.tealLight,
  );
  softCurve(
    [455, 222, 458, 171, 438, 143, 407, 127],
    C.tealDark,
    8,
    C.tealLight,
  );

  lattice(69, 129, 44, 92, tealMat);
  lattice(146, 98, 42, 121, hazeMat);
  lattice(270, 78, 50, 140, tealMat);
  lattice(354, 111, 44, 107, hazeMat);

  drawMasts();
  drawDish();
  drawCrane();

  catwalk(43, 177, 114, 172, tealMat);
  catwalk(111, 139, 198, 132, hazeMat);
  catwalk(281, 109, 379, 103, hazeMat);

  habitat(51, 184, 77, 34, tealMat, 0.68);
  habitat(119, 180, 88, 40, rustMat, 0.92);
  habitat(200, 184, 94, 37, hullMat, 0.96);
  habitat(286, 177, 90, 43, rustMat, 0.94);
  habitat(369, 184, 79, 35, hazeMat, 0.74);

  habitat(88, 148, 78, 35, hullMat, 0.88);
  habitat(153, 143, 92, 40, rustMat, 1);
  habitat(235, 150, 87, 34, hullMat, 0.92);
  habitat(312, 145, 104, 39, rustMat, 0.96);

  habitat(134, 116, 77, 34, rustMat, 0.92);
  habitat(199, 107, 96, 39, hullMat, 1);
  habitat(286, 116, 78, 34, rustMat, 0.94);
  habitat(349, 124, 62, 28, hazeMat, 0.74);

  habitat(176, 86, 78, 29, hullMat, 0.88);
  habitat(245, 78, 78, 38, rustMat, 0.96);
  habitat(214, 58, 73, 30, hullMat, 0.92);

  drawTank();

  catwalk(31, 202, 126, 192, rustMat);
  catwalk(117, 140, 207, 132, hullMat);
  catwalk(291, 171, 460, 160, rustMat);
  catwalk(70, 216, 458, 208, hullMat);
  catwalk(162, 105, 221, 96, hazeMat);

  const alphaMap = ctx.getImageData(0, 0, env.width, env.height).data;
  const grainRgb = env.hexToRgb(C.inkSoft);
  const grainOpts = {
    octaves: 3,
    gain: 0.52,
    lacunarity: 2,
    period: 79,
    seed: 1259,
  };
  const ridgeOpts = {
    octaves: 2,
    gain: 0.5,
    lacunarity: 2,
    period: 53,
    seed: 7127,
  };

  env.field((x, y) => {
    const alpha = alphaMap[(y * env.width + x) * 4 + 3];
    if (alpha < 224) return null;

    const bands = env.fbm(x * 0.034, y * 0.29, grainOpts);
    const scratches = env.ridge(x * 0.025, y * 0.62, ridgeOpts);
    const amount = Math.max(0, bands - 0.43) + Math.max(0, scratches - 0.68);
    if (amount <= 0.035) return null;

    const a = env.clamp(2 + Math.floor(amount * 19), 2, 15);
    return [grainRgb.r, grainRgb.g, grainRgb.b, a];
  }, { blend: 'over' });

  for (const item of wear) drawWear(item);
  for (const item of streaks) drawRustStreak(item);
  for (const item of windows) drawWindow(item);

  for (let x = 84; x < 440; x += 22) {
    const lit = windowRng() > 0.3;
    ctx.fillStyle = env.rgba(C.inkDeep, 0.92);
    ctx.fillRect(x - 1, 242, 6, 4);
    ctx.fillStyle = env.rgba(lit ? C.warmDim : C.inkSoft, lit ? 0.88 : 0.92);
    ctx.fillRect(x, 243, 4, 2);
  }

  drawBeacon(246, 19, 9);
  drawBeacon(330, 28, 6);
  drawBeacon(483, 84, 5);

  const maskNoiseOpts = { period: 19, seed: 9413 };
  env.mask((x, y) => {
    const left = env.smoothstep(env.clamp(x / 74, 0, 1));
    const right = env.smoothstep(env.clamp((511 - x) / 74, 0, 1));
    let fade = left * right;

    if (fade < 0.999 && fade > 0) {
      const noise = env.noise(x, y, maskNoiseOpts) - 0.5;
      fade = env.clamp(
        fade + noise * (2 / 255) * Math.min(1, fade * 8),
        0,
        1,
      );
    }
    return fade;
  });
}
