// Acceptance flows from specs/003-arkhive-prism/spec.md, run against app/index.html from file://.
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

const THREE = path.resolve(__dirname, '../app/vendor/three.module.min.js');
// The page opened from file:// asks the CDN for the pinned library; answer from the vendored copy so tests run offline.
test.beforeEach(async ({ page }) => {
  await page.route('**/three.module.min.js', (route) => route.fulfill({ path: THREE, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' } }));
});

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
    const send = ({ text, ...rec }) => rec; // the real backend never sends a file's whole text
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
    };
    window.__TAURI__ = {
      core: { invoke: async (cmd, args) => { window.__calls.push([cmd, args]); if (!handlers[cmd]) throw `unknown command ${cmd}`; return handlers[cmd](args || {}); } },
      event: { listen: async () => () => {} },
    };
  }, { opts, png: PIXEL_PNG });
}

async function enterVault(page) {
  await page.goto(URL);
  await page.locator('#archiveLink').click();
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
  await expect(page.locator('.hero-brand')).toHaveText('ARKHIVE');
  await expect(page.locator('#cursor > i')).toHaveCount(2);
  const html = await page.evaluate(() => document.documentElement.outerHTML);
  expect(html).not.toMatch(/[぀-ヿ㐀-鿿豈-﫿]/);
  expect(html).not.toContain('Noto');
});

// ---------- US1 hero ----------

test('hero: navigation bar, first stage, six cards and a drawn ring', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('#storyBack')).toBeVisible();
  await expect(page.locator('.hero-brand .mark')).toBeVisible();
  await expect(page.locator('.nav-links button')).toHaveText(['Presets', 'How it works', 'Archive']);
  await expect(page.locator('#stageTitle .on')).toHaveText('Raw capture');
  await expect(page.locator('#stageNext')).toHaveText('Optical grading');
  await expect(page.locator('.prism-card')).toHaveCount(6);
  await expect(page.locator('#hero')).toHaveAttribute('data-ring', 'webgl', { timeout: 10000 });
  await expect(page.locator('#prism')).toBeVisible();
});

test('hero: scrolling steps the story, and the cue names the next stage', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('#hero')).toHaveAttribute('data-ring', /webgl|flat/, { timeout: 10000 });
  await wheel(page, 700);
  await expect(page.locator('#hero')).toHaveAttribute('data-stage', '1');
  await expect(page.locator('#stageTitle .on')).toHaveText('Optical grading');
  await expect(page.locator('#stageNext')).toHaveText('Finished artwork');
  await wheel(page, 700);
  await expect(page.locator('#stageTitle .on')).toHaveText('Finished artwork');
  await expect(page.locator('#stageNext')).toHaveText('Now');
});

test('hero: "How it works" moves the story on; the back button moves it back and rests at the start', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('#storyBack')).toBeDisabled();
  await page.locator('#navHow').click();
  await expect(page.locator('#hero')).toHaveAttribute('data-stage', '1');
  await expect(page.locator('#storyBack')).toBeEnabled();
  await page.locator('#storyBack').click();
  await expect(page.locator('#hero')).toHaveAttribute('data-stage', '0');
  await expect(page.locator('#storyBack')).toBeDisabled();
});

test('hero: quick presses of "How it works" add up, ending on "Now" with the archive as the cue', async ({ page }) => {
  await page.goto(URL);
  for (let i = 0; i < 3; i++) await page.locator('#navHow').click();
  await expect(page.locator('#hero')).toHaveAttribute('data-stage', '3');
  await expect(page.locator('#stageTitle .on')).toHaveText('Now');
  await expect(page.locator('#stageNext')).toHaveText('Archive');
});

test('hero: scrolling past "Now" opens the vault', async ({ page }) => {
  await page.goto(URL);
  for (let i = 0; i < 24 && (await page.locator('body').getAttribute('data-view')) === 'landing'; i++) {
    await wheel(page, 500);
    await page.waitForTimeout(120);
  }
  await view(page, 'tier1');
});

test('hero: resting on a card stops the ring, and clicking it opens that vault', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('#hero')).toHaveAttribute('data-ring', 'webgl', { timeout: 10000 });
  await page.waitForTimeout(400);
  // a card that is wholly on screen and clear of the navigation bar
  const pick = await page.$$eval('.prism-card', (els) => {
    const el = els.find((e) => { const b = e.getBoundingClientRect(); return b.width > 40 && b.left > 20 && b.right < innerWidth - 20 && b.top > 90 && b.bottom < innerHeight - 20; });
    const b = el.getBoundingClientRect();
    return { key: el.dataset.key, x: b.left + b.width / 2, y: b.top + b.height / 2 };
  });
  await page.mouse.move(pick.x, pick.y);
  await page.waitForTimeout(500);
  const rect = () => page.locator(`.prism-card[data-key="${pick.key}"]`).boundingBox();
  const a = await rect();
  await page.waitForTimeout(400);
  const b = await rect();
  expect(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)).toBeLessThan(1.5); // hovering holds the ring still
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await view(page, 'tier1');
  await active(page, pick.key);
});

test('hero: Presets opens the vault on the smart group', async ({ page }) => {
  await page.goto(URL);
  await page.locator('#navPresets').click();
  await view(page, 'tier1');
  await expect.poll(() => shelfItems(page, '#shelf1')).toEqual(['MEDICAL', 'PROJECTS']);
  await expect(page.locator('#pillFiles .pill-label')).toHaveText('FILES · SMART');
});

test('hero: without the 3D library the six cards are shown flat, painted, and still open the vault', async ({ page }) => {
  await page.route('**/three.module.min.js', (route) => route.abort());
  await page.goto(URL);
  await expect(page.locator('#hero')).toHaveAttribute('data-ring', 'flat', { timeout: 10000 });
  await expect(page.locator('.prism-card:visible')).toHaveCount(6);
  await expect(page.locator('#heroHint')).toContainText(/flat/i);
  const painted = await page.$$eval('.prism-card canvas', (cs) => cs.filter((c) => c.width > 100 && c.getBoundingClientRect().width > 40).length);
  expect(painted).toBe(6);
  await page.locator('.prism-card[data-key="FOLDERS"]').click();
  await view(page, 'tier1');
  await active(page, 'FOLDERS');
});

test('hero: with reduced motion the ring holds still', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto(URL);
  await expect(page.locator('#hero')).toHaveAttribute('data-ring', 'webgl', { timeout: 10000 });
  const rect = () => page.locator('.prism-card[data-key="PDF"]').evaluate((el) => { const b = el.getBoundingClientRect(); return [b.left, b.top]; });
  const a = await rect();
  await page.waitForTimeout(700);
  expect(await rect()).toEqual(a);
});

test('hero: the ring draws at a steady rate in headless Chrome (median frame under 50 ms)', async ({ page }) => {
  await page.goto(URL);
  await expect(page.locator('#hero')).toHaveAttribute('data-ring', 'webgl', { timeout: 10000 });
  const median = await page.evaluate(() => new Promise((resolve) => {
    const gaps = []; let last = performance.now(), n = 0;
    const step = (t) => { gaps.push(t - last); last = t; if (++n < 120) requestAnimationFrame(step); else { gaps.sort((a, b) => a - b); resolve(gaps[gaps.length >> 1]); } };
    requestAnimationFrame(step);
  }));
  console.log(`median frame interval: ${median.toFixed(1)} ms`);
  expect(median).toBeLessThan(50);
});

// ---------- US2 real files: browser path ----------

test('files: with no folder chosen the vault says so and names no files', async ({ page }) => {
  await start(page, { folder: false });
  await expect(page.locator('#ctx')).toContainText('No folder chosen');
  await expect(page.locator('#ctx [data-pick]')).toBeVisible();
  await expect(page.locator('#count')).toContainText(/no folder chosen/i);
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
  await expect(page.locator('#count')).toContainText(/no folder chosen/i);
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
  await expect(page.locator('.prism-card[data-key="PDF"]')).toHaveAttribute('aria-label', /9 files/);
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
  await expect(page.locator('#empty')).toContainText('NO FILES MATCH');
});

// ---------- US4 pills ----------

test('pills: SORT and FILES on a file shelf, FILES alone on the vault shelf', async ({ page }) => {
  await start(page);
  await expect(page.locator('#pillSort')).toBeHidden();
  await expect(page.locator('#pillFiles .pill-label')).toHaveText('FILES · ALL');
  await openVault(page);
  await expect(page.locator('#pillSort .pill-label')).toHaveText('SORT · RELEVANCE');
  await expect(page.locator('#pillFiles .pill-label')).toHaveText('FILES · ALL');
  await expect(page.locator('.pill:visible')).toHaveCount(2);
});

test('pills: hover widens SORT with a marker behind the current option; a choice folds it back', async ({ page }) => {
  await start(page);
  await openVault(page);
  const pill = page.locator('#pillSort');
  const closed = (await pill.boundingBox()).width;
  await pill.hover();
  await expect.poll(async () => (await pill.boundingBox()).width).toBeGreaterThan(closed + 200);
  const under = async (v) => {
    const o = await page.locator(`#pillSort [data-v="${v}"]`).boundingBox(), m = await page.locator('#pillSort .ind').boundingBox();
    return Math.abs(o.x - m.x) + Math.abs(o.width - m.width);
  };
  await expect.poll(() => under('relevance')).toBeLessThan(2);
  await page.locator('#pillSort [data-v="name"]').click();
  await expect(page.locator('#pillSort .pill-label')).toHaveText('SORT · NAME');
  // the pointer has not moved, yet the pill folds back
  await expect.poll(async () => (await pill.boundingBox()).width).toBeLessThan(closed + 30);
  const sorted = await shelfItems(page, '#shelf2');
  expect(sorted).toEqual([...sorted].sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })));
  await page.mouse.move(640, 700);
  await pill.hover();
  await expect.poll(() => under('name')).toBeLessThan(2);
});

test('pills: FILES filters the shelf and shows the choice; an empty format shows the empty state', async ({ page }) => {
  await start(page);
  await search(page, 'blood');
  await view(page, 'tier2');
  await page.locator('#pillFiles').hover();
  await page.locator('#pillFiles [data-v="PDF"]').click();
  await expect(page.locator('#pillFiles .pill-label')).toHaveText('FILES · PDF');
  const pdfs = await shelfItems(page, '#shelf2');
  expect(pdfs.length).toBeGreaterThan(0);
  for (const n of pdfs) expect(n).toMatch(/\.pdf$/i);
  await page.mouse.move(640, 700);
  await page.locator('#pillFiles').hover();
  await page.locator('#pillFiles [data-v="CODE"]').click();
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#empty')).toContainText('NO CODE FILES HERE');
});

test('pills: Folders is offered only where folders are listed', async ({ page }) => {
  await start(page);
  await openVault(page);
  await page.locator('#pillFiles').hover();
  await expect(page.locator('#pillFiles [data-v="PDF"]')).toBeVisible();
  await expect(page.locator('#pillFiles [data-v="FOLDERS"]')).toBeHidden();
  await page.keyboard.press('Escape');
  await view(page, 'tier1');
  await activate(page, 'FOLDERS');
  await openVault(page);
  await page.mouse.move(640, 700);
  await page.locator('#pillFiles').hover();
  await expect(page.locator('#pillFiles [data-v="FOLDERS"]')).toBeVisible();
});

test('pills: on a phone an open pill stays inside the window', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page, { folder: false });
  await page.locator('#pillFiles .pill-label').click();
  await expect(page.locator('#pillFiles')).toHaveAttribute('data-open', '');
  await page.waitForTimeout(600);
  const b = await page.locator('#pillFiles').boundingBox();
  expect(b.x).toBeGreaterThanOrEqual(0);
  expect(b.x + b.width).toBeLessThanOrEqual(390);
  // the wordmark stays centred over its hairline
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
