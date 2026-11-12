// Arkhive hero: six cards on a tilted ring, drawn in WebGL with a speed-driven dispersion shader and bound to a
// four-stage scroll story. When WebGL or the 3D library is unavailable the same cards are shown as a flat row.
// Classic script (works from file://). The page owns the one animation loop and calls ArkhiveHero.frame(dt).
(function () {
  'use strict';

  const TAU = Math.PI * 2;
  const STAGES = ['Raw capture', 'Optical grading', 'Finished artwork', 'Now'];
  const AFTER = 'Archive';               // what the cue names once the last stage is showing
  const RADIUS = 2.4, CARD_W = 1.2, CARD_H = 1.6;
  const PAD = 2.6;                       // each plane is this many times its card, so the smear has room to leave it
  const TEX = [512, 683];                // card texture, 3:4
  const ENTER_AT = 1.1;                  // scrolling this far past the last stage opens the vault
  const THREE_LOCAL = './vendor/three.module.min.js';
  const THREE_CDN = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.min.js'; // same pinned version as package.json

  const $ = (s) => document.querySelector(s);
  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const smooth = (x) => x * x * (3 - 2 * x);

  const H = {
    opts: null, hero: null, cards: [], gl: null,
    target: 0, p: 0,                     // story position: where the owner scrolled to, and where the screen has eased to
    auto: 0, drag: 0, dragVel: 0,        // idle turn, and the turn added by dragging (with inertia)
    spin: 0, vel: 0,                     // ring angle and its smoothed speed (rad/s)
    hover: -1, press: null, moved: false, entered: false,
    look: { x: 0, y: 0, tx: 0, ty: 0 },  // pointer position −1…1, eased, for the camera's parallax
    shown: { stage: -1, cue: -1, nav: -1, ruler: -1 },
  };

  const VERT = `varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

  // For 16 values of t (0 = trailing … 1 = leading) the card is sampled displaced along its direction of travel and
  // weighted by a spectrum: amber behind, green in the middle, cyan and cobalt ahead. Dividing by the summed weights
  // returns the untouched card when it is still.
  const FRAG = `uniform sampler2D map; uniform vec2 uShift; uniform float uVel;
varying vec2 vUv;
const float PAD = ${PAD.toFixed(1)};
vec3 spectrum(float t) {
  vec3 c0 = vec3(1.0, 0.478, 0.0), c1 = vec3(1.0, 0.722, 0.0), c2 = vec3(0.72, 1.0, 0.24), c3 = vec3(0.0, 0.898, 1.0), c4 = vec3(0.118, 0.314, 1.0);
  float x = t * 4.0;
  return x < 1.0 ? mix(c0, c1, x) : x < 2.0 ? mix(c1, c2, x - 1.0) : x < 3.0 ? mix(c2, c3, x - 2.0) : mix(c3, c4, x - 3.0);
}
void main() {
  vec2 px = fwidth(vUv) * PAD * 1.2;   // about one screen pixel in card space, to soften the card's edge
  vec3 acc = vec3(0.0), wsum = vec3(0.0);
  float cover = 0.0;
  float grain = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); // per-pixel offset: turns 16 steps into grain
  for (int i = 0; i < 16; i++) {
    float t = (float(i) + grain) / 16.0;
    vec2 cu = (vUv - uShift * (t - 0.5) - 0.5) * PAD + 0.5;
    float inside = smoothstep(0.0, px.x, cu.x) * smoothstep(0.0, px.x, 1.0 - cu.x) * smoothstep(0.0, px.y, cu.y) * smoothstep(0.0, px.y, 1.0 - cu.y);
    vec3 w = spectrum(t);
    acc += texture2D(map, cu).rgb * inside * w;
    wsum += w;
    cover += inside;
  }
  float feather = mix(1.0, smoothstep(1.0, 0.3, length((vUv - 0.5) * 2.0)), uVel); // at speed the streak dissolves outwards
  gl_FragColor = vec4(acc / wsum * (1.0 + uVel * 0.8) * feather, cover / 16.0 * feather); // premultiplied
}`;

  // ---------- cards: one button per vault, painted by the page ----------
  function buildCards() {
    const wrap = $('#heroCards');
    wrap.textContent = '';
    H.cards = H.opts.keys.map((key, i) => {
      const el = document.createElement('button');
      el.className = 'prism-card';
      el.dataset.key = key;
      const canvas = document.createElement('canvas');
      canvas.width = TEX[0]; canvas.height = TEX[1];
      el.appendChild(canvas);
      wrap.appendChild(el);
      return { key, i, el, canvas, angle: (i / H.opts.keys.length) * TAU + Math.PI / 2, hover: 0, box: '' };
    });
    H.cards.forEach(paint);
  }
  function paint(card) {
    H.opts.paint(card.key, card.canvas);
    card.el.setAttribute('aria-label', H.opts.label(card.key));
    if (card.tex) card.tex.needsUpdate = true;
  }

  // ---------- WebGL ring ----------
  function loadThree() {
    // Chrome will not import a module from file://, so a page opened straight from disk uses the pinned CDN copy.
    return location.protocol === 'file:' ? import(THREE_CDN) : import(THREE_LOCAL).catch(() => import(THREE_CDN));
  }
  function startRing(T) {
    const canvas = $('#prism');
    const renderer = new T.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    renderer.setClearColor(0x000000, 1);
    renderer.outputColorSpace = T.LinearSRGBColorSpace; // colours go out as painted, to match the vault's paper
    const camera = new T.PerspectiveCamera(35, 1, 0.1, 100);
    const scene = new T.Scene(), tilt = new T.Group(), spinner = new T.Group();
    tilt.rotation.set((18 * Math.PI) / 180, (-12 * Math.PI) / 180, 0);
    tilt.add(spinner); scene.add(tilt);
    const geo = new T.PlaneGeometry(CARD_W * PAD, CARD_H * PAD);
    const aniso = renderer.capabilities.getMaxAnisotropy();
    for (const c of H.cards) {
      c.tex = new T.CanvasTexture(c.canvas);
      c.tex.anisotropy = aniso;
      c.mat = new T.ShaderMaterial({
        uniforms: { map: { value: c.tex }, uShift: { value: new T.Vector2() }, uVel: { value: 0 } },
        vertexShader: VERT, fragmentShader: FRAG, transparent: true, premultipliedAlpha: true, depthTest: false, depthWrite: false,
        extensions: { derivatives: true },
      });
      c.mesh = new T.Mesh(geo, c.mat);
      c.mesh.position.set(Math.cos(c.angle) * RADIUS, Math.sin(c.angle) * RADIUS, 0);
      spinner.add(c.mesh);
    }
    H.gl = { T, renderer, camera, scene, tilt, spinner, v: new T.Vector3(), dist: 10 };
    canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); flat('The graphics context was lost, so the cards are shown flat'); });
    fit();
    H.hero.dataset.ring = 'webgl';
  }
  function fit() {
    if (!H.gl) return;
    const { renderer, camera, tilt } = H.gl, w = innerWidth, h = innerHeight, aspect = w / h, wide = aspect >= 1;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    renderer.setSize(w, h, false);
    camera.aspect = aspect;
    // Wide windows: the ring sits low and right and bleeds off the edge, leaving the headline its corner.
    // Tall windows: the ring is centred and fills the width, its outer cards just touching the edges.
    const visH = wide ? 6.3 : 5.7 / aspect;
    H.gl.dist = visH / (2 * Math.tan((camera.fov * Math.PI) / 360));
    tilt.position.set(wide ? visH * aspect * 0.13 : 0, wide ? -visH * 0.15 : -visH * 0.07, 0);
    camera.updateProjectionMatrix();
  }
  function flat(reason) {
    if (H.gl) { H.gl.renderer.dispose(); H.gl = null; }
    for (const c of H.cards) { c.el.removeAttribute('style'); c.box = ''; }
    H.hero.dataset.ring = 'flat';
    $('#heroHint').textContent = `${reason}. Choose a card to open its vault.`;
  }

  function draw() {
    const { camera, renderer, scene, spinner, v, dist } = H.gl, still = H.opts.reduce;
    spinner.rotation.z = H.spin;
    const speed = still ? 0 : clamp(Math.abs(H.vel) / 2.2, 0, 1), dir = H.vel < 0 ? -1 : 1;
    const len = still ? 0 : 0.012 + Math.max(0, speed - 0.05) * 0.95; // smear length in ring units; the small constant is the idle fringe
    for (const c of H.cards) {
      c.mesh.rotation.z = -H.spin; // cards stay upright all the way round
      c.mesh.scale.setScalar(1 + 0.08 * c.hover);
      const a = c.angle + H.spin, calm = 1 - 0.9 * c.hover;
      c.mat.uniforms.uShift.value.set((-Math.sin(a) * dir * len * calm) / (PAD * CARD_W), (Math.cos(a) * dir * len * calm) / (PAD * CARD_H));
      c.mat.uniforms.uVel.value = Math.max(0, speed - 0.05) * calm;
    }
    camera.position.set(H.look.x * 0.45, -H.look.y * 0.32, dist);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    // each card's button follows its plane on screen, for pointer, keyboard and the dive into the vault
    const w = innerWidth, h = innerHeight;
    for (const c of H.cards) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let k = 0; k < 4; k++) {
        v.set(((k & 1) - 0.5) * CARD_W, ((k >> 1) - 0.5) * CARD_H, 0).applyMatrix4(c.mesh.matrixWorld).project(camera);
        const sx = (v.x * 0.5 + 0.5) * w, sy = (-v.y * 0.5 + 0.5) * h;
        x0 = Math.min(x0, sx); x1 = Math.max(x1, sx); y0 = Math.min(y0, sy); y1 = Math.max(y1, sy);
      }
      const box = `${x0.toFixed(1)},${y0.toFixed(1)},${(x1 - x0).toFixed(1)},${(y1 - y0).toFixed(1)}`;
      if (box === c.box) continue;
      c.box = box;
      c.el.style.transform = `translate(${x0.toFixed(1)}px, ${y0.toFixed(1)}px)`;
      c.el.style.width = (x1 - x0).toFixed(1) + 'px';
      c.el.style.height = (y1 - y0).toFixed(1) + 'px';
    }
  }

  // ---------- story: headline, cue, ruler, navigation ----------
  function story() {
    const { stage, t } = H.opts.storyAt(H.p), s = H.shown;
    if (stage !== s.stage) {
      s.stage = stage;
      H.hero.dataset.stage = stage;
      const title = $('#stageTitle'), next = document.createElement('span');
      for (const old of title.querySelectorAll('.st')) { old.classList.remove('on'); setTimeout(() => old.remove(), 600); }
      next.className = 'st';
      next.textContent = STAGES[stage];
      title.appendChild(next);
      void next.offsetWidth; // so the new line fades in from its resting-off state
      next.classList.add('on');
      $('#stageNext').textContent = STAGES[stage + 1] || AFTER;
      $('#storyBack').disabled = stage === 0;
    }
    // the cue sharpens as its stage approaches; at the last stage it follows the overscroll toward the vault
    const cue = Math.round(smooth(stage === STAGES.length - 1 ? clamp((H.p - 1) / (ENTER_AT - 1), 0, 1) : t) * 50);
    if (cue !== s.cue) { s.cue = cue; $('#stageNext').style.setProperty('--t', (cue / 50).toFixed(2)); }
    const ruler = Math.round(clamp(H.p, 0, 1) * 500);
    if (ruler !== s.ruler) { s.ruler = ruler; $('#rulerTrack').style.setProperty('--p', (ruler / 500).toFixed(3)); }
    const nav = H.opts.reduce ? 0 : Math.round(clamp(Math.abs(H.vel) / 3, 0, 1) * 20);
    if (nav !== s.nav) { s.nav = nav; $('#heroNav').style.setProperty('--v', (nav / 20).toFixed(2)); }
  }
  const heading = () => H.opts.storyAt(H.target).stage; // the stage the story is on its way to
  const toStage = (n) => { H.target = clamp(n, 0, STAGES.length) / STAGES.length + (n > 0 && n < STAGES.length ? 0.01 : 0); };

  // The card to grow into the vault when no card was chosen: the one nearest the middle of the window.
  function nearest() {
    let best = H.cards[0], bestD = Infinity;
    for (const c of H.cards) {
      const b = c.el.getBoundingClientRect(), d = Math.hypot(b.left + b.width / 2 - innerWidth / 2, b.top + b.height / 2 - innerHeight / 2);
      if (d < bestD) { best = c; bestD = d; }
    }
    return best;
  }
  // Open the vault, growing out of `card`. A chosen card opens its own vault; the link, Enter and the scroll open the first.
  function enter(card, key = card.key) {
    if (H.entered) return;
    H.entered = H.opts.onEnter(key, card.el) !== false; // the page may refuse (it is busy); then nothing is latched
  }

  function bind() {
    const hero = H.hero;
    hero.addEventListener('wheel', (e) => {
      const d = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      H.target = clamp(H.target + clamp(d, -600, 600) / 2000, 0, ENTER_AT + 0.06);
    }, { passive: true });
    hero.addEventListener('pointerdown', (e) => {
      if (e.button > 0 || e.target.closest('.hero-nav')) return;
      H.press = { x: e.clientX, y: e.clientY, t: performance.now(), touch: e.pointerType !== 'mouse' };
      H.moved = false;
    });
    addEventListener('pointermove', (e) => {
      H.look.tx = (e.clientX / innerWidth - 0.5) * 2; H.look.ty = (e.clientY / innerHeight - 0.5) * 2;
      const pr = H.press;
      if (!pr) return;
      const dx = e.clientX - pr.x, dy = e.clientY - pr.y, now = performance.now(), dt = Math.max(8, now - pr.t) / 1000;
      if (Math.abs(dx) + Math.abs(dy) > 6) H.moved = true;
      if (!H.moved) return;
      const turn = dx * 0.0045; // sideways drag turns the ring
      H.drag += turn; H.dragVel = turn / dt;
      if (pr.touch) H.target = clamp(H.target - (dy / innerHeight) * 0.9, 0, ENTER_AT + 0.06); // touch: up and down move the story
      pr.x = e.clientX; pr.y = e.clientY; pr.t = now;
    });
    const release = () => { H.press = null; };
    addEventListener('pointerup', release);
    addEventListener('pointercancel', release);
    const cards = $('#heroCards');
    cards.addEventListener('pointerover', (e) => { const el = e.target.closest('.prism-card'); H.hover = el && e.pointerType === 'mouse' ? H.cards.findIndex((c) => c.el === el) : -1; });
    cards.addEventListener('pointerout', (e) => { if (!(e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('.prism-card'))) H.hover = -1; });
    cards.addEventListener('click', (e) => {
      const el = e.target.closest('.prism-card');
      if (!el) return;
      if (H.moved) { H.moved = false; return; } // that was a drag of the ring, not a choice
      enter(H.cards.find((c) => c.el === el));
    });
    $('#archiveLink').addEventListener('click', () => enter(nearest(), H.opts.keys[0]));
    $('#navPresets').addEventListener('click', () => { if (!H.entered) H.entered = H.opts.onPresets(nearest().el) !== false; });
    $('#navHow').addEventListener('click', () => toStage(heading() >= STAGES.length - 1 ? 0 : heading() + 1));
    $('#storyBack').addEventListener('click', () => toStage(heading() - 1));
    addEventListener('resize', fit);
  }

  window.ArkhiveHero = {
    // opts: { keys, reduce, storyAt(p), paint(key, canvas), label(key), onEnter(key, el), onPresets(el) }; the last two return false to refuse
    init(opts) {
      H.opts = opts;
      H.hero = $('#hero');
      buildCards();
      $('#rulerTrack').innerHTML = '<i></i>'.repeat(Math.ceil((innerHeight * 1.1) / 6));
      bind();
      story();
      loadThree().then(
        (T) => { try { startRing(T); } catch (err) { console.warn('Arkhive hero: WebGL could not start:', err); flat('This window has no WebGL, so the cards are shown flat'); } },
        (err) => { console.warn('Arkhive hero: the 3D library did not load:', err); flat('The 3D library did not load, so the cards are shown flat'); },
      );
    },
    frame(dt) {
      const still = H.opts.reduce;
      H.p += (H.target - H.p) * (1 - Math.exp(-(still ? 30 : 6) * dt)); // the eased scroll
      if (!H.press) { H.drag += H.dragVel * dt; H.dragVel *= Math.exp(-(H.hover >= 0 ? 9 : 2.6) * dt); }
      if (!still && H.hover < 0 && !H.press) H.auto += 0.07 * dt; // idle turn; resting on a card holds the ring
      const spin = H.auto + Math.min(H.p, 1) * TAU + H.drag;
      if (dt > 0) H.vel += ((spin - H.spin) / dt - H.vel) * (1 - Math.exp(-10 * dt));
      H.spin = spin;
      for (const c of H.cards) c.hover += ((c.i === H.hover ? 1 : 0) - c.hover) * (1 - Math.exp(-10 * dt));
      const k = 1 - Math.exp(-5 * dt);
      H.look.x += (H.look.tx - H.look.x) * k; H.look.y += (H.look.ty - H.look.y) * k;
      story();
      if (H.gl) draw();
      if (H.target >= ENTER_AT) enter(nearest(), H.opts.keys[0]);
    },
    // Arrow and page keys step the story. Returns true when the key was used.
    key(e) {
      const step = { ArrowDown: 1, PageDown: 1, ArrowRight: 1, ArrowUp: -1, PageUp: -1, ArrowLeft: -1 }[e.key];
      if (!step) return false;
      toStage(clamp(heading() + step, 0, STAGES.length - 1));
      return true;
    },
    // The page calls this when a card's count or picture changed (no key: all of them).
    refresh(key) { for (const c of H.cards) if (!key || c.key === key) paint(c); },
    // Back on the hero after a visit to the vault.
    reset() { H.entered = false; H.target = Math.min(H.target, 0.98); H.moved = false; },
    cardEl: (key) => (H.cards.find((c) => c.key === key) || H.cards[0]).el,
  };
})();
