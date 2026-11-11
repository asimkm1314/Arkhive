const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/core.js');

const DAY = 864e5;
const names = (files) => files.map((f) => f.name);
const file = (name, extra = {}) => ({
  name, ext: name.split('.').pop().toLowerCase(), path: '/x/' + name,
  size: 100, created: 0, modified: Date.now(), text: '', ...extra,
});

// ---------- foundational (T004) ----------

test('categoryOf maps extensions to format categories', () => {
  const cases = { pdf: 'PDF', pptx: 'PPT', key: 'PPT', heic: 'JPEG', JPG: 'JPEG', md: 'DOCX',
    csv: 'XLSX', rs: 'CODE', mov: 'MEDIA', dmg: 'ZIP', xyz: 'OTHER', '': 'OTHER' };
  for (const [ext, cat] of Object.entries(cases)) assert.equal(C.categoryOf(ext), cat, ext);
});

test('there are 12 categories with unique keys', () => {
  assert.equal(C.CATEGORIES.length, 12);
  assert.equal(new Set(C.CATEGORIES.map((c) => c.key)).size, 12);
});

test('shelf smooth step B(r)', () => {
  assert.equal(C.B(0), 0);
  assert.equal(C.B(1), 0.5);
  assert.equal(C.B(-2), -0.5);
  assert.ok(Math.abs(C.B(0.5) - (0.5 + 1 / Math.PI) / 2) < 1e-12);
});

test('openness is 1 at centre, 0 at one slot away', () => {
  assert.equal(C.openness(0), 1);
  assert.equal(C.openness(1), 0);
  assert.equal(C.openness(-3), 0);
  assert.equal(C.openness(0.5), 0.5);
});

test('wrapRel normalises to [-n/2, n/2]', () => {
  assert.equal(C.wrapRel(0, 0, 36), 0);
  assert.equal(C.wrapRel(35, 0, 36), -1);
  assert.equal(C.wrapRel(1, 35.5, 36), 1.5);
  assert.equal(C.wrapRel(-40, 0, 36), -4);
});

test('xPos is 0 at centre, odd-symmetric, and linear past one slot', () => {
  const [ws, d, gap] = [10, 30, 1];
  assert.equal(C.xPos(0, ws, d, gap), 0);
  assert.ok(Math.abs(C.xPos(0.3, ws, d, gap) + C.xPos(-0.3, ws, d, gap)) < 1e-12);
  assert.equal(C.xPos(2, ws, d, gap), 2 * (ws + gap) + (d - ws + 1.6 * gap) * 0.5);
});

test('demo set has 36+ files across the required formats', () => {
  assert.ok(C.DEMO_FILES.length >= 36);
  const cats = new Set(C.DEMO_FILES.map((f) => C.categoryOf(f.ext)));
  for (const k of ['PDF', 'PPT', 'JPEG', 'DOCX', 'XLSX', 'CODE']) assert.ok(cats.has(k), k);
});

// ---------- US1 search (T007) ----------

test('cleanQuery drops filler words and dedupes', () => {
  assert.deepEqual(C.cleanQuery('find the file which has blood related'), ['blood']);
  assert.deepEqual(C.cleanQuery('Blood, BLOOD; blood!'), ['blood']);
  assert.deepEqual(C.cleanQuery('find the file'), []);
  assert.deepEqual(C.cleanQuery(''), []);
});

test('cleanQuery caps terms at 16 and length at 40', () => {
  const many = Array.from({ length: 30 }, (_, i) => 'word' + i).join(' ');
  assert.equal(C.cleanQuery(many).length, 16);
  assert.equal(C.cleanQuery('x'.repeat(90))[0].length, 40);
});

test('cleanQuery keeps only letters/digits (query syntax cannot leak through)', () => {
  assert.deepEqual(C.cleanQuery('blood" || kMDItemFSName == "*'), ['blood', 'kmditemfsname']);
});

test('expandTerms adds related terms for blood', () => {
  const t = C.expandTerms(['blood']);
  for (const w of ['blood', 'hemoglobin', 'cbc', 'hematology', 'plasma', 'platelet', 'serum', 'glucose', 'lipid']) {
    assert.ok(t.includes(w), w);
  }
  assert.ok(t.length <= 16);
  assert.deepEqual(C.expandTerms(['zebra']), ['zebra']);
});

const BLOOD_FILES = [
  'CBC_Blood_Panel_Report_Nov2026.pdf', 'Hematology_Biomarkers_Deck.pptx', 'Lab_Bloodwork_Receipt_Scan.jpg',
  'Blood_Pressure_And_Lipid_Log.xlsx', 'Arterial_Blood_Gas_Notes.docx', 'Scan_Nov_10.pdf', 'IMG_4092.JPG',
  'Donor_Card_2025.png',
];

test('searchDemo("blood related") returns exactly the blood files', () => {
  const hits = C.searchDemo(C.DEMO_FILES, C.expandTerms(C.cleanQuery('blood related')));
  assert.deepEqual(names(hits).sort(), [...BLOOD_FILES].sort());
});

test('content-only matches are found and carry a snippet with a term', () => {
  const hits = C.searchDemo(C.DEMO_FILES, C.expandTerms(['blood']));
  const scan = hits.find((h) => h.name === 'Scan_Nov_10.pdf');
  assert.ok(scan, 'Scan_Nov_10.pdf found');
  assert.match(scan.snippet, /haemoglobin|serum|pathology/i);
  for (const h of hits) assert.equal(typeof h.score, 'number');
});

test('name hits outrank content-only hits', () => {
  const files = [file('notes.txt', { text: 'some blood here' }), file('blood.txt')];
  assert.deepEqual(names(C.searchDemo(files, ['blood'])), ['blood.txt', 'notes.txt']);
});

test('searchDemo with no match returns empty', () => {
  assert.deepEqual(C.searchDemo(C.DEMO_FILES, ['zzqx']), []);
});

test('snippetFor cuts around the first hit and returns null without one', () => {
  const text = 'a'.repeat(300) + ' Serum ferritin low ' + 'b'.repeat(300);
  const s = C.snippetFor(text, ['serum']);
  assert.ok(s.startsWith('…') && s.endsWith('…'));
  assert.ok(s.includes('Serum ferritin'));
  assert.ok(s.length < 200);
  assert.equal(C.snippetFor('nothing', ['serum']), null);
  assert.equal(C.snippetFor(text, ['serum'], 0, 5), '…Serum…');
});

// ---------- US2 browse (T013) ----------

test('filesInCategory: format, smart cluster, recent', () => {
  const now = Date.now();
  const files = [
    file('a.pdf', { modified: now - 2 * DAY }),
    file('b.jpg', { modified: now - 30 * DAY, text: 'Invoice total 4,000' }),
    file('c.md', { modified: now - 9 * DAY, text: 'hemoglobin was low' }),
  ];
  const cat = (k) => C.CATEGORIES.find((c) => c.key === k);
  assert.deepEqual(names(C.filesInCategory(files, cat('PDF'), now)), ['a.pdf']);
  assert.deepEqual(names(C.filesInCategory(files, cat('FINANCE'), now)), ['b.jpg']);
  assert.deepEqual(names(C.filesInCategory(files, cat('MEDICAL'), now)), ['c.md']);
  assert.deepEqual(names(C.filesInCategory(files, cat('RECENT'), now)), ['a.pdf']);
});

test('categoriesForTab', () => {
  const keys = (t) => C.categoriesForTab(t).map((c) => c.key);
  assert.equal(keys('all').length, 12);
  assert.deepEqual(keys('docs'), ['PDF', 'PPT', 'DOCX']);
  assert.deepEqual(keys('media'), ['JPEG', 'MEDIA']);
  assert.deepEqual(keys('code'), ['XLSX', 'CODE', 'ZIP']);
  assert.deepEqual(keys('smart'), ['MEDICAL', 'FINANCE', 'PROJECTS']);
});

// ---------- US3 sort/filter (T017) ----------

test('sortFiles by every mode, without mutating input', () => {
  const files = [
    file('b.pdf', { size: 5, modified: 2, score: 1 }),
    file('a10.pdf', { size: 9, modified: 1, score: 3 }),
    file('a9.jpg', { size: 1, modified: 3, score: 3 }),
  ];
  const copy = [...files];
  assert.deepEqual(names(C.sortFiles(files, 'relevance')), ['a9.jpg', 'a10.pdf', 'b.pdf']);
  assert.deepEqual(names(C.sortFiles(files, 'name')), ['a9.jpg', 'a10.pdf', 'b.pdf']);
  assert.deepEqual(names(C.sortFiles(files, 'newest')), ['a9.jpg', 'b.pdf', 'a10.pdf']);
  assert.deepEqual(names(C.sortFiles(files, 'oldest')), ['a10.pdf', 'b.pdf', 'a9.jpg']);
  assert.deepEqual(names(C.sortFiles(files, 'largest')), ['a10.pdf', 'b.pdf', 'a9.jpg']);
  assert.deepEqual(files, copy);
});

test('filterFormat', () => {
  const files = [file('a.pdf'), file('b.JPG'), file('c.pptx')];
  assert.deepEqual(names(C.filterFormat(files, 'ALL')), ['a.pdf', 'b.JPG', 'c.pptx']);
  assert.deepEqual(names(C.filterFormat(files, 'JPEG')), ['b.JPG']);
  assert.deepEqual(names(C.filterFormat(files, 'DOCX')), []);
});

// ---------- US4 inspector (T021) ----------

test('highlight escapes HTML and marks term prefixes', () => {
  assert.equal(C.highlight('<b>Blood & bloodwork</b>', ['blood']),
    '&lt;b&gt;<mark>Blood</mark> &amp; <mark>blood</mark>work&lt;/b&gt;');
  assert.equal(C.highlight('&amp test', ['amp']), '&amp;<mark>amp</mark> test');
  assert.equal(C.highlight('"x"', []), '&quot;x&quot;');
});

test('formatSize and formatDate', () => {
  assert.equal(C.formatSize(512), '512 B');
  assert.equal(C.formatSize(2.4 * 1024 * 1024), '2.4 MB');
  assert.equal(C.formatSize(1536), '1.5 KB');
  assert.equal(C.formatDate(Date.UTC(2026, 10, 10, 12)), 'NOV 10, 2026');
});

// ---------- review fixes ----------

test('name matches start at word boundaries (no mid-word cluster hits)', () => {
  const files = [file('Release_Notes_v2.md'), file('syntax_cheatsheet.md'), file('Parental_Consent_Form.pdf'), file('Amritsar_Trip.jpg'), file('Lease_2026.pdf')];
  const cat = (k) => C.CATEGORIES.find((c) => c.key === k);
  assert.deepEqual(names(C.filesInCategory(files, cat('FINANCE'), Date.now())), ['Lease_2026.pdf']);
  assert.deepEqual(names(C.filesInCategory(files, cat('MEDICAL'), Date.now())), []);
});

test('PROJECTS vault in the demo holds no medical reports', () => {
  const p = names(C.filesInCategory(C.DEMO_FILES, C.CATEGORIES.find((c) => c.key === 'PROJECTS'), Date.now()));
  for (const n of ['CBC_Blood_Panel_Report_Nov2026.pdf', 'Scan_Nov_10.pdf', 'MRI_Knee_Report.pdf']) assert.ok(!p.includes(n), n);
  assert.ok(p.includes('Hackathon_Pitch_UrbanIQ.pptx'));
});

test('cleanQuery keeps combining marks and single CJK characters', () => {
  assert.deepEqual(C.cleanQuery('रक्त जांच'), ['रक्त', 'जांच']);
  assert.deepEqual(C.cleanQuery('血 test'), ['血', 'test']);
  assert.deepEqual(C.cleanQuery('a b'), []);
});
