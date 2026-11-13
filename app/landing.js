// Arkhive start screen: a pixel-art workspace drawn on two canvases (scene + desk), palette colours only.
// Every shape is whole art pixels drawn with fillRect, so the canvases never hold a colour outside the palette.
(function () {
  'use strict';

  const K = {
    paper: '#EDE6DA', sheet: '#F5EFE6', silver: '#D8CFC0', ink: '#261A14', mid: '#5C463B',
    muted: '#8A7367', forest: '#234434', leaf: '#3A634C', gold: '#B89658',
  };
  const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]];
  const DW = 112, DH = 62; // desk art size
  const SCREEN = { x: 21, y: 11, w: 50, h: 31 }; // laptop screen, in desk art pixels

  let o = { reduce: false, onEnter: () => {} };
  let hero, scene, g, back, front, desk, dc, dg, P = 4, W = 0, H = 0, hy = 0, t = 0, flat = false, clouds = [];

  function rng(seed) { return () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }; }
  const R = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  function ellipse(ctx, cx, cy, rx, ry, c) {
    ctx.fillStyle = c;
    for (let y = -ry; y <= ry; y++) {
      const hw = Math.round(rx * Math.sqrt(Math.max(0, 1 - (y * y) / (ry * ry))));
      if (hw > 0) ctx.fillRect(Math.round(cx - hw), Math.round(cy + y), hw * 2, 1);
    }
  }
  // A filled quad, scanline by scanline; points clockwise from top-left.
  function quad(ctx, pts, c) {
    const ys = pts.map((p) => p[1]), y0 = Math.min(...ys), y1 = Math.max(...ys);
    ctx.fillStyle = c;
    for (let y = y0; y <= y1; y++) {
      const xs = [];
      for (let i = 0; i < 4; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % 4];
        if ((y >= ay && y <= by) || (y >= by && y <= ay)) xs.push(ay === by ? Math.min(ax, bx) : ax + ((y - ay) * (bx - ax)) / (by - ay));
        if (ay === by && y === ay) xs.push(Math.max(ax, bx));
      }
      if (xs.length < 2) continue;
      const a = Math.round(Math.min(...xs)), b = Math.round(Math.max(...xs));
      ctx.fillRect(a, y, b - a + 1, 1);
    }
  }
  function line(ctx, x0, y0, x1, y1, c, w = 1) {
    const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
    for (let i = 0; i <= n; i++) R(ctx, x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, w, w, c);
  }

  // ---------- the scene: back layer (sky), clouds, front layer (land), flower ----------
  function layer() { const c = document.createElement('canvas'); c.width = W; c.height = H; return c; }
  function drawBack() {
    back = layer();
    const b = back.getContext('2d');
    R(b, 0, 0, W, H, K.paper);
    for (let y = hy - 16; y < hy + 2; y++) { // the sky lightens toward the horizon, in ordered dither
      const level = (y - (hy - 16)) / 16;
      for (let x = 0; x < W; x++) if (BAYER[y & 3][x & 3] / 16 < level * 0.55) R(b, x, y, 1, 1, K.sheet);
    }
  }
  function drawFront() {
    front = layer();
    const f = front.getContext('2d'), r = rng(7);
    // distant skyline, left of centre
    const x0 = Math.round(W * 0.05), x1 = Math.round(W * 0.33);
    for (let x = x0; x < x1;) { const w = 4 + Math.floor(r() * 6), h = 8 + Math.floor(r() * 20); R(f, x, hy - h, w, h + 4, K.muted); x += w + Math.floor(r() * 2); }
    for (let x = x0 + 6; x < x1 - 6;) {
      const w = 5 + Math.floor(r() * 5), h = 6 + Math.floor(r() * 16);
      R(f, x, hy - h, w, h + 4, K.mid);
      for (let wy = hy - h + 2; wy < hy - 1; wy += 3) for (let wx = x + 1; wx < x + w - 1; wx += 2) if (r() < 0.55) R(f, wx, wy, 1, 1, K.silver);
      if (h > 18) R(f, x + (w >> 1), hy - h - 4, 1, 4, K.mid);
      x += w + 2 + Math.floor(r() * 4);
    }
    // far hill, then the near meadow
    for (let x = 0; x < W; x++) {
      const yf = Math.round(hy - 2 + Math.sin(x * 0.021) * 3 + Math.sin(x * 0.0067 + 1) * 4);
      R(f, x, yf, 1, H - yf, K.leaf);
      const yn = Math.round(hy + 7 + Math.sin(x * 0.013 + 2) * 5);
      R(f, x, yn, 1, H - yn, K.forest);
      if (r() < 0.35) R(f, x, yn - 1, 1, 1, K.forest); // tufts on the meadow's edge
      for (let y = yn + 2; y < H; y++) if (r() < 0.05) R(f, x, y, 1, r() < 0.5 ? 1 : 2, K.leaf);
    }
    // a winding dirt path from the front of the meadow to the horizon
    const top = hy + 6, xa = W * 0.31, xb = W * 0.43, pathAt = [];
    for (let y = top; y < H; y++) {
      const p = (y - top) / (H - top), cx = xa + (xb - xa) * p + Math.sin(p * 3.4) * W * 0.045 * p, w = 2 + p * W * 0.085;
      pathAt.push([y, cx, w]);
      R(f, cx - w / 2 - 1, y, w + 2, 1, K.muted);
      R(f, cx - w / 2, y, w, 1, K.silver);
      if (r() < 0.25 && w > 6) R(f, cx - w / 2 + 1 + r() * (w - 2), y, 1, 1, K.muted);
    }
    // a wooden bench beside the path
    const [by, bc, bw] = pathAt[Math.round(pathAt.length * 0.42)];
    const bx = Math.round(bc + bw / 2 + 7);
    R(f, bx, by - 7, 16, 1, K.mid); R(f, bx, by - 5, 16, 1, K.mid); // back slats
    R(f, bx, by - 3, 16, 2, K.mid); R(f, bx, by - 1, 16, 1, K.ink); // seat and its shadow
    for (const lx of [bx + 1, bx + 14]) R(f, lx, by - 7, 1, 10, K.ink);
    for (let i = 0; i < 16; i += 2) R(f, bx + i, by + 3, 1, 1, K.ink); // shade on the grass
    // the oak framing the right edge
    const tx = Math.round(W * 0.905), ground = Math.round(hy + 12);
    R(f, tx - 3, ground - 2, 14, 3, K.mid); // root flare
    R(f, tx, hy - 46, 8, ground - (hy - 46), K.mid);
    R(f, tx + 6, hy - 46, 2, ground - (hy - 46), K.ink);
    for (let y = hy - 40; y < ground; y += 5) R(f, tx + 2 + ((y >> 2) & 1) * 2, y, 1, 3, K.ink); // bark
    line(f, tx + 1, hy - 34, tx - 14, hy - 52, K.mid, 3);
    line(f, tx + 6, hy - 40, tx + 22, hy - 58, K.mid, 3);
    const cy = hy - 64, cx = tx + 4;
    const blobs = [[0, 0, 30, 20], [-22, 8, 18, 13], [22, 6, 20, 15], [-8, -16, 20, 13], [14, -14, 18, 12], [-30, -4, 12, 9], [32, -6, 14, 11]];
    for (const [dx, dy, rx, ry] of blobs) ellipse(f, cx + dx, cy + dy, rx, ry, K.forest);
    for (const [dx, dy, rx, ry] of blobs) ellipse(f, cx + dx - 3, cy + dy - 3, Math.round(rx * 0.62), Math.round(ry * 0.55), K.leaf);
    // underside shade: canopy pixels with open sky three pixels below them, dithered
    const bx0 = Math.max(0, cx - 46), by0 = Math.max(0, cy - 32), bw0 = Math.min(W, cx + 52) - bx0, bh0 = Math.min(H, cy + 32) - by0;
    const data = f.getImageData(bx0, by0, bw0, bh0).data;
    const green = (x, y) => { const i = (y * bw0 + x) * 4; return data[i + 3] && (data[i + 1] === 0x44 || data[i + 1] === 0x63); };
    for (let y = 0; y < bh0 - 3; y++) for (let x = 0; x < bw0; x++) {
      if (green(x, y) && !green(x, y + 3) && BAYER[(y + by0) & 3][(x + bx0) & 3] < 8) R(f, bx0 + x, by0 + y, 1, 1, K.ink);
    }
    for (let i = 0; i < 26; i++) R(f, cx - 30 + r() * 64, cy - 20 + r() * 36, 1, 1, K.leaf);
  }
  function makeClouds() {
    const r = rng(11);
    clouds = Array.from({ length: 5 }, (_, i) => ({
      x: r() * W, y: 10 + i * ((hy - 70) / 5) + r() * 8, w: 16 + Math.floor(r() * 18), h: 4 + Math.floor(r() * 4), v: 1.2 + r() * 2.4,
    }));
  }
  function drawCloud(c) {
    const x = Math.round(c.x), y = Math.round(c.y);
    const parts = [[0, 0, c.w, c.h], [Math.round(c.w * 0.25), -c.h + 2, Math.round(c.w * 0.32), c.h], [Math.round(c.w * 0.55), -Math.round(c.h * 0.6), Math.round(c.w * 0.28), c.h]];
    for (const [dx, dy, rx, ry] of parts) ellipse(g, x + dx, y + dy + 2, rx, ry, K.silver);
    for (const [dx, dy, rx, ry] of parts) ellipse(g, x + dx, y + dy, rx, ry, K.sheet);
  }
  function drawFlower() {
    const fx = Math.round(W * 0.11), fy = H - 4, sway = o.reduce ? 0 : Math.sin(t * 1.7) * 2.2;
    for (let i = 0; i < 16; i++) R(g, fx + Math.round((sway * i) / 16), fy - i, 1, 1, K.leaf);
    R(g, fx - 3, fy - 6, 3, 1, K.leaf); R(g, fx + 1, fy - 9, 3, 1, K.leaf);
    const hx = fx + Math.round(sway), hyy = fy - 18;
    R(g, hx - 1, hyy - 3, 3, 2, K.gold); R(g, hx - 1, hyy + 2, 3, 2, K.gold);
    R(g, hx - 3, hyy - 1, 2, 3, K.gold); R(g, hx + 2, hyy - 1, 2, 3, K.gold);
    R(g, hx - 1, hyy - 1, 3, 3, K.ink);
    for (const [gx, gh] of [[-6, 5], [-4, 7], [4, 6], [7, 4], [9, 6]]) R(g, fx + gx + Math.round(sway * 0.3), fy - gh, 1, gh, K.leaf);
  }
  function drawScene() {
    g.drawImage(back, 0, 0);
    for (const c of clouds) drawCloud(c);
    g.drawImage(front, 0, 0);
    drawFlower();
  }

  // ---------- the desk: laptop, notebook, pen ----------
  function drawDesk() {
    const d = dg;
    d.clearRect(0, 0, DW, DH);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 104; x++) { // dithered shadow on the grass
      const rx = (x - 52) / 52, ry = (y - 2) / 3;
      if (rx * rx + ry * ry < 1 && (x + y) % 2 === 0) R(d, x + 2, 56 + y, 1, 1, K.ink);
    }
    // lid
    R(d, 17, 7, 58, 40, K.ink);
    R(d, 18, 8, 56, 38, K.mid);
    R(d, 19, 9, 54, 36, K.ink);
    drawScreen();
    // deck, seen from the front at a slant
    quad(d, [[15, 46], [77, 46], [83, 55], [9, 55]], K.ink);
    quad(d, [[16, 47], [76, 47], [81, 54], [11, 54]], K.silver);
    R(d, 9, 56, 75, 2, K.muted); R(d, 9, 58, 75, 1, K.ink);
    for (let row = 0; row < 3; row++) {
      const y = 48 + row * 2, inset = 3 - row;
      for (let x = 18 - row * 2 + inset; x < 74 + row * 2 - inset; x += 3) R(d, x, y, 2, 1, K.muted);
    }
    R(d, 39, 54, 14, 1, K.muted); // trackpad edge
    R(d, 18, 46, 56, 1, K.muted); // hinge
    // notebook lying flat, spiral on the left, pen across the cover
    quad(d, [[88, 38], [110, 38], [106, 55], [84, 55]], K.ink);
    quad(d, [[89, 39], [109, 39], [105, 54], [85, 54]], K.mid);
    R(d, 84, 56, 23, 2, K.sheet); R(d, 85, 57, 21, 1, K.silver); R(d, 84, 58, 23, 1, K.ink);
    for (let y = 40; y < 54; y += 2) R(d, 88 - Math.round((y - 39) / 4), y, 2, 1, K.gold);
    R(d, 104, 45, 3, 4, K.gold); R(d, 105, 46, 1, 2, K.ink); // clasp
    for (let y = 41; y < 53; y += 3) R(d, 93 + ((y >> 1) & 1), y, 9, 1, K.ink); // tooled lines on the leather
    line(d, 89, 52, 106, 41, K.ink, 2);
    R(d, 88, 53, 2, 1, K.gold); R(d, 104, 41, 2, 2, K.gold); // nib and cap
  }
  function drawScreen() {
    const d = dg, s = SCREEN;
    R(d, s.x, s.y, s.w, s.h, K.sheet);
    R(d, s.x, s.y, s.w, 3, K.paper);
    R(d, s.x + 1, s.y + 1, 1, 1, K.muted); R(d, s.x + 3, s.y + 1, 1, 1, K.muted); R(d, s.x + 5, s.y + 1, 1, 1, K.gold);
    R(d, s.x, s.y + 3, s.w, 1, K.silver);
    // the clouds outside, reflected
    for (const [i, c] of clouds.slice(0, 2).entries()) {
      const cx = s.x + ((((c.x / W) * s.w + i * 17) % s.w) + s.w) % s.w;
      for (let k = 0; k < 7; k++) if (cx + k < s.x + s.w - 1) R(d, cx + k, s.y + 6 + i * 3, 1, 1, K.silver);
    }
    // a slow wave of files
    const kinds = [K.gold, K.forest, K.mid, K.leaf, K.muted, K.forest, K.gold];
    for (let i = 0; i < kinds.length; i++) {
      const x = s.x + 3 + i * 7, y = s.y + 18 + Math.round(Math.sin((o.reduce ? 0 : t * 2) + i * 0.9) * 3);
      R(d, x, y, 4, 6, kinds[i]); R(d, x + 3, y, 1, 1, K.sheet); R(d, x + 1, y + 2, 2, 1, K.sheet);
    }
    R(d, s.x + 3, s.y + s.h - 2, s.w - 6, 1, K.silver);
  }

  // ---------- sizing, loop, API ----------
  function resize() {
    if (flat) return;
    P = innerWidth < 700 ? 3 : 4;
    W = Math.ceil(innerWidth / P); H = Math.ceil(innerHeight / P);
    hy = Math.round(H * 0.7);
    scene.width = W; scene.height = H;
    g.imageSmoothingEnabled = false;
    drawBack(); drawFront();
    if (!clouds.length) makeClouds();
    for (const c of clouds) c.y = Math.min(c.y, hy - 30);
    dc.width = DW; dc.height = DH;
    dc.style.width = DW * P + 'px'; dc.style.height = DH * P + 'px';
    drawScene(); drawDesk();
  }
  function frame(dt) {
    if (flat || o.reduce) return;
    t += dt;
    for (const c of clouds) { c.x += c.v * dt; if (c.x - c.w > W) c.x = -c.w * 2; }
    drawScene(); drawScreen();
  }
  // The laptop screen on the page: where the vault grows from and folds back into.
  function screenRect() {
    if (flat) return document.querySelector('#enterBtn').getBoundingClientRect();
    const b = dc.getBoundingClientRect(), k = b.width / DW;
    return { left: b.left + SCREEN.x * k, top: b.top + SCREEN.y * k, right: b.left + (SCREEN.x + SCREEN.w) * k, bottom: b.top + (SCREEN.y + SCREEN.h) * k };
  }
  function init(opts) {
    o = Object.assign(o, opts);
    hero = document.querySelector('#hero'); scene = document.querySelector('#scene'); desk = document.querySelector('#desk'); dc = document.querySelector('#deskArt');
    g = scene.getContext('2d'); dg = dc.getContext('2d');
    flat = !g || !dg;
    hero.dataset.scene = flat ? 'flat' : 'drawn';
    if (!flat) { dg.imageSmoothingEnabled = false; resize(); }
    // The laptop and the notebook open the vault; the empty corners of the desk canvas do not.
    desk.addEventListener('click', (e) => {
      const b = dc.getBoundingClientRect(), x = ((e.clientX - b.left) / b.width) * DW, y = ((e.clientY - b.top) / b.height) * DH;
      if ((x >= 9 && x <= 84 && y >= 7 && y <= 59) || (x >= 84 && x <= 110 && y >= 38 && y <= 59)) o.onEnter();
    });
  }
  window.ArkhiveLanding = { init, frame, resize, screenRect };
})();
