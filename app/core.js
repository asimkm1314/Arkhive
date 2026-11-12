// Arkhive pure logic. Classic script (works from file://) and CommonJS (node:test).
(function (root) {
  'use strict';

  const DAY = 864e5;

  const CATEGORIES = [
    { key: 'PDF', label: 'PDF', sub: 'Portable Documents & Reports', group: 'docs', exts: ['pdf'] },
    { key: 'PPTX', label: 'PPTX', sub: 'Presentations & Pitch Decks', group: 'docs', exts: ['ppt', 'pptx', 'key'] },
    { key: 'JPEG', label: 'JPEG', sub: 'Photos, Scans & Screenshots', group: 'media', exts: ['jpg', 'jpeg', 'png', 'heic', 'webp'] },
    { key: 'DOCX', label: 'DOCX', sub: 'Word Docs, Notes & Markdown', group: 'docs', exts: ['docx', 'doc', 'md', 'txt', 'rtf'] },
    { key: 'XLSX', label: 'XLSX', sub: 'Spreadsheets & CSV Ledgers', group: 'code', exts: ['xlsx', 'csv', 'numbers'] },
    { key: 'CODE', label: 'CODE', sub: 'Source Code & Configs', group: 'code', exts: ['py', 'rs', 'ts', 'tsx', 'js', 'cpp', 'json', 'sql'] },
    { key: 'FOLDERS', label: 'FOLDERS', sub: 'Desktop, Documents & Downloads', group: null, folders: true },
    { key: 'MEDICAL', label: 'MEDICAL / HEALTH', sub: 'Lab results, prescriptions, bloodwork, imaging', group: 'smart',
      keywords: ['blood', 'hemoglobin', 'haemoglobin', 'hematology', 'cbc', 'prescription', 'mri', 'pathology', 'clinic', 'hospital', 'patient', 'diagnosis', 'lipid', 'glucose', 'platelet', 'serum'] },
    { key: 'MEDIA', label: 'MEDIA', sub: 'Audio & Video Recordings', group: 'media', exts: ['mp4', 'mov', 'wav', 'mp3'] },
    { key: 'ZIP', label: 'ARCHIVES', sub: 'Compressed Archives & Disk Images', group: 'code', exts: ['zip', 'tar', 'dmg', '7z'] },
    // keywords match as word prefixes, so none may be the start of an unrelated common word ("repo" → "report")
    { key: 'PROJECTS', label: 'PROJECTS', sub: 'Hackathons, decks, repositories', group: 'smart',
      keywords: ['hackathon', 'project', 'pitch', 'repository', 'roadmap', 'sprint', 'prototype'] },
    { key: 'RECENT', label: 'RECENT', sub: 'Last 7 days, all formats', group: null, recentDays: 7 },
  ];

  const STOP = new Set(('find show get give open search look the an file files which that this these has have having with ' +
    'about related relating regarding of for to in on at my me is are was and or any all some containing contains contain ' +
    'thing things stuff something where what please document documents can you could hey').split(' '));

  // shortcut: hand-picked related terms, not a semantic model; extend the table when a query misses.
  const SYNONYMS = {
    blood: ['hemoglobin', 'haemoglobin', 'hematology', 'cbc', 'plasma', 'platelet', 'serum', 'transfusion', 'glucose', 'lipid', 'pathology', 'erythrocyte', 'donor'],
    heart: ['cardio', 'ecg', 'ekg', 'cholesterol'],
    medical: ['health', 'clinic', 'hospital', 'prescription', 'patient', 'diagnosis', 'pathology'],
    tax: ['gst', 'itr', 'invoice', 'receipt'],
    invoice: ['bill', 'receipt', 'payment'],
    money: ['invoice', 'receipt', 'bank', 'payment', 'salary', 'budget'],
    slides: ['deck', 'presentation', 'pitch'],
    presentation: ['deck', 'slides', 'pitch'],
    resume: ['cv', 'curriculum'],
  };

  // \p{M}: combining marks are part of a word in Devanagari and other scripts
  const tokens = (s) => String(s || '').toLowerCase().split(/[^\p{L}\p{N}\p{M}]+/u).filter(Boolean);
  const CJK = /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}]/u; // one character can be a whole word
  const uniq = (a) => [...new Set(a)];
  const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function cleanQuery(raw) {
    return uniq(tokens(raw).filter((t) => (t.length > 1 || CJK.test(t)) && !STOP.has(t)).map((t) => t.slice(0, 40))).slice(0, 16);
  }

  function expandTerms(terms) {
    return uniq(terms.flatMap((t) => [t, ...(SYNONYMS[t] || [])])).slice(0, 16);
  }

  function categoryOf(ext) {
    const e = String(ext || '').toLowerCase();
    const c = CATEGORIES.find((c) => c.exts && c.exts.includes(e));
    return c ? c.key : 'OTHER';
  }

  // Mirrors the Spotlight query: word-prefix in the name (3 pts) or in the contents (1 pt).
  function scoreFile(f, terms) {
    const name = tokens(f.name);
    const words = tokens(f.text || f.snippet);
    let score = 0, content = false;
    for (const t of terms) {
      if (name.some((w) => w.startsWith(t))) score += 3;
      else if (words.some((w) => w.startsWith(t))) { score += 1; content = true; }
    }
    return { score, content };
  }

  function termRegex(terms) {
    if (!terms.length) return null;
    return new RegExp('(^|[^\\p{L}\\p{N}])(' + terms.map(escRe).join('|') + ')', 'giu');
  }

  function snippetFor(text, terms, before = 60, after = 100) {
    const re = termRegex(terms);
    const m = re && re.exec(String(text || ''));
    if (!m) return null;
    const at = m.index + m[1].length;
    const start = Math.max(0, at - before), end = Math.min(text.length, at + after);
    return (start > 0 ? '…' : '') + text.slice(start, end).replace(/\s+/g, ' ').trim() + (end < text.length ? '…' : '');
  }

  // Scores files you already have in memory (browser folder or fixture). Only text the app read is searched.
  function searchLocal(files, terms) {
    if (!terms.length) return [];
    return sortFiles(files.flatMap((f) => {
      const { score, content } = scoreFile(f, terms);
      return score ? [{ ...f, score, snippet: content ? snippetFor(f.text, terms) : null }] : [];
    }), 'relevance');
  }

  function filesInCategory(files, cat, now) {
    if (cat.exts) return files.filter((f) => cat.exts.includes(String(f.ext).toLowerCase()));
    if (cat.keywords) return files.filter((f) => scoreFile(f, cat.keywords).score > 0);
    return files.filter((f) => now - f.modified <= cat.recentDays * DAY);
  }

  const categoriesForTab = (tab) => (tab === 'all' ? CATEGORIES : CATEGORIES.filter((c) => c.group === tab));

  const SORTS = {
    relevance: (a, b) => (b.score || 0) - (a.score || 0) || b.modified - a.modified,
    name: (a, b) => a.name.localeCompare(b.name, 'en', { numeric: true, sensitivity: 'base' }),
    newest: (a, b) => b.modified - a.modified,
    oldest: (a, b) => a.modified - b.modified,
    largest: (a, b) => b.size - a.size,
  };
  const sortFiles = (files, mode) => [...files].sort((a, b) => (b.kind === 'dir') - (a.kind === 'dir') || SORTS[mode](a, b));
  const filterFormat = (files, fmt) => (fmt === 'ALL' ? files : files.filter((f) => (fmt === 'FOLDERS' ? f.kind === 'dir' : f.kind !== 'dir' && categoryOf(f.ext) === fmt)));

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  function highlight(text, terms) {
    text = String(text || '');
    const re = termRegex(terms);
    if (!re) return esc(text);
    let out = '', last = 0;
    for (const m of text.matchAll(re)) {
      const at = m.index + m[1].length;
      out += esc(text.slice(last, at)) + '<mark>' + esc(m[2]) + '</mark>';
      last = at + m[2].length;
    }
    return out + esc(text.slice(last));
  }

  function formatSize(b) {
    const u = ['B', 'KB', 'MB', 'GB', 'TB'];
    let i = 0;
    while (b >= 1024 && i < u.length - 1) { b /= 1024; i++; }
    return (i ? b.toFixed(1) : String(b)) + ' ' + u[i];
  }
  const formatPerms = (mode) => [...'rwxrwxrwx'].map((c, i) => (mode & (256 >> i) ? c : '-')).join('');
  const tilde = (p) => String(p).replace(/^\/Users\/[^/]+(?=\/|$)/, '~');

  // 'content' wins over 'name': "found inside the file" is the more useful thing to say.
  function matchKind(f, terms) {
    if (!terms || !terms.length) return null;
    const { score, content } = scoreFile(f, terms);
    return content ? 'content' : score ? 'name' : f.score > 0 ? 'content' : null; // backend hit with no snippet
  }

  // ---- voice: a phrase is a command only when it starts with a wake phrase ----
  const WAKE = /^\s*(?:(?:(?:hey|hi|ok|okay)[\s,]+)?(?:arkhive|archive|ark\s+hive)|find|search(?:\s+for)?|show\s+me|look\s+for)(?![\p{L}\p{N}])[\s,.!:;-]*/iu;
  function parseVoice(heard) {
    const s = String(heard || ''), m = WAKE.exec(s);
    if (!m) return null;
    const words = s.slice(m[0].length).split(/\s+/).filter(Boolean);
    while (words.length && !cleanQuery(words[0]).length) words.shift(); // leading filler: "the file which has…"
    return words.join(' ').replace(/[.?!,]+$/, '');
  }

  // The folders above a file, outermost first; the home folder is shown as ~.
  function pathCrumbs(path) {
    const parts = String(path).split('/').filter(Boolean).slice(0, -1);
    const home = parts[0] === 'Users' && parts.length >= 2;
    const out = [];
    for (let i = home ? 1 : 0; i < parts.length; i++) out.push({ name: home && i === 1 ? '~' : parts[i], path: '/' + parts.slice(0, i + 1).join('/') });
    return out;
  }

  // Hero story: scroll position 0…1 → which of n stages, and how far through it (0…1).
  function storyAt(p, n = 4) {
    const c = Math.min(1, Math.max(0, p));
    const stage = Math.min(n - 1, Math.floor(c * n));
    return { stage, t: c === 1 ? 1 : c * n - stage };
  }

  const trayAdd = (tray, f) => (f.kind === 'dir' || tray.some((t) => t.path === f.path) ? tray : [...tray, f]);

  const formatDate = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();

  // ---- shelf math (brief §4) ----
  const B = (r) => (Math.abs(r) < 1 ? (r + Math.sin(Math.PI * r) / Math.PI) / 2 : Math.sign(r) * 0.5);
  const smoothstep = (x) => x * x * (3 - 2 * x);
  const openness = (r) => smoothstep(Math.max(0, 1 - Math.abs(r)));
  function wrapRel(v, s, n) {
    let r = (((v - s) % n) + n) % n;
    if (r > n / 2) r -= n;
    return r;
  }
  const xPos = (r, ws, d, gap) => r * (ws + gap) + (d - ws + 1.6 * gap) * B(r);

  // Immediate children of `dir` among `records` (each with an absolute path). Folders are derived from the paths.
  const folderRec = (path, modified = 0) => ({ name: path.slice(path.lastIndexOf('/') + 1), ext: '', kind: 'dir', path, size: 0, created: 0, modified, mode: 0o755, score: 0, snippet: null });
  function listChildren(records, dir) {
    const pre = dir.endsWith('/') ? dir : dir + '/', out = new Map();
    for (const f of records) {
      if (!f.path.startsWith(pre)) continue;
      const rest = f.path.slice(pre.length), cut = rest.indexOf('/');
      if (cut < 0) { out.set(rest, f); continue; }
      const name = rest.slice(0, cut), d = out.get(name) || folderRec(pre + name);
      d.modified = Math.max(d.modified, f.modified);
      out.set(name, d);
    }
    return sortFiles([...out.values()], 'name');
  }

  const api = {
    CATEGORIES, esc, cleanQuery, expandTerms, categoryOf, searchLocal, snippetFor, filesInCategory,
    categoriesForTab, sortFiles, filterFormat, highlight, formatSize, formatDate, B, smoothstep, openness, wrapRel, xPos,
    listChildren, parseVoice, trayAdd, formatPerms, tilde, matchKind, pathCrumbs, storyAt,
  };
  root.ArchiveCore = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
