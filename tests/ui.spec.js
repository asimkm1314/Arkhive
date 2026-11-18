// Acceptance flows from specs/003-arkhive-prism and specs/004-arkhive-workspace, run against app/index.html from file://.
// The app ships no file data, so each test supplies files one of two ways:
//   - browser path: a stand-in for the folder picker, built from tests/fixtures;
//   - desktop path: a stand-in for the Tauri backend, answering the same commands from the same fixture.
const { test, expect } = require('@playwright/test');
const path = require('path');

const URL = 'file://' + path.resolve(__dirname, '../app/index.html');
const FIXTURE = path.resolve(__dirname, 'fixtures/demo-folder.js');
const BLOOD = 'Hey Arkhive, find the file which has blood related';
const CBC = 'CBC_Blood_Panel_Report_Nov2026.pdf';
const PIXEL_PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';


const view = (page, v) => expect(page.locator('body')).toHaveAttribute('data-view', v, { timeout: 8000 });
const active = (page, v) => expect(page.locator('body')).toHaveAttribute('data-active', v);
const toast = (page) => page.locator('#toast');
const calls = (page, cmd) => page.evaluate((cmd) => window.__calls.filter((c) => c[0] === cmd).map((c) => c[1]), cmd);

// Unique items on a shelf, in shelf order.
const shelfItems = (page, shelf) =>
  page.$$eval(`${shelf} .tape`, (els) => {
    const seen = new Map();
    for (const el of els) seen.set(Number(el.dataset.i), el.dataset.name || el.dataset.key);
    return [...seen.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  });

// ---------- browser path: a folder the owner "picks" ----------
async function installFolder(page) {
  await page.addInitScript({ path: FIXTURE });
  await page.addInitScript((png) => {
    const root = { kind: 'directory', name: 'Fixture', children: new Map() };
    const dirAt = (node, name) => { if (!node.children.has(name)) node.children.set(name, { kind: 'directory', name, children: new Map() }); return node.children.get(name); };
    for (const r of window.ArchiveFixture.FILES) {
      const parts = r.path.split('/').slice(2); // drop '', 'Fixture'
      const leaf = parts.pop();
      let node = root;
      for (const p of parts) node = dirAt(node, p);
      if (r.kind === 'dir') dirAt(node, leaf);
      else node.children.set(leaf, { kind: 'file', name: leaf, body: r.text || '', modified: r.modified });
    }
    // one real image, so a real preview can be shown
    dirAt(root, 'Pictures').children.set('Real_Pixel.png', { kind: 'file', name: 'Real_Pixel.png', type: 'image/png', modified: Date.now(), body: Uint8Array.from(atob(png), (c) => c.charCodeAt(0)) });
    const handle = (node) => node.kind === 'directory'
      ? { kind: 'directory', name: node.name, entries: async function* () { for (const [n, c] of node.children) yield [n, handle(c)]; } }
      : { kind: 'file', name: node.name, getFile: async () => new File([node.body], node.name, { type: node.type || '', lastModified: node.modified }) };
    window.showDirectoryPicker = async () => handle(root);
  }, PIXEL_PNG);
}

// ---------- desktop path: a backend that answers from the fixture and records every call ----------
async function installDesktop(page, opts = {}) {
  await page.addInitScript({ path: FIXTURE });
  await page.addInitScript(({ opts, png }) => {
    const all = () => window.ArchiveFixture.FILES;
    const C = () => window.ArchiveCore;
    const gone = new Set();
    window.__calls = [];
    const send = ({ text, ...rec }) => (opts.noSnippets ? { ...rec, snippet: null } : rec); // the real backend never sends a file's whole text
    const match = ({ terms, exts, days }) => {
      let list = all().filter((f) => f.kind === 'file' && !gone.has(f.path));
      if (exts.length) list = list.filter((f) => exts.includes(f.ext));
      if (days) list = list.filter((f) => Date.now() - f.modified <= days * 864e5);
      list = terms.length ? C().searchLocal(list, terms) : [...list].sort((a, b) => b.modified - a.modified);
      return list.map(send);
    };
    const dir = (name) => ({ name, ext: '', kind: 'dir', path: '/Fixture/' + name, size: 0, created: 0, modified: 1, mode: 0o755, score: 0, snippet: null });
    // the real backend's trust-boundary limits (src-tauri/src/lib.rs validate)
    const limits = ({ terms = [], exts = [] }) => { if (terms.length > 24 || exts.length > 40) throw 'too many terms or extensions'; };
    const handlers = {
      search_files: (q) => (limits(q), opts.many
        ? Array.from({ length: opts.many }, (_, i) => ({ name: `Report_${String(i).padStart(4, '0')}.pdf`, ext: 'pdf', kind: 'file', path: `/Fixture/Many/Report_${i}.pdf`, size: 10, created: 0, modified: i + 1, mode: 0o644, score: 0, snippet: null }))
        : match(q).slice(0, opts.cap || 300)),
      vault_summary: ({ queries }) => {
        if (opts.countFails) throw 'spotlight failed: indexing is off';
        queries.forEach(limits);
        return queries.map((q) => { const l = match(q); return { count: l.length, bytes: l.reduce((n, f) => n + f.size, 0), newest: l.reduce((a, f) => (!a || f.modified > a.modified ? f : a), null) }; });
      },
      list_dir: ({ path }) => {
        const entries = path == null ? ['Desktop', 'Documents', 'Downloads', 'Pictures', 'Movies'].map(dir) : C().listChildren(all().filter((f) => !gone.has(f.path)), path).map(send);
        return { entries, total: entries.length };
      },
      thumbnail: () => Uint8Array.from(atob(png), (c) => c.charCodeAt(0)).buffer,
      open_file: () => null, quick_look: () => null, reveal_file: () => null, start_native_drag: () => null,
      export_files: () => '/Users/test/Downloads/Arkhive Export',
      rename_file: ({ path, newName }) => {
        if (opts.renameFails) throw `a file named ${newName} already exists here`;
        const f = all().find((x) => x.path === path);
        Object.assign(f, { name: newName, path: path.slice(0, path.lastIndexOf('/') + 1) + newName, ext: newName.includes('.') ? newName.split('.').pop().toLowerCase() : '' });
        return send(f);
      },
      trash_file: ({ path }) => { gone.add(path); return null; },
      snippet: ({ path, terms }) => C().snippetFor(all().find((f) => f.path === path).text, terms),
      choose_folder: ({ prompt }) => (opts.pick ? opts.pick[prompt] ?? null : null),
      move_file: ({ path, dir }) => {
        const f = all().find((x) => x.path === path);
        Object.assign(f, { path: dir + '/' + f.name });
        return send(f);
      },
    };
    const rename = handlers.rename_file;
    handlers.rename_file = (a) => { if ((opts.taken || []).includes(a.newName)) throw `a file named ${a.newName} already exists here`; return rename(a); };
    handlers.export_files = ({ dest }) => (dest || '/Users/test/Downloads') + '/Arkhive Export';
    handlers.access_status = () => opts.access || { folders: ['Desktop', 'Documents', 'Downloads'].map((name) => ({ name, readable: true })), full_disk: true };
    handlers.open_privacy_settings = () => null;
    handlers.speech_start = () => { if (opts.noNativeSpeech) throw 'native speech is not part of this build'; return null; };
    handlers.speech_stop = () => null;
    handlers.add_folder = () => opts.iosPick ?? null;
    handlers.index_status = () => ({ files: opts.indexed ?? 1234, pending: 0, ready: true, content_done: true });
    handlers.check_pdf = ({ path }) => { if (opts.fakePdf) throw 'this is not a real PDF'; return null; };
    handlers.read_text = ({ path }) => all().find((f) => f.path === path).text || '';
    handlers.preview_doc = ({ path }) => {
      if (opts.previewFails) throw 'converter took longer than 20 s';
      if (opts.previewText) return { kind: 'text', path, html: null, text: 'Big data analytics\nSlide two' };
      const name = path.split('/').pop();
      return { kind: 'html', path: '/Cache/previews/1/' + name + '.qlpreview/Preview.html',
        html: `<html><body><h1>${name}</h1><img src="Attachment1.jpeg" alt="slide"><script>parent.__escaped = true;</script></body></html>` };
    };
    const listeners = {};
    window.__emit = (name, payload) => (listeners[name] || []).forEach((f) => f({ payload }));
    window.__TAURI__ = {
      core: { convertFileSrc: (p) => (p.endsWith('.png') ? 'data:image/png;base64,' + png : 'asset://localhost/' + encodeURIComponent(p)), invoke: async (cmd, args) => { window.__calls.push([cmd, args]); if (!handlers[cmd]) throw `unknown command ${cmd}`; return handlers[cmd](args || {}); } },
      event: { listen: async (name, f) => { (listeners[name] = listeners[name] || []).push(f); return () => {}; } },
    };
  }, { opts, png: PIXEL_PNG });
}

async function enterVault(page) {
  await page.goto(URL);
  await page.locator('#btn-enter-arkhive').click();
  await view(page, 'tier1');
}
// Browser path, on the vault shelf, with the stand-in folder read.
async function start(page, { folder = true } = {}) {
  if (folder) await installFolder(page);
  await enterVault(page);
  if (folder) {
    await page.locator('#pickTop').click();
    await expect(page.locator('#count')).toContainText('Fixture', { timeout: 8000 });
  }
}
// Desktop path, on the vault shelf.
async function startDesktop(page, opts) {
  await installDesktop(page, opts);
  await enterVault(page);
}
const openVault = async (page) => { await page.keyboard.press('Enter'); await view(page, 'tier2'); };
// Glide the current shelf until `name` is the pulled-out item.
async function activate(page, name) {
  for (let i = 0; i < 60; i++) {
    if ((await page.locator('body').getAttribute('data-active')) === name) return;
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(60);
  }
  throw new Error('never became active: ' + name);
}
// A real mouse click on the pulled-out cover.
async function clickActiveCover(page) {
  await page.waitForTimeout(900); // let the shelf settle
  const box = await page.locator('.sheet:not([inert]) .tape.is-active .cv').first().boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}
async function search(page, q) {
  await page.keyboard.press('/');
  await expect(page.locator('#q')).toBeFocused();
  await page.locator('#q').fill(q);
  await page.keyboard.press('Enter');
}
const wheel = async (page, dy) => { await page.mouse.move(640, 400); await page.mouse.wheel(0, dy); };

// ---------- identity ----------

test('identity: title, wordmark, English only, two-dot cursor', async ({ page }) => {
  await page.goto(URL);
  await expect(page).toHaveTitle('Arkhive');
  await expect(page.locator('#hero h1')).toHaveAttribute('aria-label', 'ARKHIVE');
  await expect(page.locator('#cursor > i')).toHaveCount(2);
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  expect(html).not.toMatch(/[぀-ヿ㐀-鿿豈-﫿]/);
  expect(html).not.toContain('Noto');
});

test('identity: the fonts ship inside the app; nothing is fetched from the internet', async ({ page }) => {
  const remote = [];
  page.on('request', (r) => { if (/^https?:/.test(r.url())) remote.push(r.url()); });
  await page.goto(URL);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => [document.fonts.check('800 40px "Inter Tight"'), document.fonts.check('400 20px Newsreader')])).toEqual([true, true]);
  expect(await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '')).sort())).toEqual(['Inter Tight', 'Newsreader']);
  expect(remote).toEqual([]);
});

// ---------- 005 US1 ARK · [PILL] · HIVE hero ----------

const PALETTE = ['#EDE6DA', '#F5EFE6', '#D8CFC0', '#261A14', '#5C463B', '#8A7367', '#234434', '#3A634C', '#B89658'];
const canvasColours = (page, sel) => page.$eval(sel, (c) => {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, out = new Set();
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) out.add('#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase());
  return [...out];
});
const settled = (page) => page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || !a.effect.target.closest('#hero')), null, { timeout: 8000 });

test('hero: only the curves, ARKHIVE in the centre, ENTER ARKHIVE at the bottom centre, the laptop and notebook bottom-right', async ({ page }) => {
  await page.goto(URL);
  await view(page, 'landing');
  await settled(page);
  const word = page.locator('#hero-title');
  await expect(word).toHaveText('ARKHIVE');
  const w = await word.boundingBox(), fs = await word.evaluate((e) => getComputedStyle(e).fontSize);
  expect(parseFloat(fs)).toBeCloseTo(Math.min(900 * 0.17, 1440 * 0.13), 0);
  expect(Math.abs(w.x + w.width / 2 - 720)).toBeLessThan(3);
  expect(Math.abs(w.y + w.height / 2 - 450)).toBeLessThan(60);
  const btn = await page.locator('#btn-enter-arkhive').boundingBox();
  await expect(page.locator('#btn-enter-arkhive')).toHaveAccessibleName('Enter Arkhive');
  expect(Math.abs(btn.x + btn.width / 2 - 720)).toBeLessThan(2);
  expect(Math.abs(900 - (btn.y + btn.height) - 49.5)).toBeLessThan(2);
  expect(btn.height).toBe(52);
  const desk = await page.locator('.desk').boundingBox(), pc = await page.locator('#hero-computer').boundingBox(), book = await page.locator('#hero-book').boundingBox();
  expect(Math.abs(1440 - (desk.x + desk.width) - 64.8)).toBeLessThan(2);
  expect(Math.abs(900 - (desk.y + desk.height) - 40.5)).toBeLessThan(2);
  expect(book.x).toBeGreaterThan(pc.x);
  for (const gone of ['#hero-pill', '.status-pills', '.hero-nav', '.lede', '.rule', '#details', '#scene']) await expect(page.locator(gone), gone).toHaveCount(0);
  expect(await page.locator('.bg-lines-back path').count()).toBe(9);
  expect(await page.locator('.bg-lines-front path').count()).toBe(6);
  const colours = await canvasColours(page, '#deskArt');
  expect(colours.length).toBeGreaterThan(4);
  expect(colours.filter((c) => !PALETTE.includes(c))).toEqual([]);
});


// ---------- 005 US7 the word passes through the lines; the button lifts ----------

test('hero: ARKHIVE travels from behind the lines to dead centre in 800 ms, then the front lines drop behind it', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); // the opening is shorter than the web-font load
  const a = await page.evaluate(() => {
    const t = document.querySelector('#hero-title').getAnimations()[0];
    const z = (s) => Number(getComputedStyle(document.querySelector(s)).zIndex);
    return { d: t.effect.getTiming().duration, e: t.effect.getTiming().easing, k: t.effect.getKeyframes().map((k) => [k.offset, k.transform, k.clipPath]),
      back: z('.bg-lines-back'), title: z('#hero-title'), front: z('.bg-lines-front'),
      lines: document.querySelector('.bg-lines-back path').getAnimations()[0].effect.getTiming().duration };
  });
  expect(a.d).toBe(800); // owner 2026-11-18: the opening took too long
  expect(a.e).toBe('cubic-bezier(0.16, 1, 0.3, 1)');
  expect(a.k.map((k) => k[0])).toEqual([0, 0.72, 1]);
  expect(a.k[0][1]).toContain('translate3d(-18vw, 14vh, -260px) rotate(-6deg) scale(0.82)');
  expect(a.k[0][2]).toMatch(/^inset\(100%/);
  expect(a.k[1][1]).toContain('translate3d(0px, -6px, 20px) rotate(0deg) scale(1.02)');
  expect(a.k[2][1]).toContain('translate3d(0px, 0px, 0px) rotate(0deg) scale(1)');
  expect([a.back, a.title, a.front]).toEqual([5, 15, 20]); // the word passes between the two layers
  await settled(page);
  expect(await page.$eval('.bg-lines-front', (e) => Number(getComputedStyle(e).zIndex))).toBe(8);
  expect(a.lines).toBe(900);
  expect(await page.$eval('.bg-lines-back path', (p) => getComputedStyle(p).strokeDasharray)).toBe('2400px');
});

test('hero: ENTER ARKHIVE rises into place after the word, lifts and rolls its label on hover, and presses down', async ({ page }) => {
  await page.goto(URL, { waitUntil: 'domcontentloaded' }); // the opening is shorter than the web-font load
  const rise = await page.evaluate(() => { const a = document.querySelector('#btn-enter-arkhive').getAnimations()[0]; return { ...a.effect.getTiming(), k: a.effect.getKeyframes().map((k) => k.transform) }; });
  expect([rise.delay, rise.duration]).toEqual([300, 500]);
  expect(rise.k).toEqual(['translate(-50%, 40px)', 'translate(-50%, 0px)']);
  await settled(page);
  const btn = page.locator('#btn-enter-arkhive');
  const rest = await btn.boundingBox();
  await btn.hover();
  await page.waitForTimeout(700);
  const lifted = await btn.evaluate((b) => { const cs = getComputedStyle(b), m = new DOMMatrix(cs.transform); return { scale: m.a, border: cs.borderTopColor, shadow: cs.boxShadow, rolled: new DOMMatrix(getComputedStyle(b.querySelector('.bt-b')).transform).f, out: new DOMMatrix(getComputedStyle(b.querySelector('.bt-a')).transform).f }; });
  expect(lifted.scale).toBeCloseTo(1.02, 2); // owner 2026-11-18: the hover was too much
  expect(lifted.border).toBe('rgb(184, 150, 88)');
  expect(lifted.shadow).toContain('0px 7px 0px');
  expect(lifted.rolled).toBe(0);
  expect(lifted.out).toBeLessThan(0);
  const up = await btn.boundingBox();
  const rose = rest.y + rest.height / 2 - (up.y + up.height / 2);
  expect(rose).toBeGreaterThan(2);
  expect(rose).toBeLessThan(6); // a small lift, about 4 px
  await expect(btn.locator('.bt-b')).toHaveText('Enter Arkhive →');
});

// The first keyframe of the vault's clip-path is the origin element's own rectangle.
async function originOf(page, click) {
  await page.goto(URL);
  await settled(page);
  const sel = typeof click === 'string' ? click : null;
  await page.evaluate((sel) => document.addEventListener('click', () => { const b = document.querySelector(sel).getBoundingClientRect(); window.__at = { x: b.x, y: b.y, width: b.width, height: b.height }; }, { capture: true, once: true }), sel);
  await page.locator(sel).click();
  const r = await page.evaluate(() => window.__at);
  const first = await page.evaluate(() => document.querySelector('#vault').getAnimations()[0].effect.getKeyframes()[0]);
  const t = await page.evaluate(() => document.querySelector('#vault').getAnimations()[0].effect.getTiming());
  const [top, right = top, bottom = top, left = right] = first.clipPath.split('round')[0].match(/[\d.]+px/g).map(parseFloat); // CSS drops repeated sides
  return { r, inset: { top, right, bottom, left }, round: first.clipPath.match(/round ([\d.]+)px/)[1], duration: t.duration, easing: t.easing };
}
const near = (o) => {
  expect(Math.abs(o.inset.top - o.r.y)).toBeLessThan(2);
  expect(Math.abs(o.inset.left - o.r.x)).toBeLessThan(2);
  expect(Math.abs(1440 - o.inset.right - (o.r.x + o.r.width))).toBeLessThan(2);
  expect(Math.abs(900 - o.inset.bottom - (o.r.y + o.r.height))).toBeLessThan(2);
};

test('hero: Enter Arkhive grows the vault out of the button itself, round 999px, 450 ms', async ({ page }) => {
  const o = await originOf(page, '#btn-enter-arkhive');
  near(o);
  expect(o.round).toBe('999');
  expect(o.duration).toBe(450);
  expect(o.easing).toBe('cubic-bezier(0.32, 0.72, 0, 1)');
  await view(page, 'tier1');
});

test('hero: the computer grows the vault out of the computer, round 24px; back folds it into the computer again', async ({ page }) => {
  const o = await originOf(page, '#hero-computer');
  near(o);
  expect(o.round).toBe('24');
  await view(page, 'tier1');
  await page.locator('#back').click();
  const last = await page.evaluate(() => { const k = document.querySelector('#vault').getAnimations()[0].effect.getKeyframes(); return k[k.length - 1].clipPath; });
  const [top, , , left] = last.match(/[\d.]+px/g).map(parseFloat);
  expect(Math.abs(top - o.r.y)).toBeLessThan(2);
  expect(Math.abs(left - o.r.x)).toBeLessThan(2);
  await view(page, 'landing');
});

test('hero: the notebook and the ARKHIVE word also open the vault, and so does Enter', async ({ page }) => {
  for (const sel of ['#hero-book', '#hero-title']) {
    const o = await originOf(page, sel);
    near(o);
    await view(page, 'tier1');
  }
  await page.goto(URL);
  await settled(page);
  await page.keyboard.press('Enter');
  await view(page, 'tier1');
});

test('hero: with reduced motion the opening ends at once and the desk holds still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL);
  await page.waitForTimeout(300);
  const w = await page.locator('#hero-title').boundingBox();
  expect(w.width).toBeGreaterThan(500);
  const snap = () => page.$eval('#deskArt', (c) => c.toDataURL());
  const b = await snap(); await page.waitForTimeout(1200);
  expect(await snap()).toBe(b);
});

test('hero: without a canvas the words and the button still work', async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await page.goto(URL);
  await expect(page.locator('#hero')).toHaveAttribute('data-scene', 'flat');
  await settled(page);
  await page.locator('#btn-enter-arkhive').click();
  await view(page, 'tier1');
});

test('hero: on a phone the word, the button and the desk stay on screen and do not overlap', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL);
  await settled(page);
  const box = {};
  for (const sel of ['#hero-title', '#btn-enter-arkhive', '.desk']) {
    const b = box[sel] = await page.locator(sel).boundingBox();
    expect(b.x, sel).toBeGreaterThanOrEqual(0);
    expect(b.x + b.width, sel).toBeLessThanOrEqual(390);
    expect(b.y + b.height, sel).toBeLessThanOrEqual(844);
  }
  expect(box['#hero-title'].width / 390).toBeGreaterThan(0.8); // the word fills the phone, not a label-sized 50px
  const btn = box['#btn-enter-arkhive'], desk = box['.desk'];
  const apart = btn.y + btn.height <= desk.y || desk.y + desk.height <= btn.y || btn.x + btn.width <= desk.x || desk.x + desk.width <= btn.x;
  expect(apart).toBe(true);
});

// ---------- US2 real files: browser path ----------

test('files: with no folder chosen the vault says so and names no files', async ({ page }) => {
  await start(page, { folder: false });
  await expect(page.locator('#ctx')).toContainText('No folder chosen');
  await expect(page.locator('#ctx [data-pick]')).toBeVisible();
  await expect(page.locator('#count')).toHaveText(''); // said once, in the line above the shelf
  await expect(page.locator('#shelf1 .tape.is-active .sp .meta')).toHaveText('');
  expect(await page.evaluate(() => document.body.textContent)).not.toContain('CBC_Blood_Panel');
});

test('files: a chosen folder fills the PDF vault with exactly its PDFs, with a real count', async ({ page }) => {
  await start(page);
  await expect(page.locator('#cap1')).toContainText('9 files');
  await openVault(page);
  const names = await shelfItems(page, '#shelf2');
  expect(names.length).toBe(9);
  expect(names).toContain(CBC);
  for (const n of names) expect(n).toMatch(/\.pdf$/i);
});

test('files: search reads the text of text files in the chosen folder', async ({ page }) => {
  await start(page);
  await search(page, 'animation');
  await view(page, 'tier2');
  expect(await shelfItems(page, '#shelf2')).toContain('Meeting_Notes_Nov.md');
});

test('files: a refused folder is reported with its reason', async ({ page }) => {
  await start(page, { folder: false });
  await page.evaluate(() => { window.showDirectoryPicker = async () => { throw new Error('permission denied'); }; });
  await page.locator('#pickTop').click();
  await expect(toast(page)).toContainText('permission denied');
  await expect(page.locator('#count')).toHaveText('');
});

test('files: the folders vault drills down through the chosen folder', async ({ page }) => {
  await start(page);
  await activate(page, 'FOLDERS');
  await openVault(page);
  expect(await shelfItems(page, '#shelf2')).toContain('Documents');
  await activate(page, 'Documents');
  await page.keyboard.press('Enter');
  await expect(page.locator('#ctx')).toContainText('Documents');
  await activate(page, 'Medical');
  await page.keyboard.press('Enter');
  await expect.poll(() => shelfItems(page, '#shelf2')).toEqual(['Imaging', 'Labs', 'Prescription_Dr_Rao_Oct2026.pdf']);
  await page.locator('#ctx [data-crumb]', { hasText: 'Documents' }).last().click();
  await expect.poll(() => shelfItems(page, '#shelf2')).toContain('Inbox');
});

test('files: a real image shows its own picture on the pulled-out cover', async ({ page }) => {
  await start(page);
  await activate(page, 'JPEG');
  await openVault(page);
  await active(page, 'Real_Pixel.png');
  const img = page.locator('#shelf2 .tape.is-active .art img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0);
});

// ---------- US2 real files: desktop path ----------

test('desktop: each vault shows its real count and total size', async ({ page }) => {
  await startDesktop(page);
  await expect(page.locator('#shelf1 .tape.is-active .sp .meta')).toHaveText(/9 files/i);
  await expect(page.locator('#cap1')).toContainText('9 files');
  await expect(page.locator('#cap1')).toContainText(/\d MB/);
  const asked = await calls(page, 'vault_summary');
  expect(asked.length).toBe(1); // one request for every vault, not one each
});

test('desktop: the browser-only folder chooser is not offered', async ({ page }) => {
  await startDesktop(page);
  await expect(page.locator('#count')).toContainText(/^MAC FINDER: [\d,]+ FILES$/);
  await expect(page.locator('#pickTop')).toBeHidden();
  await expect(page.locator('#ctx [data-pick]')).toHaveCount(0);
});

test('desktop: a shelf that shows only part of a vault says so', async ({ page }) => {
  await startDesktop(page, { cap: 5 });
  await openVault(page);
  await expect(page.locator('#ctx')).toContainText('showing 5 of 9');
});

test('desktop: when counting fails the vaults say so, with the reason', async ({ page }) => {
  await startDesktop(page, { countFails: true });
  await expect(toast(page)).toContainText('indexing is off');
  await expect(page.locator('#shelf1 .tape.is-active .sp .meta')).toHaveText(/count failed/i);
  await expect(page.locator('#cap1')).not.toContainText(/\d+ files/);
});

test('desktop: the folders vault starts at Desktop, Documents, Downloads, Pictures and Movies', async ({ page }) => {
  await startDesktop(page);
  await activate(page, 'FOLDERS');
  await openVault(page);
  expect(await shelfItems(page, '#shelf2')).toEqual(['Desktop', 'Documents', 'Downloads', 'Movies', 'Pictures']);
});

test('desktop: the pulled-out cover and the inspector show the file\'s real preview', async ({ page }) => {
  await startDesktop(page);
  await openVault(page);
  const img = page.locator('#shelf2 .tape.is-active .art img');
  await expect(img).toBeVisible();
  await expect.poll(() => img.evaluate((el) => el.naturalWidth)).toBeGreaterThan(0);
  expect((await calls(page, 'thumbnail'))[0].path).toContain(CBC);
  await page.keyboard.press('Enter');
  await view(page, 'detail');
  await expect(page.locator('#d-art image')).toHaveCount(1);
});

// ---------- US3 pop-out search ----------

test('search: a 48px hairline until the wordmark, / or hover opens it', async ({ page }) => {
  await start(page);
  await expect(page.locator('#q')).toBeHidden();
  const line = await page.locator('#sbox').boundingBox();
  expect(line.height).toBeLessThanOrEqual(2);
  expect(Math.round(line.width)).toBe(48);
  await page.locator('#brand').click();
  await expect(page.locator('#q')).toBeFocused();
  await expect.poll(async () => (await page.locator('#sbox').boundingBox()).width).toBeGreaterThan(300);
  await expect(page.locator('#q')).toHaveAttribute('placeholder', /OCR/);
  await expect(page.locator('#micSearch')).toHaveAttribute('aria-label', /hey arkhive/i);
  await page.keyboard.press('Escape');
  await expect(page.locator('#sbox')).not.toHaveAttribute('data-open', /.*/);
  await page.keyboard.press('/');
  await expect(page.locator('#q')).toBeFocused();
  await page.keyboard.press('Escape');
  await page.mouse.move(10, 300);
  await page.locator('#sbox').hover();
  await expect(page.locator('#sbox')).toHaveAttribute('data-open', '');
});

test('search: an empty field folds back on an outside click; a field with text stays open', async ({ page }) => {
  await start(page);
  await page.locator('#brand').click();
  await page.mouse.click(640, 660);
  await expect(page.locator('#sbox')).not.toHaveAttribute('data-open', /.*/);
  await page.locator('#brand').click();
  await page.locator('#q').fill('invoice');
  await page.mouse.click(640, 660);
  await expect(page.locator('#sbox')).toHaveAttribute('data-open', '');
});

test('search: "blood related" finds files by their contents, including donor records', async ({ page }) => {
  await start(page);
  await search(page, 'find the file which has blood related');
  await view(page, 'tier2');
  const names = await shelfItems(page, '#shelf2');
  expect(names).toContain(CBC);
  expect(names).toContain('Blood_Pressure_And_Lipid_Log.xlsx');
  expect(names).not.toContain('Coorg_Morning_Hills.jpg');
});

test('search: a query that matches nothing shows the empty state', async ({ page }) => {
  await start(page);
  await search(page, 'zzqx');
  await view(page, 'tier2');
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#empty')).toContainText('No files match');
});

// ---------- 004 US2 SORT and FILE TYPES ----------

const label = (page, id) => page.locator(`#${id} .pill-label`);
const optTexts = (page, id) => page.$$eval(`#${id} [data-v]`, (bs) => bs.map((b) => b.querySelector('.o').textContent));

test('tools: SORT and FILE TYPES show on the vault shelf and on a file shelf, just above the shelf', async ({ page }) => {
  await start(page);
  for (const where of ['vault', 'files']) {
    if (where === 'files') await openVault(page);
    await expect(label(page, 'pillSort')).toBeVisible();
    await expect(label(page, 'pillFiles')).toBeVisible();
    const sort = await page.locator('#pillSort').boundingBox();
    const H = await page.$eval('#probe', (e) => e.getBoundingClientRect().height);
    expect(Math.abs(sort.y - (450 - H / 2 - 76))).toBeLessThan(3);
  }
  await expect(label(page, 'pillSort')).toHaveText('SORT · RELEVANCE');
  await expect(label(page, 'pillFiles')).toHaveText('FILE TYPES · ALL FILES');
});

test('tools: hover alone does not open SORT; a press unfolds the six orders; a choice reorders and folds', async ({ page }) => {
  await start(page);
  await openVault(page);
  const pill = page.locator('#pillSort');
  const closed = (await pill.boundingBox()).width;
  await pill.hover();
  await page.waitForTimeout(600);
  expect((await pill.boundingBox()).width).toBeLessThan(closed + 4);
  await label(page, 'pillSort').click();
  await expect(pill).toHaveAttribute('data-open', '');
  await expect(label(page, 'pillSort')).toHaveAttribute('aria-expanded', 'true');
  expect(await optTexts(page, 'pillSort')).toEqual(['RELEVANCE', 'NAME (A–Z)', 'NAME (Z–A)', 'DATE (NEWEST)', 'DATE (OLDEST)', 'SIZE (LARGEST)']);
  await expect.poll(async () => (await pill.boundingBox()).width).toBeGreaterThan(closed + 200);
  const under = async (v) => {
    const o = await page.locator(`#pillSort [data-v="${v}"]`).boundingBox(), m = await page.locator('#pillSort .ind').boundingBox();
    return Math.abs(o.x - m.x) + Math.abs(o.width - m.width);
  };
  await expect.poll(() => under('relevance')).toBeLessThan(2);
  await page.locator('#pillSort [data-v="nameDesc"]').click();
  await expect(label(page, 'pillSort')).toHaveText('SORT · NAME (Z–A)');
  await expect(pill).not.toHaveAttribute('data-open', '');
  await expect.poll(async () => (await pill.boundingBox()).width).toBeLessThan(closed + 60);
  const sorted = await shelfItems(page, '#shelf2');
  expect(sorted).toEqual([...sorted].sort((a, b) => b.localeCompare(a, 'en', { numeric: true, sensitivity: 'base' })));
});

test('tools: FILE TYPES lists every type with its count on this shelf, filters, and says when a type is empty', async ({ page }) => {
  await start(page);
  await search(page, 'blood');
  await view(page, 'tier2');
  await label(page, 'pillFiles').click();
  expect(await optTexts(page, 'pillFiles')).toEqual(['ALL FILES', 'PDF', 'PPTX', 'JPEG / PNG', 'DOCX / TXT', 'XLSX / CSV', 'CODE', 'FOLDERS']);
  const all = await shelfItems(page, '#shelf2');
  await expect(page.locator('#pillFiles [data-v="ALL"] .n')).toHaveText(String(all.length));
  const pdfCount = all.filter((n) => /\.pdf$/i.test(n)).length;
  await expect(page.locator('#pillFiles [data-v="PDF"] .n')).toHaveText(String(pdfCount));
  await page.locator('#pillFiles [data-v="PDF"]').click();
  await expect(label(page, 'pillFiles')).toHaveText('FILE TYPES · PDF');
  const pdfs = await shelfItems(page, '#shelf2');
  expect(pdfs.length).toBe(pdfCount);
  await label(page, 'pillFiles').click();
  await page.locator('#pillFiles [data-v="CODE"]').click();
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#empty')).toContainText('No CODE files here');
});

test('tools: on the vault shelf FILE TYPES opens that type, and SORT reorders the vaults', async ({ page }) => {
  await start(page);
  await label(page, 'pillFiles').click();
  await page.locator('#pillFiles [data-v="PDF"]').click();
  await view(page, 'tier2');
  for (const n of await shelfItems(page, '#shelf2')) expect(n).toMatch(/\.pdf$/i);
  await page.keyboard.press('Escape');
  await view(page, 'tier1');
  await expect(label(page, 'pillFiles')).toHaveText('FILE TYPES · ALL FILES');
  await label(page, 'pillSort').click();
  await page.locator('#pillSort [data-v="name"]').click();
  await expect(label(page, 'pillSort')).toHaveText('SORT · NAME (A–Z)');
  await expect.poll(() => shelfItems(page, '#shelf1')).toEqual(['ALL', 'ZIP', 'CODE', 'DESKTOP', 'DOCUMENTS', 'DOCX', 'DOWNLOADS', 'FOLDERS', 'JPEG', 'MEDIA', 'MEDICAL', 'PDF', 'PPTX', 'PROJECTS', 'RECENT', 'XLSX']);
});

test('tools: Escape or a press outside folds an open button; the open search field stays clear of them', async ({ page }) => {
  await start(page);
  await label(page, 'pillSort').click();
  await expect(page.locator('#pillSort')).toHaveAttribute('data-open', '');
  await page.keyboard.press('Escape');
  await expect(page.locator('#pillSort')).not.toHaveAttribute('data-open', '');
  await view(page, 'tier1');
  await label(page, 'pillFiles').click();
  await page.mouse.click(640, 780);
  await expect(page.locator('#pillFiles')).not.toHaveAttribute('data-open', '');
  await page.keyboard.press('/');
  await expect(page.locator('#q')).toBeFocused();
  await page.waitForTimeout(600);
  const field = await page.locator('#sbox').boundingBox(), sort = await page.locator('#pillSort').boundingBox();
  expect(sort.y).toBeGreaterThanOrEqual(field.y + field.height + 4); // the open field never covers them
});

test('tools: on a phone an open button stays inside the window', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page, { folder: false });
  await label(page, 'pillFiles').click();
  await expect(page.locator('#pillFiles')).toHaveAttribute('data-open', '');
  await page.waitForTimeout(600);
  const b = await page.locator('#pillFiles').boundingBox();
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(390);
  const brand = await page.locator('#brand').boundingBox(), line = await page.locator('#sbox').boundingBox();
  expect(Math.abs(brand.x + brand.width / 2 - (line.x + line.width / 2))).toBeLessThan(12);
});

// ---------- US5 open by click ----------

test('open: in the browser a click on the pulled-out file opens the inspector and says why it cannot launch it', async ({ page }) => {
  await start(page);
  await openVault(page);
  await clickActiveCover(page);
  await view(page, 'detail');
  await expect(toast(page)).toContainText('needs the desktop app');
});

// ---------- 005 US6 files open inside Arkhive ----------

const asset = (p) => 'asset://localhost/' + encodeURIComponent(p);
async function viewIn(page, vault, name, opts) {
  await startDesktop(page, opts);
  await activate(page, vault);
  await openVault(page);
  await activate(page, name);
  await clickActiveCover(page);
  await expect(page.locator('#viewer')).toBeVisible();
  await expect(page.locator('#viewer .v-name')).toHaveText(name);
}

test('view: a click on the pulled-out PDF shows it inside Arkhive; nothing opens in another app; Escape goes back', async ({ page }) => {
  await viewIn(page, 'PDF', CBC);
  await expect(page.locator('#viewer iframe')).toHaveAttribute('src', asset('/Fixture/Documents/Medical/Labs/' + CBC));
  expect(await calls(page, 'open_file')).toEqual([]);
  await page.keyboard.press('Escape');
  await expect(page.locator('#viewer')).toBeHidden();
  await view(page, 'tier2');
  await expect(page.locator('#viewer iframe')).toHaveCount(0); // nothing keeps playing or loading behind the shelf
});

test('view: a file named .pdf that is not a real PDF never reaches the PDF frame', async ({ page }) => {
  await viewIn(page, 'PDF', CBC, { fakePdf: true });
  await expect(page.locator('#viewer .v-msg')).toContainText('this is not a real PDF');
  await expect(page.locator('#viewer iframe')).toHaveCount(0);
});

test('view: an image shows straight from disk', async ({ page }) => {
  await viewIn(page, 'JPEG', 'Donor_Card_2025.png');
  await expect(page.locator('#viewer img')).toBeVisible();
  expect(await page.locator('#viewer img').evaluate((i) => i.naturalWidth)).toBeGreaterThan(0);
});

test('view: a picture that cannot be loaded says so instead of leaving the viewer blank', async ({ page }) => {
  await viewIn(page, 'JPEG', 'Coorg_Morning_Hills.jpg');
  await expect(page.locator('#viewer .v-msg')).toContainText('Coorg_Morning_Hills.jpg could not be loaded');
  await expect(page.locator('#viewer img')).toHaveCount(0);
});

test('view: after clicking into a document, moving the pointer out of it gives Escape back', async ({ page }) => {
  await viewIn(page, 'DOCX', 'Arterial_Blood_Gas_Notes.docx');
  const box = await page.locator('#viewer iframe').boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => page.evaluate(() => document.activeElement.tagName)).toBe('IFRAME');
  await page.mouse.move(box.x + box.width / 2, box.y - 30);
  await page.keyboard.press('Escape');
  await expect(page.locator('#viewer')).toBeHidden();
});

test('view: a Word file becomes a page in a sandboxed frame, with its pictures, and its scripts never run', async ({ page }) => {
  await viewIn(page, 'DOCX', 'Arterial_Blood_Gas_Notes.docx');
  const frame = page.locator('#viewer iframe');
  await expect(frame).toHaveAttribute('sandbox', '');
  await expect(page.frameLocator('#viewer iframe').locator('h1')).toHaveText('Arterial_Blood_Gas_Notes.docx');
  await expect(page.frameLocator('#viewer iframe').locator('img')).toHaveAttribute('src', asset('/Cache/previews/1/Arterial_Blood_Gas_Notes.docx.qlpreview/Attachment1.jpeg'));
  expect(await page.evaluate(() => window.__escaped)).toBeUndefined();
  expect((await calls(page, 'preview_doc')).map((c) => c.path.split('/').pop())).toEqual(['Arterial_Blood_Gas_Notes.docx']);
});

test('view: code is read and shown as text', async ({ page }) => {
  await viewIn(page, 'CODE', 'shelf_physics.rs');
  await expect(page.locator('#viewer pre')).toBeVisible();
  expect((await page.locator('#viewer pre').textContent()).length).toBeGreaterThan(0);
  expect((await calls(page, 'read_text')).length).toBe(1);
});

test('view: a file Arkhive cannot show says so and offers its default app as a choice', async ({ page }) => {
  await viewIn(page, 'ZIP', 'Project_Archive_UrbanIQ.zip');
  await expect(page.locator('#viewer .v-msg')).toContainText('Arkhive cannot show');
  expect(await calls(page, 'open_file')).toEqual([]);
  await page.locator('#viewer [data-vopen]').click();
  await expect.poll(async () => (await calls(page, 'open_file')).map((c) => c.path.split('/').pop())).toEqual(['Project_Archive_UrbanIQ.zip']);
});

test('view: a deck macOS cannot lay out shows its text and says why', async ({ page }) => {
  await viewIn(page, 'PPTX', 'Quarterly_Review_Q3.pptx', { previewText: true });
  await expect(page.locator('#viewer pre')).toHaveText('Big data analytics\nSlide two');
  await expect(page.locator('#viewer .v-note')).toContainText('macOS could not lay out this file');
});

test('view: a conversion that fails is reported with its reason', async ({ page }) => {
  await viewIn(page, 'PPTX', 'Quarterly_Review_Q3.pptx', { previewFails: true });
  await expect(page.locator('#viewer .v-msg')).toContainText('converter took longer than 20 s');
  await expect(page.locator('#viewer [data-vopen]')).toBeVisible();
});

test('view: VIEW IN ARKHIVE in the inspector opens the same viewer; closing returns to the inspector', async ({ page }) => {
  await inspectFirstPdf(page);
  await page.locator('.act[data-act="view"]').click();
  await expect(page.locator('#viewer iframe')).toBeVisible();
  await page.locator('#viewer .v-close').click();
  await expect(page.locator('#viewer')).toBeHidden();
  await expect(page.locator('body')).toHaveAttribute('data-view', 'detail');
});

test('open: Enter opens the inspector without launching the file', async ({ page }) => {
  await startDesktop(page);
  await openVault(page);
  await page.keyboard.press('Enter');
  await view(page, 'detail');
  expect(await calls(page, 'open_file')).toEqual([]);
});

test('open: a click on a pulled-out folder opens that folder; there is no play control', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('button', { name: /play/i })).toHaveCount(0);
  await expect(page.locator('#ring')).toHaveCount(0);
  await activate(page, 'FOLDERS');
  await openVault(page);
  await activate(page, 'Downloads');
  await clickActiveCover(page);
  await expect(page.locator('#ctx')).toContainText('Downloads');
  expect(await shelfItems(page, '#shelf2')).toContain('Scan_Nov_10.pdf');
});

// ---------- US6 manage a file ----------

async function inspectFirstPdf(page, opts) {
  await startDesktop(page, opts);
  await openVault(page);
  await page.keyboard.press('Enter');
  await view(page, 'detail');
  await expect(page.locator('#d-name')).toHaveText(CBC);
}

test('inspector: details, permissions, and a path whose folders open on the shelf', async ({ page }) => {
  await start(page);
  await openVault(page);
  await page.keyboard.press('Enter');
  await view(page, 'detail');
  await expect(page.locator('#d-badge')).toContainText(/pdf document/i);
  await expect(page.locator('#d-meta')).toContainText('rw-r--r--');
  await expect(page.locator('.act.primary')).toHaveText(['View in Arkhive']);
  await page.waitForTimeout(2200); // let the reveal finish (last line starts at ~1s, runs .9s)
  const vh = page.viewportSize().height;
  for (const b of await page.locator('.act').all()) {
    const r = await b.boundingBox();
    expect(r.y + r.height).toBeLessThanOrEqual(vh); // no action clipped off the bottom
  }
  expect(await page.locator('#d-art').textContent()).not.toContain('No text preview'); // said once, on the left
  await expect(page.locator('#d-path [data-dir]')).toHaveText(['Fixture', 'Documents', 'Medical', 'Labs']);
  await page.locator('#d-path [data-dir]', { hasText: 'Medical' }).click();
  await view(page, 'tier2');
  await expect(page.locator('#ctx')).toContainText('Medical');
  await expect.poll(() => shelfItems(page, '#shelf2')).toEqual(['Imaging', 'Labs', 'Prescription_Dr_Rao_Oct2026.pdf']);
});

test('inspector: in the browser, Rename and Move to Trash say they need the desktop app', async ({ page }) => {
  await start(page);
  await openVault(page);
  await page.keyboard.press('Enter');
  await view(page, 'detail');
  await page.locator('.act[data-act="rename"]').click();
  await expect(toast(page)).toContainText('needs the desktop app');
  await expect(page.locator('#renameInput')).toBeHidden();
  await page.locator('.act[data-act="trash"]').click();
  await expect(toast(page)).toContainText('needs the desktop app');
});

test('rename: the name becomes editable with its stem selected; Enter renames it everywhere', async ({ page }) => {
  await inspectFirstPdf(page);
  await page.locator('.act[data-act="rename"]').click();
  const input = page.locator('#renameInput');
  await expect(input).toBeFocused();
  await expect(input).toHaveValue(CBC);
  expect(await input.evaluate((el) => [el.selectionStart, el.selectionEnd])).toEqual([0, CBC.length - '.pdf'.length]);
  expect(await input.evaluate((el) => el.scrollLeft)).toBe(0); // the start of the name is in view, not scrolled away
  await input.fill('Blood_Panel_Final.pdf');
  await page.keyboard.press('Enter');
  await expect(page.locator('#d-name')).toHaveText('Blood_Panel_Final.pdf');
  expect(await calls(page, 'rename_file')).toEqual([{ path: '/Fixture/Documents/Medical/Labs/' + CBC, newName: 'Blood_Panel_Final.pdf' }]);
  await expect(toast(page)).toContainText('Renamed');
  await page.keyboard.press('Escape');
  await view(page, 'tier2');
  await active(page, 'Blood_Panel_Final.pdf');
  expect(await shelfItems(page, '#shelf2')).not.toContain(CBC);
});

test('rename: clicking the name starts it; Escape leaves the file and the inspector as they were', async ({ page }) => {
  await inspectFirstPdf(page);
  await page.locator('#d-name').click();
  await expect(page.locator('#renameInput')).toBeFocused();
  await page.locator('#renameInput').fill('Something_Else.pdf');
  await page.keyboard.press('Escape');
  await expect(page.locator('#renameInput')).toBeHidden();
  await expect(page.locator('#d-name')).toHaveText(CBC);
  await expect(page.locator('body')).toHaveAttribute('data-view', 'detail');
  expect(await calls(page, 'rename_file')).toEqual([]);
});

test('rename: a refused name is reported with the reason and nothing changes', async ({ page }) => {
  await inspectFirstPdf(page, { renameFails: true });
  await page.locator('.act[data-act="rename"]').click();
  await page.locator('#renameInput').fill('Scan_Nov_10.pdf');
  await page.keyboard.press('Enter');
  await expect(toast(page)).toContainText('already exists');
  await expect(page.locator('#d-name')).toHaveText(CBC);
});

test('trash: the first press only arms the button; the second moves the file and takes it off the shelf', async ({ page }) => {
  await inspectFirstPdf(page);
  const btn = page.locator('.act[data-act="trash"]');
  await expect(btn).toHaveText(/move to trash/i);
  await btn.click();
  await expect(btn).toHaveText(/press again/i);
  expect(await calls(page, 'trash_file')).toEqual([]);
  await btn.click();
  await expect.poll(() => calls(page, 'trash_file')).toEqual([{ path: '/Fixture/Documents/Medical/Labs/' + CBC }]);
  await view(page, 'tier2');
  await expect(toast(page)).toContainText(/trash/i);
  expect(await shelfItems(page, '#shelf2')).not.toContain(CBC);
  expect((await shelfItems(page, '#shelf2')).length).toBe(8);
});

test('trash: an armed button disarms by itself', async ({ page }) => {
  await inspectFirstPdf(page);
  const btn = page.locator('.act[data-act="trash"]');
  await btn.click();
  await expect(btn).toHaveText(/press again/i);
  await expect(btn).toHaveText(/move to trash/i, { timeout: 7000 });
  expect(await calls(page, 'trash_file')).toEqual([]);
});

// ---------- US7 carried over: voice, tray ----------

const stubSpeech = (page) => page.addInitScript(() => {
  window.SpeechRecognition = class {
    start() { window.__sr = this; }
    stop() { if (this.onend) this.onend(); }
  };
  window.__say = (text, final = true) => {
    const r = [{ transcript: text }];
    r.isFinal = final;
    window.__sr.onresult({ resultIndex: 0, results: [r] });
  };
});

test('voice: V toggles the mic; a phrase with no wake phrase does nothing', async ({ page }) => {
  await stubSpeech(page);
  await start(page);
  await page.keyboard.press('v');
  await expect(page.locator('body')).toHaveAttribute('data-mic', 'on');
  await page.evaluate(() => window.__say('the blood report is on the desk'));
  await expect(page.locator('#voiceText')).toContainText('the blood report');
  await page.waitForTimeout(400);
  await expect(page.locator('body')).toHaveAttribute('data-view', 'tier1');
  await page.keyboard.press('v');
  await expect(page.locator('body')).toHaveAttribute('data-mic', 'off');
});

test('voice: a wake phrase searches from the vault', async ({ page }) => {
  await stubSpeech(page);
  await start(page);
  await page.keyboard.press('v');
  await page.evaluate((s) => window.__say(s), BLOOD);
  await view(page, 'tier2');
  expect(await shelfItems(page, '#shelf2')).toContain(CBC);
  await expect(page.locator('#ctx')).toContainText('blood related');
});

test('voice: with no speech input the mic says so and the search field opens', async ({ page }) => {
  await page.addInitScript(() => {
    for (const k of ['SpeechRecognition', 'webkitSpeechRecognition']) Object.defineProperty(window, k, { value: undefined });
  });
  await start(page);
  await page.keyboard.press('v');
  await expect(toast(page)).toContainText(/voice search is unavailable/i);
  await expect(page.locator('#q')).toBeFocused();
});

test('voice: speech input that stops as soon as it starts is reported, not retried forever', async ({ page }) => {
  await page.addInitScript(() => {
    window.__starts = 0;
    window.SpeechRecognition = class {
      start() { window.__starts++; setTimeout(() => this.onend && this.onend(), 0); }
      stop() {}
    };
  });
  await start(page);
  await page.keyboard.press('v');
  await expect(toast(page)).toContainText(/voice search is unavailable/i);
  expect(await page.evaluate(() => window.__starts)).toBeLessThan(6);
});

const cards = (page) => page.locator('#trayList li');

test('tray: stages a file once, copies paths, and says which actions need the desktop app', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (t) => { window.__copied = t; } } });
  });
  await start(page);
  await openVault(page);
  await expect(page.locator('#tray')).not.toHaveClass(/on/);
  await page.locator('#plus').click();
  await expect(page.locator('#tray')).toHaveClass(/on/);
  await page.locator('#plus').click();
  await expect(cards(page)).toHaveCount(1);
  await expect(cards(page).first()).toContainText(CBC);
  await page.getByRole('button', { name: /copy paths/i }).click();
  expect(await page.evaluate(() => window.__copied)).toBe('/Fixture/Documents/Medical/Labs/' + CBC);
  await page.getByRole('button', { name: /^export to downloads/i }).click();
  await expect(toast(page)).toContainText(/needs the desktop app/i);
  await page.getByRole('button', { name: /clear tray/i }).click();
  await expect(cards(page)).toHaveCount(0);
  await expect(page.locator('#tray')).not.toHaveClass(/on/);
});

test('tray: dragging the pulled-out cover onto the tray stages it without opening it', async ({ page }) => {
  await start(page);
  await openVault(page);
  await page.waitForTimeout(900);
  const box = await page.locator('#shelf2 .tape.is-active .cv').boundingBox();
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 12, y + 12, { steps: 4 });
  await expect(page.locator('#tray')).toHaveClass(/on/); // a drag in progress opens the tray
  await page.waitForTimeout(700);
  const tray = await page.locator('#tray').boundingBox();
  await page.mouse.move(tray.x + tray.width / 2, tray.y + tray.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(cards(page)).toHaveCount(1);
  await expect(page.locator('body')).toHaveAttribute('data-view', 'tier2');
});

// ---------- 005 US9 motion review fixes ----------

// Records every Web Animations call: which element, how long, which curve, which properties.
const recordAnims = (page) => page.addInitScript(() => {
  window.__anims = [];
  const orig = Element.prototype.animate;
  Element.prototype.animate = function (k, o) {
    window.__anims.push({ id: this.id, cls: this.className && String(this.className), d: o && o.duration, e: o && o.easing, props: Object.keys((k && k[0]) || {}) });
    return orig.call(this, k, o);
  };
});
const sheetAnims = (page, id) => page.evaluate((id) => window.__anims.filter((a) => a.id === id).map((a) => [a.d, a.e]), id);

test('motion: every sheet opens in 450 ms and folds back in 300 ms on the drawer curve', async ({ page }) => {
  await recordAnims(page);
  await start(page);
  await search(page, 'blood');
  await view(page, 'tier2');
  await page.keyboard.press('Enter');
  await view(page, 'detail');
  await page.keyboard.press('Escape');
  await view(page, 'tier2');
  await page.keyboard.press('Escape');
  await view(page, 'tier1');
  await page.locator('#back').click();
  await view(page, 'landing');
  const D = 'cubic-bezier(.32, .72, 0, 1)';
  expect(await sheetAnims(page, 'vault')).toEqual([[450, D], [300, D]]);
  expect(await sheetAnims(page, 'tier2')).toEqual([[450, D], [300, D]]);
  expect(await sheetAnims(page, 'detail')).toEqual([[450, D], [300, D]]);
});

test('motion: the viewer opens in 450 ms and folds back in 300 ms', async ({ page }) => {
  await recordAnims(page);
  await viewIn(page, 'PDF', CBC);
  await page.keyboard.press('Escape');
  await expect(page.locator('#viewer')).toBeHidden();
  expect(await sheetAnims(page, 'viewer')).toEqual([[450, 'cubic-bezier(.32, .72, 0, 1)'], [300, 'cubic-bezier(.32, .72, 0, 1)']]);
});

test('motion: a caption rolls in 180 ms when the shelf steps; the inspector text reveals in 300 ms with 40 ms steps', async ({ page }) => {
  await recordAnims(page);
  await start(page);
  await page.evaluate(() => { window.__anims.length = 0; });
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => window.__anims.filter((a) => a.props.includes('transform') && !a.id).length)).toBeGreaterThan(0);
  const rolls = await page.evaluate(() => window.__anims.filter((a) => !a.id).map((a) => [a.d, a.e]));
  for (const r of rolls) expect(r).toEqual([180, 'cubic-bezier(.23, 1, .32, 1)']);
  const mi = await page.evaluate(() => ({
    d: getComputedStyle(document.querySelector('#d-name').closest('.mi') || document.querySelector('.d-left .mi')).transitionDuration,
    delays: [...document.querySelectorAll('.d-left .mi')].map((e) => parseFloat(e.style.getPropertyValue('--dl'))),
  }));
  expect(mi.d).toBe('0.3s');
  mi.delays.forEach((v, i) => { if (i) expect(Math.round((v - mi.delays[i - 1]) * 1000)).toBe(40); });
  expect(Math.max(...mi.delays)).toBeLessThanOrEqual(0.4);
});

test('motion: / opens the search field at once; the pointer opens it in 200 ms', async ({ page }) => {
  await start(page);
  await page.keyboard.press('/');
  expect((await page.locator('#sbox').boundingBox()).width).toBeGreaterThan(300); // no waiting
  await page.keyboard.press('Escape');
  await page.mouse.click(5, 890);
  await expect(page.locator('#sbox')).not.toHaveAttribute('data-open', /.*/);
  expect(await page.$eval('#sbox', (e) => getComputedStyle(e).transitionDuration)).toMatch(/^0\.2s/);
  expect(await page.$eval('.pill', (e) => getComputedStyle(e).transitionDuration)).toBe('0.22s');
});

test('motion: the SORT marker slides by transform only; the voice pill moves in 200 ms; the toast in 400 ms ease', async ({ page }) => {
  await start(page);
  const ind = await page.$eval('#pillSort .ind', (e) => ({ p: getComputedStyle(e).transitionProperty, d: getComputedStyle(e).transitionDuration, w: getComputedStyle(e).width }));
  expect(ind).toEqual({ p: 'transform', d: '0.2s', w: '1px' });
  expect(await page.$eval('#voicePill', (e) => getComputedStyle(e).transitionDuration)).toBe('0.2s');
  expect(await page.$eval('#toast', (e) => [getComputedStyle(e).transitionDuration, getComputedStyle(e).transitionTimingFunction])).toEqual(['0.4s', 'ease']);
});

test('motion: the ENTER ARKHIVE hover lift runs only for a fine pointer that can hover', async ({ page }) => {
  await page.goto(URL);
  const media = await page.evaluate(() => {
    const out = [];
    for (const sh of document.styleSheets) for (const r of sh.cssRules) {
      const inner = r.cssRules ? [...r.cssRules] : [r];
      for (const x of inner) if (x.selectorText && /#btn-enter-arkhive:hover/.test(x.selectorText)) out.push(r.media ? r.media.mediaText : '');
    }
    return out;
  });
  expect(media.length).toBeGreaterThan(0);
  for (const m of media) expect(m).toBe('(hover: hover) and (pointer: fine)');
  expect(await page.$eval('.bt-roll > span', (e) => getComputedStyle(e).transitionDuration)).toBe('0.25s');
});

test('motion: with reduced motion sheets fade in 200 ms and the shelf steps without sliding', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await recordAnims(page);
  await start(page);
  const v = await page.evaluate(() => window.__anims.filter((a) => a.id === 'vault').map((a) => [a.d, a.props.join()]));
  expect(v[0]).toEqual([200, 'opacity']);
  const x0 = await page.$eval('#shelf1 .tape.is-active', (e) => e.style.transform);
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(40);
  const a = await page.$eval('#shelf1 .tape.is-active', (e) => e.style.transform);
  await page.waitForTimeout(200);
  const b = await page.$eval('#shelf1 .tape.is-active', (e) => e.style.transform);
  expect(a).toBe(b); // already in place, nothing slides
  expect(a).toBe(x0); // the pulled-out slot sits where the last one sat
});

test('reduced motion: the whole flow still completes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await start(page);
  await search(page, 'blood');
  await view(page, 'tier2');
  await page.locator('#plus').click();
  await expect(page.locator('#tray')).toHaveClass(/on/);
  await page.keyboard.press('Enter');
  await view(page, 'detail');
});

// ---------- 004 US3 inspector and tray follow-ups ----------

const cardsIn = (page) => page.locator('#trayList li');
async function stageTwo(page) {
  await page.locator('#plus').click();
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(300);
  await page.locator('#plus').click();
  await expect(cardsIn(page)).toHaveCount(2);
}

test('snippet: a content match that came back without a snippet gets one when the shelf stops on it', async ({ page }) => {
  await startDesktop(page, { noSnippets: true });
  await search(page, 'blood');
  await view(page, 'tier2');
  await activate(page, 'Scan_Nov_10.pdf');
  await expect.poll(async () => (await calls(page, 'snippet')).map((c) => c.path)).toContain('/Fixture/Downloads/Scan_Nov_10.pdf');
  await expect(page.locator('#cap2')).toContainText('match');
  await expect(page.locator('#cap2 mark').first()).toBeVisible();
});

test('move: MOVE TO FOLDER moves the file into the chosen folder; cancelling the dialog changes nothing', async ({ page }) => {
  await inspectFirstPdf(page, { pick: { move: '/Fixture/Documents' } });
  await page.locator('.act[data-act="move"]').click();
  await expect(toast(page)).toContainText(`Moved ${CBC}`);
  expect(await calls(page, 'move_file')).toEqual([{ path: '/Fixture/Documents/Medical/Labs/' + CBC, dir: '/Fixture/Documents' }]);
  await expect(page.locator('#d-path')).not.toContainText('Labs');
});

test('move: a cancelled folder dialog moves nothing and says nothing', async ({ page }) => {
  await inspectFirstPdf(page);
  await page.locator('.act[data-act="move"]').click();
  await expect.poll(async () => (await calls(page, 'choose_folder')).length).toBe(1);
  await page.waitForTimeout(300);
  expect(await calls(page, 'move_file')).toEqual([]);
  await expect(toast(page)).not.toHaveClass(/on/);
});

test('rename: UNDO in the message gives the file its old name back', async ({ page }) => {
  await inspectFirstPdf(page);
  await page.locator('.act[data-act="rename"]').click();
  await page.locator('#renameInput').fill('Blood_2026.pdf');
  await page.keyboard.press('Enter');
  await expect(page.locator('#d-name')).toHaveText('Blood_2026.pdf');
  await toast(page).getByRole('button', { name: 'UNDO' }).click();
  await expect(page.locator('#d-name')).toHaveText(CBC);
  const r = await calls(page, 'rename_file');
  expect(r[1]).toEqual({ path: '/Fixture/Documents/Medical/Labs/Blood_2026.pdf', newName: CBC });
});

test('tray: a card\'s remove button takes out only that card', async ({ page }) => {
  await startDesktop(page);
  await openVault(page);
  await stageTwo(page);
  const second = await cardsIn(page).nth(1).locator('b').textContent();
  await cardsIn(page).first().getByRole('button', { name: /^remove/i }).click();
  await expect(cardsIn(page)).toHaveCount(1);
  await expect(cardsIn(page).first()).toContainText(second);
});

test('tray: RENAME ALL numbers the staged files in tray order and skips names already taken', async ({ page }) => {
  await startDesktop(page, { taken: ['Lab 1.pdf'] });
  await openVault(page);
  await stageTwo(page);
  await page.getByRole('button', { name: 'RENAME ALL' }).click();
  await page.locator('#batchName').fill('Lab');
  await page.keyboard.press('Enter');
  await expect(toast(page)).toContainText('Renamed 2 files');
  const names = (await calls(page, 'rename_file')).map((c) => c.newName);
  expect(names).toEqual(['Lab 1.pdf', 'Lab 2.pdf', 'Lab 3.pdf']);
  await expect(cardsIn(page).first()).toContainText('Lab 2.pdf');
  await expect(cardsIn(page).nth(1)).toContainText('Lab 3.pdf');
});

test('tray: MOVE ALL TO TRASH needs a second press, then trashes every staged file', async ({ page }) => {
  await startDesktop(page);
  await openVault(page);
  await stageTwo(page);
  const btn = page.locator('[data-tray="trashAll"]');
  await btn.click();
  await expect(btn).toHaveText(/press again/i);
  expect(await calls(page, 'trash_file')).toEqual([]);
  await btn.click();
  await expect(toast(page)).toContainText('Moved 2 files to the Trash');
  expect((await calls(page, 'trash_file')).length).toBe(2);
  await expect(cardsIn(page)).toHaveCount(0);
});

test('tray: EXPORT TO… copies into a new folder inside the chosen folder', async ({ page }) => {
  await startDesktop(page, { pick: { export: '/Users/test/Desktop' } });
  await openVault(page);
  await page.locator('#plus').click();
  await page.locator('[data-tray="exportTo"]').click();
  await expect(toast(page)).toContainText('~/Desktop/Arkhive Export');
  expect((await calls(page, 'export_files'))[0].dest).toBe('/Users/test/Desktop');
});

// ---------- 004 US4 access, live counts, native speech ----------

test('access: the vault names the folders macOS blocks and opens the Full Disk Access setting', async ({ page }) => {
  await installDesktop(page, { access: { folders: [{ name: 'Desktop', readable: true }, { name: 'Documents', readable: false }, { name: 'Downloads', readable: true }], full_disk: false } });
  await page.goto(URL);
  await page.locator('#btn-enter-arkhive').click();
  await view(page, 'tier1');
  await expect(page.locator('#ctx')).toContainText('macOS blocks Documents');
  await expect(page.locator('#ctx')).toContainText('then reopen Arkhive'); // the index reads folders when it starts
  await page.locator('#ctx [data-privacy]').click();
  await expect.poll(async () => (await calls(page, 'open_privacy_settings')).length).toBe(1);
});

test('access: with every folder readable and Full Disk Access on, nothing asks for settings', async ({ page }) => {
  await installDesktop(page);
  await page.goto(URL);
  await page.locator('#btn-enter-arkhive').click();
  await view(page, 'tier1');
  await expect(page.locator('#ctx [data-privacy]')).toHaveCount(0);
});

test('live: when the window comes back into focus the vaults are counted again', async ({ page }) => {
  await startDesktop(page);
  await expect.poll(async () => (await calls(page, 'vault_summary')).length).toBe(1);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await expect.poll(async () => (await calls(page, 'vault_summary')).length).toBe(2);
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await page.waitForTimeout(300);
  expect((await calls(page, 'vault_summary')).length).toBe(2); // not more than once every few seconds
});

test('voice: in the desktop app the mic uses macOS speech recognition', async ({ page }) => {
  await startDesktop(page);
  await page.keyboard.press('v');
  await expect(page.locator('body')).toHaveAttribute('data-mic', 'on');
  await expect.poll(async () => (await calls(page, 'speech_start')).length).toBe(1);
  await page.evaluate(() => window.__emit('speech', { t: 'partial', text: 'hey arkhive find the file which has blood' }));
  await expect(page.locator('#voiceText')).toContainText('hey arkhive find the file');
  await page.evaluate((s) => window.__emit('speech', { t: 'final', text: s }), BLOOD);
  await view(page, 'tier2');
  expect(await shelfItems(page, '#shelf2')).toContain(CBC);
  // a phrase ends the helper; it starts again while the mic stays on
  await page.evaluate(() => window.__emit('speech', { t: 'end', text: '' }));
  await expect.poll(async () => (await calls(page, 'speech_start')).length).toBe(2);
  await page.keyboard.press('v');
  await expect(page.locator('body')).toHaveAttribute('data-mic', 'off');
  await expect.poll(async () => (await calls(page, 'speech_stop')).length).toBeGreaterThan(0);
});

test('voice: a refused permission from macOS speech is reported by name', async ({ page }) => {
  await startDesktop(page);
  await page.keyboard.press('v');
  await expect.poll(async () => (await calls(page, 'speech_start')).length).toBe(1);
  await page.evaluate(() => window.__emit('speech', { t: 'error', text: 'speech recognition was refused in System Settings' }));
  await expect(toast(page)).toContainText('speech recognition was refused in System Settings');
  await expect(page.locator('body')).toHaveAttribute('data-mic', 'off');
});

test('voice: without the native helper the mic falls back to the window\'s speech input', async ({ page }) => {
  await stubSpeech(page);
  await startDesktop(page, { noNativeSpeech: true });
  await page.keyboard.press('v');
  await expect(page.locator('body')).toHaveAttribute('data-mic', 'on');
  await page.evaluate((s) => window.__say(s), BLOOD);
  await view(page, 'tier2');
});

// ---------- 004 US5 iPhone folders ----------

test('iphone: ADD FOLDER picks a folder in Files, then Arkhive counts again; on a Mac it is not offered', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, 'userAgent', { get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15' }));
  await startDesktop(page, { iosPick: '/private/var/mobile/Library/Mobile Documents/Lab Reports' });
  await expect(page.locator('#pickTop')).toHaveText('ADD FOLDER');
  await expect.poll(async () => (await calls(page, 'vault_summary')).length).toBe(1);
  await page.locator('#pickTop').click();
  await expect(toast(page)).toContainText('Added Lab Reports');
  await expect.poll(async () => (await calls(page, 'vault_summary')).length).toBe(2);
});

// ---------- 005 US3 vault chrome ----------

test('chrome: the back button reads ← HOME on the vault shelf and the top bar counts the index', async ({ page }) => {
  await startDesktop(page, { indexed: 52311 });
  await expect(page.locator('#backLbl')).toHaveText('← HOME');
  await expect(page.locator('#count')).toHaveText('MAC FINDER: 52,311 FILES');
  await expect(page.locator('#micBadge')).toHaveText('MIC OFF');
  await page.keyboard.press('v');
  await expect(page.locator('#micBadge')).toHaveText('MIC ON');
});

test('chrome: when the index reports changes, counts and vaults are read again', async ({ page }) => {
  await startDesktop(page);
  await expect.poll(async () => (await calls(page, 'vault_summary')).length).toBe(1);
  await page.evaluate(() => window.__emit('fs-index-updated', [10, 0]));
  await expect.poll(async () => (await calls(page, 'vault_summary')).length).toBe(2);
});

test('vaults: DESKTOP, DOCUMENTS and DOWNLOADS open those folders', async ({ page }) => {
  await startDesktop(page);
  await activate(page, 'DOCUMENTS');
  await openVault(page);
  await expect(page.locator('#ctx')).toContainText('Documents');
  expect(await calls(page, 'list_dir')).toContainEqual({ path: '/Fixture/Documents' });
});

test('vaults: a shelf of 2,000 files shows all of them while drawing only the boxes near the pulled-out one', async ({ page }) => {
  await startDesktop(page, { many: 2000 });
  await openVault(page);
  await expect(page.locator('#ctx')).toContainText('2,000 files');
  await expect(page.locator('#ctx')).not.toContainText('showing');
  expect(await page.locator('#shelf2 .tape').count()).toBeLessThanOrEqual(48);
  await active(page, 'Report_1999.pdf');
  await page.keyboard.press('ArrowLeft'); // wraps round to the oldest
  await active(page, 'Report_0000.pdf');
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowLeft');
  await active(page, 'Report_0005.pdf');
  await expect(page.locator('#shelf2 .tape.is-active')).toHaveCount(1);
  await expect(page.locator('#shelf2 .tape.is-active')).toHaveAttribute('data-name', 'Report_0005.pdf');
});

// ---------- labels: bold uppercase, boxed buttons, no brackets ----------

test('labels: every chrome label is bold uppercase, no label shows a bracket, and a toast never covers the file actions', async ({ page }) => {
  await start(page);
  await openVault(page);
  await expect(page.locator('#acts')).toBeVisible();
  await expect(toast(page)).toHaveClass(/on/); // the "Read 43 files" note is still up
  const bad = await page.$$eval('#chrome .lbl, #chrome button.box, .pill-label', (els) => els.filter((el) => {
    const cs = getComputedStyle(el), t = el.textContent.trim();
    return t && (t !== t.toUpperCase() && cs.textTransform !== 'uppercase' || Number(cs.fontWeight) < 600);
  }).map((el) => el.id || el.className + ': ' + el.textContent.trim()));
  expect(bad).toEqual([]);
  const text = await page.evaluate(() => document.body.innerText);
  expect(text).not.toContain('//');
  await expect(page.locator('#backLbl')).toHaveText('← ALL VAULTS');
  const bracketed = await page.$$eval('button, .lbl, .pill-label', (els) => els.map((e) => e.textContent.trim()).filter((t) => /[\[\]]/.test(t)));
  expect(bracketed).toEqual([]);
  await page.waitForTimeout(600); // the toast has finished sliding in
  const t = await toast(page).boundingBox();
  for (const btn of await page.locator('#acts button').all()) {
    const a = await btn.boundingBox();
    const overlap = a.x < t.x + t.width && t.x < a.x + a.width && a.y < t.y + t.height && t.y < a.y + a.height;
    expect(overlap).toBe(false);
  }
});
