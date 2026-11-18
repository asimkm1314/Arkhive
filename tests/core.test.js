const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../app/core.js');
const FIX = require('./fixtures/demo-folder.js');
const DEMO_FILES = FIX.FILES.filter((f) => f.kind === 'file'); // fixture files only: tests never ship with app data

const DAY = 864e5;
const names = (files) => files.map((f) => f.name);
const file = (name, extra = {}) => ({
  name, ext: name.split('.').pop().toLowerCase(), path: '/x/' + name,
  size: 100, created: 0, modified: Date.now(), text: '', ...extra,
});

// ---------- foundational (T004) ----------

test('categoryOf maps extensions to format categories', () => {
  const cases = { pdf: 'PDF', pptx: 'PPTX', key: 'PPTX', heic: 'JPEG', JPG: 'JPEG', md: 'DOCX',
    csv: 'XLSX', rs: 'CODE', mov: 'MEDIA', dmg: 'ZIP', xyz: 'OTHER', '': 'OTHER' };
  for (const [ext, cat] of Object.entries(cases)) assert.equal(C.categoryOf(ext), cat, ext);
});

test('viewKind says how the in-app viewer shows a file', () => {
  const cases = { pdf: 'pdf', PNG: 'image', jpg: 'image', heic: 'image', gif: 'image', mp4: 'video', mov: 'video', mp3: 'audio', m4a: 'audio',
    txt: 'text', md: 'text', py: 'text', json: 'text', rs: 'text', log: 'text', docx: 'doc', pptx: 'doc', xlsx: 'doc', csv: 'doc', rtf: 'doc', doc: 'doc',
    key: 'doc', pages: 'doc', zip: 'none', dmg: 'none', xyz: 'none', '': 'none' };
  for (const [ext, kind] of Object.entries(cases)) assert.equal(C.viewKind(ext), kind, ext);
});

test('there are 16 categories with unique keys', () => {
  assert.equal(C.CATEGORIES.length, 16);
  assert.equal(new Set(C.CATEGORIES.map((c) => c.key)).size, 16);
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
  assert.ok(DEMO_FILES.length >= 36);
  const cats = new Set(DEMO_FILES.map((f) => C.categoryOf(f.ext)));
  for (const k of ['PDF', 'PPTX', 'JPEG', 'DOCX', 'XLSX', 'CODE']) assert.ok(cats.has(k), k);
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

test('searchLocal("blood related") returns exactly the blood files', () => {
  const hits = C.searchLocal(DEMO_FILES, C.expandTerms(C.cleanQuery('blood related')));
  assert.deepEqual(names(hits).sort(), [...BLOOD_FILES].sort());
});

test('content-only matches are found and carry a snippet with a term', () => {
  const hits = C.searchLocal(DEMO_FILES, C.expandTerms(['blood']));
  const scan = hits.find((h) => h.name === 'Scan_Nov_10.pdf');
  assert.ok(scan, 'Scan_Nov_10.pdf found');
  assert.match(scan.snippet, /haemoglobin|serum|pathology/i);
  for (const h of hits) assert.equal(typeof h.score, 'number');
});

test('name hits outrank content-only hits', () => {
  const files = [file('notes.txt', { text: 'some blood here' }), file('blood.txt')];
  assert.deepEqual(names(C.searchLocal(files, ['blood'])), ['blood.txt', 'notes.txt']);
});

test('searchLocal with no match returns empty', () => {
  assert.deepEqual(C.searchLocal(DEMO_FILES, ['zzqx']), []);
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
    file('b.jpg', { modified: now - 30 * DAY, text: 'Hackathon pitch notes' }),
    file('c.md', { modified: now - 9 * DAY, text: 'hemoglobin was low' }),
  ];
  const cat = (k) => C.CATEGORIES.find((c) => c.key === k);
  assert.deepEqual(names(C.filesInCategory(files, cat('PDF'), now)), ['a.pdf']);
  assert.deepEqual(names(C.filesInCategory(files, cat('PROJECTS'), now)), ['b.jpg']);
  assert.deepEqual(names(C.filesInCategory(files, cat('MEDICAL'), now)), ['c.md']);
  assert.deepEqual(names(C.filesInCategory(files, cat('RECENT'), now)), ['a.pdf']);
});

test('categoriesForTab', () => {
  const keys = (t) => C.categoriesForTab(t).map((c) => c.key);
  assert.equal(keys('all').length, 16);
  assert.deepEqual(keys('docs'), ['PDF', 'PPTX', 'DOCX']);
  assert.deepEqual(keys('media'), ['JPEG', 'MEDIA']);
  assert.deepEqual(keys('code'), ['XLSX', 'CODE', 'ZIP']);
  assert.deepEqual(keys('smart'), ['MEDICAL', 'PROJECTS']);
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
  assert.equal(C.formatDate(Date.UTC(2026, 10, 10, 12)), 'Nov 10, 2026');
});

// ---------- review fixes ----------

test('name matches start at word boundaries (no mid-word cluster hits)', () => {
  const files = [file('Release_Notes_v2.md'), file('syntax_cheatsheet.md'), file('Parental_Consent_Form.pdf'), file('Amritsar_Trip.jpg'), file('Lease_2026.pdf')];
  const legal = { keywords: ['lease', 'tax', 'rental'] }; // inline: the Finance vault was removed in 002
  assert.deepEqual(names(C.filesInCategory(files, legal, Date.now())), ['Lease_2026.pdf']);
  assert.deepEqual(names(C.filesInCategory(files, C.CATEGORIES.find((c) => c.key === 'MEDICAL'), Date.now())), []);
});

test('PROJECTS vault in the demo holds no medical reports', () => {
  const p = names(C.filesInCategory(DEMO_FILES, C.CATEGORIES.find((c) => c.key === 'PROJECTS'), Date.now()));
  for (const n of ['CBC_Blood_Panel_Report_Nov2026.pdf', 'Scan_Nov_10.pdf', 'MRI_Knee_Report.pdf']) assert.ok(!p.includes(n), n);
  assert.ok(p.includes('Hackathon_Pitch_UrbanIQ.pptx'));
});

test('cleanQuery keeps combining marks and single CJK characters', () => {
  assert.deepEqual(C.cleanQuery('रक्त जांच'), ['रक्त', 'जांच']);
  assert.deepEqual(C.cleanQuery('血 test'), ['血', 'test']);
  assert.deepEqual(C.cleanQuery('a b'), []);
});

// ---------- 002 Arkhive: categories (T002) ----------

test('category shelf holds the 16 Arkhive vaults in order, All files first, the three home folders before Folders', () => {
  assert.equal(C.CATEGORIES.find((c) => c.key === 'DOCUMENTS').dir, 'Documents');
  assert.deepEqual(C.CATEGORIES.map((c) => c.key),
    ['ALL', 'PDF', 'PPTX', 'JPEG', 'DOCX', 'XLSX', 'CODE', 'DESKTOP', 'DOCUMENTS', 'DOWNLOADS', 'FOLDERS', 'MEDICAL', 'MEDIA', 'ZIP', 'PROJECTS', 'RECENT']);
  const label = (k) => C.CATEGORIES.find((c) => c.key === k).label;
  assert.equal(label('ZIP'), 'ARCHIVES');
  assert.equal(label('MEDICAL'), 'MEDICAL / HEALTH');
});

// ---------- 002 US3 folders (T013) ----------

test('listChildren: the fixture folder lists its direct children, folders first, each once', () => {
  const top = C.listChildren(FIX.FILES, '/Fixture');
  for (const n of ['Documents', 'Downloads', 'Desktop']) assert.ok(names(top).includes(n), n);
  assert.ok(top.every((e) => e.kind === 'dir'), 'only folders at the top');
  assert.equal(new Set(names(top)).size, top.length);
});

test('listChildren lists what is directly inside a folder, folders first, each once', () => {
  const docs = C.listChildren(FIX.FILES, '/Fixture/Documents');
  assert.equal(new Set(names(docs)).size, docs.length);
  assert.ok(names(docs).includes('Medical'));
  assert.ok(!names(docs).includes('CBC_Blood_Panel_Report_Nov2026.pdf'), 'two levels down');
  assert.deepEqual(C.listChildren(FIX.FILES, '/Fixture/Documents/Medical').map((e) => e.kind).slice(0, 2), ['dir', 'dir']);
});

test('listChildren has an empty folder and returns nothing for an unknown one', () => {
  assert.ok(names(C.listChildren(FIX.FILES, '/Fixture/Documents')).includes('Inbox'));
  assert.deepEqual(C.listChildren(FIX.FILES, '/Fixture/Documents/Inbox'), []);
  assert.deepEqual(C.listChildren(FIX.FILES, '/Fixture/Nope'), []);
});

test('sortFiles keeps folders before files in every mode', () => {
  const files = [file('b.pdf', { size: 9, score: 5 }), file('Zed', { kind: 'dir', ext: '', size: 0 }), file('a.pdf', { size: 1 })];
  for (const mode of ['relevance', 'name', 'newest', 'oldest', 'largest']) assert.equal(C.sortFiles(files, mode)[0].name, 'Zed', mode);
});

test('filterFormat narrows to folders and to spreadsheets', () => {
  const files = [file('a.xlsx'), file('b.csv'), file('Docs', { kind: 'dir', ext: '' }), file('c.pdf')];
  assert.deepEqual(names(C.filterFormat(files, 'FOLDERS')), ['Docs']);
  assert.deepEqual(names(C.filterFormat(files, 'XLSX')), ['a.xlsx', 'b.csv']);
});

// ---------- 002 US4 voice (T019) ----------

test('parseVoice: a wake phrase starts a command and leading filler is dropped', () => {
  assert.equal(C.parseVoice('Hey Arkhive, find the file which has blood related'), 'blood related');
  assert.equal(C.parseVoice('hey archive show me files about hackathon'), 'hackathon');
  assert.equal(C.parseVoice('Arkhive invoice 2026'), 'invoice 2026');
  assert.equal(C.parseVoice('find the lease renewal letter'), 'lease renewal letter');
  assert.equal(C.parseVoice('search for tax return'), 'tax return');
  assert.equal(C.parseVoice('show me blood reports'), 'blood reports');
  assert.equal(C.parseVoice('ok ark hive, can you find my resume'), 'resume');
});

test('parseVoice: no wake phrase at the start means no command', () => {
  assert.equal(C.parseVoice('the blood report is on the desk'), null);
  assert.equal(C.parseVoice('I could not find it'), null);
  assert.equal(C.parseVoice('finder window'), null);
  assert.equal(C.parseVoice(''), null);
});

test('parseVoice: a wake phrase with only filler after it gives an empty query', () => {
  assert.equal(C.parseVoice('hey arkhive'), '');
  assert.equal(C.parseVoice('Hey Arkhive, find the file'), '');
});

test('a spoken command searches the same terms as typing them', () => {
  assert.deepEqual(C.cleanQuery(C.parseVoice('Hey Arkhive, find the file which has blood related')), C.cleanQuery('blood related'));
});

// ---------- 002 US5 tray (T023) ----------

test('trayAdd adds a file once and never a folder', () => {
  const a = file('a.pdf'), b = file('b.pdf'), d = file('Docs', { kind: 'dir' });
  const tray = C.trayAdd(C.trayAdd([], a), b);
  assert.deepEqual(names(tray), ['a.pdf', 'b.pdf']);
  assert.equal(C.trayAdd(tray, { ...a }), tray, 'same path');
  assert.equal(C.trayAdd(tray, d), tray, 'folder');
});

// ---------- 002 US6 inspector (T029) ----------

test('formatPerms writes Unix permission bits as rwx', () => {
  assert.equal(C.formatPerms(0o644), 'rw-r--r--');
  assert.equal(C.formatPerms(0o755), 'rwxr-xr-x');
  assert.equal(C.formatPerms(0o100600), 'rw-------', 'file-type bits ignored');
  assert.equal(C.formatPerms(0), '---------');
});

test('tilde shortens the home folder', () => {
  assert.equal(C.tilde('/Users/asim/Documents/a.pdf'), '~/Documents/a.pdf');
  assert.equal(C.tilde('/Users/asim'), '~');
  assert.equal(C.tilde('/Volumes/USB/a.pdf'), '/Volumes/USB/a.pdf');
  assert.equal(C.tilde('~/Documents/a.pdf'), '~/Documents/a.pdf');
});

test('matchKind tells a text match from a name match', () => {
  assert.equal(C.matchKind(file('Blood_Panel.pdf'), ['blood']), 'name');
  assert.equal(C.matchKind(file('Scan.pdf', { text: 'serum ferritin low' }), ['blood', 'serum']), 'content');
  assert.equal(C.matchKind(file('Scan.pdf', { snippet: '…serum ferritin…' }), ['serum']), 'content');
  assert.equal(C.matchKind(file('Scan.pdf', { score: 1 }), ['serum']), 'content', 'backend hit without a snippet');
  assert.equal(C.matchKind(file('Scan.pdf'), ['blood']), null);
  assert.equal(C.matchKind(file('Blood_Panel.pdf'), null), null, 'not searching');
});

test('demo files carry kind and permission bits', () => {
  assert.ok(DEMO_FILES.every((f) => f.kind === 'file' && f.mode === 0o644));
});

// ---------- 003: the app ships no file data ----------

test('app/ contains no fixture file names or contents (real files only)', () => {
  const fs = require('fs');
  const src = fs.readFileSync(require('path').join(__dirname, '../app/index.html'), 'utf8') + fs.readFileSync(require('path').join(__dirname, '../app/core.js'), 'utf8');
  for (const bad of ['CBC_Blood_Panel', 'Scan_Nov_10', 'Hackathon_Pitch_UrbanIQ', 'Arterial_Blood_Gas', 'Donor_Card_2025', 'Meeting_Notes_Nov', 'Coorg_Morning']) {
    assert.ok(!src.includes(bad), bad);
  }
});

test('searchLocal ranks name hits first and skips files with no text', () => {
  const files = [file('blood.txt', { text: 'nothing here' }), file('notes.txt', { text: 'blood work done' }), file('scan.pdf', { text: '' })];
  assert.deepEqual(names(C.searchLocal(files, ['blood'])), ['blood.txt', 'notes.txt']);
  assert.deepEqual(C.searchLocal([file('scan.pdf', { text: '' })], ['blood']), []);
});

// ---------- 003 second pass (T121) ----------

test('"blood" also reaches donor records', () => {
  assert.ok(C.expandTerms(['blood']).includes('donor'));
  assert.ok(C.expandTerms(['blood']).length <= 16);
});

test('pathCrumbs lists the folders above a file, with the home folder as ~', () => {
  assert.deepEqual(C.pathCrumbs('/Users/asim/Documents/Medical/a.pdf'), [
    { name: '~', path: '/Users/asim' },
    { name: 'Documents', path: '/Users/asim/Documents' },
    { name: 'Medical', path: '/Users/asim/Documents/Medical' },
  ]);
  assert.deepEqual(C.pathCrumbs('/Users/asim/a.pdf'), [{ name: '~', path: '/Users/asim' }]);
  assert.deepEqual(C.pathCrumbs('/Fixture/Documents/a.pdf'), [{ name: 'Fixture', path: '/Fixture' }, { name: 'Documents', path: '/Fixture/Documents' }]);
  assert.deepEqual(C.pathCrumbs('/a.pdf'), []);
});


// ---------- 004 Sort / File types (T040) ----------

test('ALL FILES vault covers every format extension and stays under the 40-extension limit', () => {
  const all = C.CATEGORIES.find((c) => c.key === 'ALL');
  assert.equal(all.label, 'ALL FILES');
  for (const k of ['PDF', 'PPTX', 'JPEG', 'DOCX', 'XLSX', 'CODE']) {
    for (const e of C.CATEGORIES.find((c) => c.key === k).exts) assert.ok(all.exts.includes(e), e);
  }
  assert.ok(all.exts.length <= 40);
  assert.equal(all.group, null);
});

test('sortFiles nameDesc is the reverse of name, folders still first', () => {
  const files = [{ name: 'a9.jpg', modified: 3, size: 1 }, { name: 'b.pdf', modified: 2, size: 2 }, { name: 'a10.pdf', modified: 1, size: 3 }, { name: 'Zed', kind: 'dir', modified: 0, size: 0 }];
  assert.deepEqual(C.sortFiles(files, 'nameDesc').map((f) => f.name), ['Zed', 'b.pdf', 'a10.pdf', 'a9.jpg']);
});

test('sortVaults orders vaults by label, newest file or total size; relevance keeps the standard order', () => {
  const cats = C.CATEGORIES.filter((c) => ['PDF', 'JPEG', 'CODE'].includes(c.key));
  const summary = { PDF: { count: 2, bytes: 50, newest: { modified: 10 } }, JPEG: { count: 9, bytes: 900, newest: { modified: 30 } }, CODE: undefined };
  const keys = (by) => C.sortVaults(cats, summary, by).map((c) => c.key);
  assert.deepEqual(keys('relevance'), ['PDF', 'JPEG', 'CODE']);
  assert.deepEqual(keys('name'), ['CODE', 'JPEG', 'PDF']);
  assert.deepEqual(keys('nameDesc'), ['PDF', 'JPEG', 'CODE']);
  assert.deepEqual(keys('newest'), ['JPEG', 'PDF', 'CODE'], 'uncounted vaults go last');
  assert.deepEqual(keys('oldest'), ['PDF', 'JPEG', 'CODE']);
  assert.deepEqual(keys('largest'), ['JPEG', 'PDF', 'CODE']);
  assert.notEqual(C.sortVaults(cats, summary, 'name'), cats, 'returns a new array');
});

test('formatCounts counts a shelf by file type, folders separately', () => {
  const f = (name, ext, kind = 'file') => ({ name, ext, kind });
  const counts = C.formatCounts([f('a', 'pdf'), f('b', 'png'), f('c', 'heic'), f('d', 'md'), f('e', 'csv'), f('g', 'rs'), f('h', 'mov'), f('Dir', '', 'dir')]);
  assert.deepEqual(counts, { ALL: 8, PDF: 1, PPTX: 0, JPEG: 2, DOCX: 1, XLSX: 1, CODE: 1, FOLDERS: 1 });
});

test('every vault fits the backend limits (24 terms, 40 extensions), so one vault cannot fail every count', () => {
  for (const c of C.CATEGORIES) {
    assert.ok((c.keywords || []).length <= 24, c.key);
    assert.ok((c.exts || []).length <= 40, c.key);
  }
});
