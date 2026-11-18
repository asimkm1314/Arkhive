// Arkhive start screen: the laptop, notebook and pen in the bottom-right corner, drawn in whole art pixels with palette colours only.
(function () {
  'use strict';

  const K = {
    paper: '#EDE6DA', sheet: '#F5EFE6', silver: '#D8CFC0', ink: '#261A14', mid: '#5C463B',
    muted: '#8A7367', forest: '#234434', leaf: '#3A634C', gold: '#B89658',
  };
  const DW = 112, DH = 62; // desk art size
  const SCREEN = { x: 21, y: 11, w: 50, h: 31 }; // laptop screen, in desk art pixels

  let o = { reduce: false };
  let hero, dc, dg, t = 0, flat = false;

  const R = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  function quad(ctx, pts, c) { // filled quad, scanline by scanline
    const ys = pts.map((p) => p[1]);
    ctx.fillStyle = c;
    for (let y = Math.min(...ys); y <= Math.max(...ys); y++) {
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

  // ---------- the desk: laptop, notebook, pen ----------
  function drawDesk() {
    const d = dg;
    d.clearRect(0, 0, DW, DH);
    for (let y = 0; y < 5; y++) for (let x = 0; x < 104; x++) { // dithered shadow on the grass
      const rx = (x - 52) / 52, ry = (y - 2) / 3;
      if (rx * rx + ry * ry < 1 && (x + y) % 2 === 0) R(d, x + 2, 56 + y, 1, 1, K.ink);
    }
    R(d, 17, 7, 58, 40, K.ink); R(d, 18, 8, 56, 38, K.mid); R(d, 19, 9, 54, 36, K.ink); // lid
    drawScreen();
    quad(d, [[15, 46], [77, 46], [83, 55], [9, 55]], K.ink); // deck
    quad(d, [[16, 47], [76, 47], [81, 54], [11, 54]], K.silver);
    R(d, 9, 56, 75, 2, K.muted); R(d, 9, 58, 75, 1, K.ink);
    for (let row = 0; row < 3; row++) {
      const y = 48 + row * 2, inset = 3 - row;
      for (let x = 18 - row * 2 + inset; x < 74 + row * 2 - inset; x += 3) R(d, x, y, 2, 1, K.muted);
    }
    R(d, 39, 54, 14, 1, K.muted); R(d, 18, 46, 56, 1, K.muted);
    quad(d, [[88, 38], [110, 38], [106, 55], [84, 55]], K.ink); // notebook
    quad(d, [[89, 39], [109, 39], [105, 54], [85, 54]], K.mid);
    R(d, 84, 56, 23, 2, K.sheet); R(d, 85, 57, 21, 1, K.silver); R(d, 84, 58, 23, 1, K.ink);
    for (let y = 40; y < 54; y += 2) R(d, 88 - Math.round((y - 39) / 4), y, 2, 1, K.gold); // spiral
    R(d, 104, 45, 3, 4, K.gold); R(d, 105, 46, 1, 2, K.ink); // clasp
    for (let y = 41; y < 53; y += 3) R(d, 93 + ((y >> 1) & 1), y, 9, 1, K.ink);
    line(d, 89, 52, 106, 41, K.ink, 2); // pen
    R(d, 88, 53, 2, 1, K.gold); R(d, 104, 41, 2, 2, K.gold);
  }
  function drawScreen() {
    const d = dg, s = SCREEN;
    R(d, s.x, s.y, s.w, s.h, K.sheet);
    R(d, s.x, s.y, s.w, 3, K.paper);
    R(d, s.x + 1, s.y + 1, 1, 1, K.muted); R(d, s.x + 3, s.y + 1, 1, 1, K.muted); R(d, s.x + 5, s.y + 1, 1, 1, K.gold);
    R(d, s.x, s.y + 3, s.w, 1, K.silver);
    const kinds = [K.gold, K.forest, K.mid, K.leaf, K.muted, K.forest, K.gold]; // a slow wave of files
    for (let i = 0; i < kinds.length; i++) {
      const x = s.x + 3 + i * 7, y = s.y + 18 + Math.round(Math.sin((o.reduce ? 0 : t * 2) + i * 0.9) * 3);
      R(d, x, y, 4, 6, kinds[i]); R(d, x + 3, y, 1, 1, K.sheet); R(d, x + 1, y + 2, 2, 1, K.sheet);
    }
    R(d, s.x + 3, s.y + s.h - 2, s.w - 6, 1, K.silver);
  }

  // ---------- sizing, loop, API ----------
  function resize() {
    if (flat) return;
    const pd = innerWidth < 700 ? 1 : 2; // CSS px per art pixel
    dc.width = DW; dc.height = DH;
    dc.style.width = DW * pd + 'px'; dc.style.height = DH * pd + 'px';
    dg.imageSmoothingEnabled = false;
    drawDesk();
  }
  function frame(dt) {
    if (flat || o.reduce) return;
    t += dt;
    drawScreen();
  }
  function init(opts) {
    o = Object.assign(o, opts);
    hero = document.querySelector('#hero'); dc = document.querySelector('#deskArt');
    dg = dc.getContext('2d');
    flat = !dg;
    hero.dataset.scene = flat ? 'flat' : 'drawn';
    resize();
  }
  window.ArkhiveLanding = { init, frame, resize, DESK: { DW, DH } };
})();
