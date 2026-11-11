// Acceptance flows from specs/001-archiveos/spec.md, run against demo data from file://.
const { test, expect } = require('@playwright/test');
const path = require('path');

const URL = 'file://' + path.resolve(__dirname, '../app/index.html');

const view = (page, v) => expect(page.locator('body')).toHaveAttribute('data-view', v, { timeout: 8000 });

// Unique items on the visible shelf, in shelf order.
const shelfItems = (page, shelf) =>
  page.$$eval(`${shelf} .tape`, (els) => {
    const seen = new Map();
    for (const el of els) seen.set(Number(el.dataset.i), el.dataset.name || el.dataset.key);
    return [...seen.entries()].sort((a, b) => a[0] - b[0]).map((e) => e[1]);
  });

async function enter(page) {
  await page.goto(URL);
  await view(page, 'landing');
  await page.keyboard.press('Enter');
  await view(page, 'tier1');
}

async function search(page, q) {
  await page.keyboard.press('/');
  await expect(page.locator('#q')).toBeFocused();
  await page.locator('#q').fill(q);
  await page.keyboard.press('Enter');
}

// ---------- US5 landing ----------

test('US5: landing → Enter dives into the category shelf', async ({ page }) => {
  await enter(page);
});

test('US5: voice/semantic button lands on the shelf with search focused', async ({ page }) => {
  await page.goto(URL);
  await page.getByRole('button', { name: /voice \/ semantic search/i }).click();
  await view(page, 'tier1');
  await expect(page.locator('#q')).toBeFocused();
});

test('US5: back to meadow returns to the landing scene', async ({ page }) => {
  await enter(page);
  await page.getByRole('button', { name: /back to meadow/i }).click();
  await view(page, 'landing');
});

// ---------- US1 search ----------

test('US1: "blood related" finds content-only files and opens the results shelf', async ({ page }) => {
  await enter(page);
  await search(page, 'find the file which has blood related');
  await view(page, 'tier2');
  const names = await shelfItems(page, '#shelf2');
  expect(names).toContain('CBC_Blood_Panel_Report_Nov2026.pdf');
  expect(names).toContain('Scan_Nov_10.pdf');
  expect(names).toContain('IMG_4092.JPG');
  expect(names).not.toContain('Prescription_Dr_Rao_Oct2026.pdf');
  await expect(page.locator('body')).toHaveAttribute('data-active', 'CBC_Blood_Panel_Report_Nov2026.pdf');
});

test('US1: a filler-only query is not submitted', async ({ page }) => {
  await enter(page);
  await search(page, 'find the file');
  await page.waitForTimeout(400);
  await expect(page.locator('body')).toHaveAttribute('data-view', 'tier1');
});

test('US1: no matches shows an explicit empty state', async ({ page }) => {
  await enter(page);
  await search(page, 'zzqx');
  await view(page, 'tier2');
  await expect(page.locator('#empty')).toBeVisible();
  await expect(page.locator('#empty')).toContainText('NO FILES MATCH');
});

// ---------- US2 browse ----------

test('US2: tier 1 shows 12 categories; smart-clusters tab leaves 3', async ({ page }) => {
  await enter(page);
  expect((await shelfItems(page, '#shelf1')).length).toBe(12);
  await page.getByRole('button', { name: 'SMART CLUSTERS' }).click();
  await expect.poll(() => shelfItems(page, '#shelf1')).toEqual(['MEDICAL', 'FINANCE', 'PROJECTS']);
});

test('US2: arrow keys move the active category', async ({ page }) => {
  await enter(page);
  await expect(page.locator('body')).toHaveAttribute('data-active', 'PDF');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('body')).toHaveAttribute('data-active', 'PPT');
});

test('US2: opening PDF shows only PDFs; all-categories returns to PDF', async ({ page }) => {
  await enter(page);
  await page.keyboard.press('Enter');
  await view(page, 'tier2');
  const names = await shelfItems(page, '#shelf2');
  expect(names.length).toBeGreaterThan(3);
  for (const n of names) expect(n).toMatch(/\.pdf$/i);
  await page.getByRole('button', { name: /all categories/i }).click();
  await view(page, 'tier1');
  await expect(page.locator('body')).toHaveAttribute('data-active', 'PDF');
});

// ---------- US3 sort & narrow ----------

test('US3: NAME sort orders alphabetically; PDF pill narrows', async ({ page }) => {
  await enter(page);
  await search(page, 'blood');
  await view(page, 'tier2');
  await page.getByRole('button', { name: 'NAME (A–Z)' }).click();
  const sorted = await shelfItems(page, '#shelf2');
  expect(sorted).toEqual([...sorted].sort((a, b) => a.localeCompare(b, 'en', { numeric: true, sensitivity: 'base' })));
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
  const pdfs = await shelfItems(page, '#shelf2');
  expect(pdfs.length).toBeGreaterThan(0);
  for (const n of pdfs) expect(n).toMatch(/\.pdf$/i);
});

test('US3: a format pill with no files shows the empty state', async ({ page }) => {
  await enter(page);
  await search(page, 'hackathon');
  await view(page, 'tier2');
  await page.getByRole('button', { name: 'DOCX', exact: true }).click();
  await expect(page.locator('#empty')).toBeVisible();
});

// ---------- US4 inspector ----------

test('US4: Enter opens the inspector with details and highlighted terms; Escape closes', async ({ page }) => {
  await enter(page);
  await search(page, 'blood');
  await view(page, 'tier2');
  await page.keyboard.press('Enter');
  await view(page, 'detail');
  await expect(page.locator('#d-name')).toHaveText('CBC_Blood_Panel_Report_Nov2026.pdf');
  await expect(page.locator('#d-meta')).toContainText('MB');
  await expect(page.locator('#d-snippet mark').first()).toBeVisible();
  await page.getByRole('button', { name: /open in default app/i }).click();
  await expect(page.locator('#toast')).toContainText('needs the desktop app');
  await page.keyboard.press('Escape');
  await view(page, 'tier2');
});

// ---------- polish: reduced motion ----------

test('reduced motion: the full flow still completes', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await enter(page);
  await search(page, 'blood');
  await view(page, 'tier2');
  await page.keyboard.press('Enter');
  await view(page, 'detail');
});
