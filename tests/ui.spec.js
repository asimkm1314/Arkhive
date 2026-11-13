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
    const handlers = {
      search_files: (q) => match(q).slice(0, opts.cap || 300),
      vault_summary: ({ queries }) => {
        if (opts.countFails) throw 'spotlight failed: indexing is off';
        return queries.map((q) => { const l = match(q); return { count: l.length, bytes: l.reduce((n, f) => n + f.size, 0), newest: l.reduce((a, f) => (!a || f.modified > a.modified ? f : a), null) }; });
      },
      list_dir: ({ path }) => {
        const entries = path == null ? ['Desktop', 'Documents', 'Downloads', 'Pictures'].map(dir) : C().listChildren(all().filter((f) => !gone.has(f.path)), path).map(send);
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
    window.__TAURI__ = {
      core: { invoke: async (cmd, args) => { window.__calls.push([cmd, args]); if (!handlers[cmd]) throw `unknown command ${cmd}`; return handlers[cmd](args || {}); } },
      event: { listen: async () => () => {} },
    };
  }, { opts, png: PIXEL_PNG });
}

async function enterVault(page) {
  await page.goto(URL);
  await page.locator('#enterBtn').click();
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
  await expect(page.locator('#hero h1')).toHaveText('ARKHIVE');
  await expect(page.locator('#cursor > i')).toHaveCount(2);
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  expect(html).not.toMatch(/[぀-ヿ㐀-鿿豈-﫿]/);
  expect(html).not.toContain('Noto');
});

// ---------- 004 US1 workspace start screen ----------

const PALETTE = ['#EDE6DA', '#F5EFE6', '#D8CFC0', '#261A14', '#5C463B', '#8A7367', '#234434', '#3A634C', '#B89658'];
// Every distinct colour on a canvas (the scene is drawn without smoothing, so only palette colours appear).
const canvasColours = (page, sel) => page.$eval(sel, (c) => {
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data, out = new Set();
  for (let i = 0; i < d.length; i += 4) if (d[i + 3]) out.add('#' + [d[i], d[i + 1], d[i + 2]].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase());
  return [...out];
});

test('start: title, subtitle, ENTER ARKHIVE, DETAILS, and the laptop with the notebook bottom-right, all in the palette', async ({ page }) => {
  await page.goto(URL);
  await view(page, 'landing');
  await expect(page.locator('#hero h1')).toHaveText('ARKHIVE');
  await expect(page.locator('#hero .hero-sub')).toHaveText('Every file on your Mac, indexed inside and out across PDF, PPTX, JPEG and folders.');
  await expect(page.locator('#enterBtn')).toHaveText('ENTER ARKHIVE');
  await expect(page.locator('#detailsBtn')).toHaveText('DETAILS');
  const enter = await page.locator('#enterBtn').boundingBox(), details = await page.locator('#detailsBtn').boundingBox();
  expect(details.y).toBeGreaterThan(enter.y + enter.height);
  expect(Math.abs(enter.x + enter.width / 2 - 720)).toBeLessThan(4);
  const desk = await page.locator('#desk').boundingBox();
  expect(desk.x).toBeGreaterThan(720);
  expect(desk.y + desk.height).toBeGreaterThan(600);
  expect(desk.x + desk.width).toBeLessThanOrEqual(1440);
  for (const sel of ['#scene', '#deskArt']) {
    const colours = await canvasColours(page, sel);
    expect(colours.length).toBeGreaterThan(4);
    expect(colours.filter((c) => !PALETTE.includes(c))).toEqual([]);
  }
});

test('start: ENTER ARKHIVE, the laptop, the notebook and the Enter key each open the vault', async ({ page }) => {
  const ways = {
    button: () => page.locator('#enterBtn').click(),
    laptop: async () => { const b = await page.locator('#desk').boundingBox(); await page.mouse.click(b.x + b.width * 0.3, b.y + b.height * 0.45); },
    notebook: async () => { const b = await page.locator('#desk').boundingBox(); await page.mouse.click(b.x + b.width * 0.86, b.y + b.height * 0.75); },
    key: () => page.keyboard.press('Enter'),
  };
  for (const [name, act] of Object.entries(ways)) {
    await page.goto(URL);
    await view(page, 'landing');
    await act();
    await view(page, 'tier1');
    await expect(page.locator('#vault'), name).toBeVisible();
  }
});

test('start: the vault grows out of the laptop screen, tilted -3.5 degrees, and folds back into it', async ({ page }) => {
  await page.goto(URL);
  await view(page, 'landing');
  const screen = await page.evaluate(() => window.ArkhiveLanding.screenRect());
  await page.locator('#enterBtn').click();
  const first = await page.evaluate(() => document.querySelector('#vault').getAnimations()[0].effect.getKeyframes()[0]);
  expect(first.transform).toBe('rotate(-3.5deg)');
  const [top, right, bottom, left] = first.clipPath.match(/[\d.]+px/g).map(parseFloat);
  expect(Math.abs(top - screen.top)).toBeLessThan(2);
  expect(Math.abs(left - screen.left)).toBeLessThan(2);
  expect(Math.abs(1440 - right - screen.right)).toBeLessThan(2);
  expect(Math.abs(900 - bottom - screen.bottom)).toBeLessThan(2);
  await view(page, 'tier1');
  await page.locator('#back').click();
  await view(page, 'landing');
  await expect(page.locator('#vault')).toBeHidden();
});

test('start: DETAILS unfolds live facts under the button and folds again', async ({ page }) => {
  await installDesktop(page);
  await page.goto(URL);
  const panel = page.locator('#details');
  await expect(panel).toBeHidden();
  await page.locator('#detailsBtn').click();
  await expect(page.locator('#detailsBtn')).toHaveAttribute('aria-expanded', 'true');
  await expect(panel).toBeVisible();
  const all = await page.evaluate(() => window.ArchiveFixture.FILES.filter((f) => f.kind === 'file' && window.ArchiveCore.CATEGORIES[0].exts.includes(f.ext)).length);
  await expect(page.locator('#dFiles')).toContainText(all.toLocaleString('en-US'));
  await expect(page.locator('#dReads')).toContainText('PDF');
  await expect(page.locator('#dTry')).toContainText('blood related');
  const btn = await page.locator('#detailsBtn').boundingBox(), box = await panel.boundingBox();
  expect(box.y).toBeGreaterThanOrEqual(btn.y + btn.height);
  await page.locator('#detailsBtn').click();
  await expect(panel).toBeHidden();
  await expect(page.locator('#detailsBtn')).toHaveAttribute('aria-expanded', 'false');
});

test('start: in the browser DETAILS says no folder is chosen and offers to choose one', async ({ page }) => {
  await installFolder(page);
  await page.goto(URL);
  await page.locator('#detailsBtn').click();
  await expect(page.locator('#dFiles')).toContainText('No folder chosen');
  await page.locator('#details [data-pick]').click();
  await expect(page.locator('#dFiles')).toContainText('Fixture', { timeout: 8000 });
});

test('start: the example search in DETAILS enters the vault and runs it', async ({ page }) => {
  await installDesktop(page);
  await page.goto(URL);
  await page.locator('#detailsBtn').click();
  await page.locator('#dTry button').click();
  await view(page, 'tier2');
  expect(await shelfItems(page, '#shelf2')).toContain(CBC);
});

test('start: clouds drift, and with reduced motion the scene holds still', async ({ page }) => {
  const snap = () => page.$eval('#scene', (c) => c.toDataURL());
  await page.goto(URL);
  await view(page, 'landing');
  const a = await snap(); await page.waitForTimeout(1500);
  expect(await snap()).not.toBe(a);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL);
  await view(page, 'landing');
  const b = await snap(); await page.waitForTimeout(1500);
  expect(await snap()).toBe(b);
});

test('start: without a canvas the words and buttons still work on a flat ground', async ({ page }) => {
  await page.addInitScript(() => { HTMLCanvasElement.prototype.getContext = () => null; });
  await page.goto(URL);
  await expect(page.locator('#hero')).toHaveAttribute('data-scene', 'flat');
  await expect(page.locator('#enterBtn')).toBeVisible();
  await page.locator('#enterBtn').click();
  await view(page, 'tier1');
});

test('start: on a phone the laptop sits under the buttons and nothing overlaps', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(URL);
  await view(page, 'landing');
  const details = await page.locator('#detailsBtn').boundingBox(), desk = await page.locator('#desk').boundingBox();
  expect(desk.y).toBeGreaterThanOrEqual(details.y + details.height);
  expect(desk.x).toBeGreaterThanOrEqual(0);
  expect(desk.x + desk.width).toBeLessThanOrEqual(390);
  expect(desk.y + desk.height).toBeLessThanOrEqual(844);
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
  await page.locator('#back').click();
  await view(page, 'landing');
  await page.locator('#detailsBtn').click();
  await expect(page.locator('#dFiles')).toContainText(/\d+ documents, images and code files found by Spotlight/);
});

test('desktop: the browser-only folder chooser is not offered', async ({ page }) => {
  await startDesktop(page);
  await expect(page.locator('#count')).toContainText(/spotlight/i);
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

test('desktop: the folders vault starts at Desktop, Documents, Downloads and Pictures', async ({ page }) => {
  await startDesktop(page);
  await activate(page, 'FOLDERS');
  await openVault(page);
  expect(await shelfItems(page, '#shelf2')).toEqual(['Desktop', 'Documents', 'Downloads', 'Pictures']);
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

test('tools: SORT and FILE TYPES show on the vault shelf and on a file shelf, right under the wordmark', async ({ page }) => {
  await start(page);
  for (const where of ['vault', 'files']) {
    if (where === 'files') await openVault(page);
    await expect(label(page, 'pillSort')).toBeVisible();
    await expect(label(page, 'pillFiles')).toBeVisible();
    const line = await page.locator('#sbox').boundingBox(), sort = await page.locator('#pillSort').boundingBox();
    expect(sort.y).toBeGreaterThan(line.y);
    expect(sort.y - line.y).toBeLessThan(40);
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
  await expect.poll(() => shelfItems(page, '#shelf1')).toEqual(['ALL', 'ZIP', 'CODE', 'DOCX', 'FOLDERS', 'JPEG', 'MEDIA', 'MEDICAL', 'PDF', 'PPTX', 'PROJECTS', 'RECENT', 'XLSX']);
});

test('tools: Escape or a press outside folds an open button; the open search field pushes both down', async ({ page }) => {
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
  expect(sort.y).toBeGreaterThanOrEqual(field.y + field.height + 4);
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

test('open: in the desktop app the same click opens the file and the inspector', async ({ page }) => {
  await startDesktop(page);
  await openVault(page);
  await clickActiveCover(page);
  await view(page, 'detail');
  await expect.poll(() => calls(page, 'open_file')).toEqual([{ path: '/Fixture/Documents/Medical/Labs/' + CBC }]);
  await expect(page.locator('#d-name')).toHaveText(CBC);
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
  await expect(page.locator('.act.primary')).toHaveText(['Open in default app']);
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

// ---------- labels: bold uppercase, boxed buttons, no brackets ----------

test('labels: every chrome label is bold uppercase with no brackets, and a toast never covers the file actions', async ({ page }) => {
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
  expect(text).not.toMatch(/[\[\]]/);
  await page.waitForTimeout(600); // the toast has finished sliding in
  const t = await toast(page).boundingBox();
  for (const btn of await page.locator('#acts button').all()) {
    const a = await btn.boundingBox();
    const overlap = a.x < t.x + t.width && t.x < a.x + a.width && a.y < t.y + t.height && t.y < a.y + a.height;
    expect(overlap).toBe(false);
  }
});
