//! Arkhive's own search index (specs/005-arkhive-index): file metadata plus the text inside files, in SQLite FTS5.
//! One writer thread owns a write connection; every command reads through its own connection (WAL).

use rusqlite::{params, Connection};
use std::path::Path;

/// One file or folder as the crawler and the watcher see it.
#[derive(Debug, Clone, PartialEq)]
pub struct Meta {
    pub path: String,
    pub name: String,
    pub ext: String,
    pub kind: &'static str, // "file" | "dir"
    pub size: u64,
    pub created: u64,
    pub modified: u64,
    pub mode: u32,
}

/// A search hit: path, score (3 per name word, 1 per word only inside), snippet for content hits.
#[derive(Debug, Clone, PartialEq)]
pub struct Hit {
    pub path: String,
    pub score: u32,
    pub content: bool,
    pub snippet: Option<String>,
}

/// Files whose text the content pass reads (images go to the OCR helper).
pub const TEXT_EXTS: [&str; 30] = [
    "pdf", "docx", "pptx", "xlsx", "txt", "md", "csv", "json", "rs", "py", "ts", "tsx", "js", "jsx", "sql", "rtf", "cpp", "c", "h",
    "swift", "go", "java", "kt", "rb", "html", "css", "toml", "yaml", "yml", "sh",
];
pub const IMAGE_EXTS: [&str; 4] = ["jpg", "jpeg", "png", "heic"];
const BODY_LIMIT: usize = 200_000;

pub fn init(c: &Connection) -> rusqlite::Result<()> {
    c.execute_batch(
        "CREATE TABLE IF NOT EXISTS files(
            id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, name TEXT NOT NULL, ext TEXT NOT NULL, kind TEXT NOT NULL,
            size INTEGER NOT NULL, created INTEGER NOT NULL, modified INTEGER NOT NULL, mode INTEGER NOT NULL,
            gen INTEGER NOT NULL, text_at INTEGER NOT NULL DEFAULT -1);
         CREATE INDEX IF NOT EXISTS files_ext ON files(ext);
         CREATE INDEX IF NOT EXISTS files_modified ON files(modified);
         CREATE INDEX IF NOT EXISTS files_gen ON files(gen);
         CREATE VIRTUAL TABLE IF NOT EXISTS fts USING fts5(name, body, tokenize = 'unicode61 remove_diacritics 2');",
    )
}

/// WAL so the crawler's writes never block the page's reads.
pub fn open(path: &Path) -> rusqlite::Result<Connection> {
    let c = Connection::open(path)?;
    let _: String = c.query_row("PRAGMA journal_mode = WAL", [], |r| r.get(0))?;
    c.execute_batch("PRAGMA synchronous = NORMAL;")?;
    c.busy_timeout(std::time::Duration::from_millis(5000))?;
    init(&c)?;
    Ok(c)
}

/// Terms are validated words (letters and digits), so quoting them is enough.
pub fn fts_query(terms: &[String], column: &str) -> String {
    let words: Vec<String> = terms.iter().map(|t| format!("\"{}\"*", t.replace('"', ""))).collect();
    format!("{column}:({})", words.join(" OR "))
}

/// The words in Office XML: tags dropped, paragraphs on their own lines, entities decoded.
pub fn xml_text(xml: &str) -> String {
    let mut out = String::new();
    let mut rest = xml;
    while let Some(c) = rest.chars().next() {
        if c == '<' {
            let end = rest.find('>').unwrap_or(rest.len() - 1);
            let tag = &rest[1..end];
            if matches!(tag, "/w:p" | "/a:p" | "/si" | "/text:p") {
                out.push('\n');
            }
            rest = &rest[end + 1..];
        } else if c == '&' {
            let end = rest.find(';').filter(|&e| e < 10);
            let ent = end.map(|e| &rest[1..e]).unwrap_or("");
            let ch = match ent {
                "amp" => Some('&'),
                "lt" => Some('<'),
                "gt" => Some('>'),
                "quot" => Some('"'),
                "apos" => Some('\''),
                _ => ent.strip_prefix('#').and_then(|n| {
                    n.strip_prefix('x').map_or_else(|| n.parse().ok(), |h| u32::from_str_radix(h, 16).ok()).and_then(char::from_u32)
                }),
            };
            match (ch, end) {
                (Some(ch), Some(e)) => {
                    out.push(ch);
                    rest = &rest[e + 1..];
                }
                _ => {
                    out.push('&');
                    rest = &rest[1..];
                }
            }
        } else {
            out.push(c);
            rest = &rest[c.len_utf8()..];
        }
    }
    out.lines().map(str::trim).filter(|l| !l.is_empty()).collect::<Vec<_>>().join("\n")
}

fn zip_entry(z: &mut zip::ZipArchive<std::fs::File>, name: &str) -> Option<String> {
    use std::io::Read;
    let mut s = String::new();
    z.by_name(name).ok()?.read_to_string(&mut s).ok()?;
    Some(s)
}

/// The text inside a file, or None when there is none to read (or it cannot be read).
pub fn extract_text(path: &Path) -> Option<String> {
    use std::io::Read;
    let ext = path.extension()?.to_string_lossy().to_lowercase();
    let text = match ext.as_str() {
        "pdf" => {
            if std::fs::metadata(path).ok()?.len() > 50 << 20 {
                return None; // shortcut: very large PDFs are skipped, revisit if owners keep big scanned books
            }
            let p = path.to_path_buf();
            // pdf-extract panics on some malformed files; a bad PDF must not stop the content pass
            std::panic::catch_unwind(move || pdf_extract::extract_text(&p)).ok()?.ok()?
        }
        "docx" | "pptx" | "xlsx" => {
            let mut z = zip::ZipArchive::new(std::fs::File::open(path).ok()?).ok()?;
            match ext.as_str() {
                "docx" => xml_text(&zip_entry(&mut z, "word/document.xml")?),
                "xlsx" => xml_text(&zip_entry(&mut z, "xl/sharedStrings.xml")?),
                _ => {
                    let mut slides: Vec<(u32, String)> = z
                        .file_names()
                        .filter_map(|n| n.ok().map(|n| n.to_string()))
                        .filter_map(|n| Some((n.strip_prefix("ppt/slides/slide")?.strip_suffix(".xml")?.parse().ok()?, n.clone())))
                        .collect();
                    slides.sort();
                    slides.iter().filter_map(|(_, n)| zip_entry(&mut z, n)).map(|x| xml_text(&x)).collect::<Vec<_>>().join("\n")
                }
            }
        }
        e if TEXT_EXTS.contains(&e) => {
            let mut buf = Vec::new();
            std::fs::File::open(path).ok()?.take(1 << 20).read_to_end(&mut buf).ok()?;
            String::from_utf8(buf).ok()?
        }
        _ => return None,
    };
    Some(text.trim().chars().take(BODY_LIMIT).collect())
}

pub fn skip_name(name: &str) -> bool {
    name.starts_with('.') || matches!(name, "Library" | "node_modules" | "target")
}

/// Adds or refreshes rows, marking them seen in `gen`. A changed file has its text read again.
pub fn upsert(c: &Connection, rows: &[Meta], gen: i64) -> rusqlite::Result<()> {
    let tx = c.unchecked_transaction()?;
    for m in rows {
        let old: Option<(i64, i64, i64, String)> = tx
            .query_row("SELECT id, modified, size, name FROM files WHERE path = ?1", [&m.path], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?, r.get(3)?)))
            .ok();
        match old {
            None => {
                tx.execute(
                    "INSERT INTO files(path, name, ext, kind, size, created, modified, mode, gen) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                    params![m.path, m.name, m.ext, m.kind, m.size as i64, m.created as i64, m.modified as i64, m.mode, gen],
                )?;
                tx.execute("INSERT INTO fts(rowid, name, body) VALUES (?1, ?2, '')", params![tx.last_insert_rowid(), m.name])?;
            }
            Some((id, modified, size, name)) => {
                let changed = modified != m.modified as i64 || size != m.size as i64;
                tx.execute(
                    "UPDATE files SET name = ?2, ext = ?3, kind = ?4, size = ?5, created = ?6, modified = ?7, mode = ?8, gen = ?9,
                     text_at = CASE WHEN ?10 THEN -1 ELSE text_at END WHERE id = ?1",
                    params![id, m.name, m.ext, m.kind, m.size as i64, m.created as i64, m.modified as i64, m.mode, gen, changed],
                )?;
                if name != m.name {
                    tx.execute("UPDATE fts SET name = ?2 WHERE rowid = ?1", params![id, m.name])?;
                }
            }
        }
    }
    tx.commit()
}

pub fn set_text(c: &Connection, path: &str, text: &str) -> rusqlite::Result<()> {
    c.execute("UPDATE fts SET body = ?2 WHERE rowid = (SELECT id FROM files WHERE path = ?1)", params![path, text])?;
    c.execute("UPDATE files SET text_at = modified WHERE path = ?1", [path])?;
    Ok(())
}

pub fn remove(c: &Connection, path: &str) -> rusqlite::Result<()> {
    c.execute("DELETE FROM fts WHERE rowid IN (SELECT id FROM files WHERE path = ?1 OR path LIKE ?2)", params![path, format!("{path}/%")])?;
    c.execute("DELETE FROM files WHERE path = ?1 OR path LIKE ?2", params![path, format!("{path}/%")])?;
    Ok(())
}

/// Drops every row the last full walk did not see (deleted while the app was closed).
pub fn prune(c: &Connection, gen: i64) -> rusqlite::Result<usize> {
    c.execute("DELETE FROM fts WHERE rowid IN (SELECT id FROM files WHERE gen < ?1)", [gen])?;
    c.execute("DELETE FROM files WHERE gen < ?1", [gen])
}

fn list(items: &[&str]) -> String {
    items.iter().map(|e| format!("'{e}'")).collect::<Vec<_>>().join(",")
}

/// Newest first, so recent files get their text before old ones.
pub fn needs_text(c: &Connection, limit: usize) -> rusqlite::Result<Vec<(String, String)>> {
    let all: Vec<&str> = TEXT_EXTS.iter().chain(IMAGE_EXTS.iter()).copied().collect();
    let mut st = c.prepare(&format!(
        "SELECT path, ext FROM files WHERE kind = 'file' AND text_at = -1 AND ext IN ({}) ORDER BY modified DESC LIMIT ?1",
        list(&all)
    ))?;
    let rows = st.query_map([limit as i64], |r| Ok((r.get(0)?, r.get(1)?)))?;
    rows.collect()
}

/// `AND ...` for the extension and modified-since filters. Extensions are re-checked here, so only letters and digits reach SQL.
fn filters(exts: &[String], since: Option<u64>) -> String {
    let mut f = String::new();
    let ok: Vec<&str> = exts.iter().map(String::as_str).filter(|e| !e.is_empty() && e.chars().all(|c| c.is_ascii_alphanumeric())).collect();
    if !exts.is_empty() {
        f += &format!(" AND f.kind = 'file' AND f.ext IN ({})", list(&ok));
    }
    if let Some(s) = since {
        f += &format!(" AND f.modified >= {s}");
    }
    f
}

/// 3 points per term that starts a word in the name, else 1 when it starts a word inside the file.
pub fn search(c: &Connection, terms: &[String], exts: &[String], since: Option<u64>, limit: usize) -> rusqlite::Result<Vec<Hit>> {
    use std::collections::{HashMap, HashSet};
    let filt = filters(exts, since);
    if terms.is_empty() {
        // A vault with no keywords (PDF, ALL, THIS WEEK): the files `summary` counts, newest first.
        let lim = i64::try_from(limit).unwrap_or(i64::MAX);
        let mut st = c.prepare_cached(&format!("SELECT path FROM files f WHERE f.kind = 'file'{filt} ORDER BY f.modified DESC LIMIT ?1"))?;
        let rows = st.query_map([lim], |r| Ok(Hit { path: r.get(0)?, score: 0, content: false, snippet: None }))?;
        return rows.collect();
    }
    let ids = |q: String| -> rusqlite::Result<HashSet<i64>> {
        let mut st = c.prepare_cached(&format!("SELECT f.id FROM fts JOIN files f ON f.id = fts.rowid WHERE fts MATCH ?1{filt}"))?;
        let rows = st.query_map([q], |r| r.get(0))?;
        rows.collect()
    };
    let mut scores: HashMap<i64, (u32, bool)> = HashMap::new();
    for t in terms {
        let one = std::slice::from_ref(t);
        let names = ids(fts_query(one, "name"))?;
        for id in &names {
            scores.entry(*id).or_default().0 += 3;
        }
        for id in ids(fts_query(one, "body"))?.difference(&names) {
            let e = scores.entry(*id).or_default();
            e.0 += 1;
            e.1 = true;
        }
    }
    let mut rows: Vec<(i64, u32, bool, String, i64)> = Vec::with_capacity(scores.len());
    for (id, (score, content)) in scores {
        let (path, modified): (String, i64) = c.query_row("SELECT path, modified FROM files WHERE id = ?1", [id], |r| Ok((r.get(0)?, r.get(1)?)))?;
        rows.push((id, score, content, path, modified));
    }
    rows.sort_by(|a, b| b.1.cmp(&a.1).then(b.4.cmp(&a.4)));
    rows.truncate(limit);
    let body = fts_query(terms, "body");
    rows.into_iter()
        .map(|(id, score, content, path, _)| {
            let snippet = if content {
                c.query_row("SELECT snippet(fts, 1, '', '', '…', 24) FROM fts WHERE fts MATCH ?1 AND rowid = ?2", params![body, id], |r| r.get(0)).ok()
            } else {
                None
            };
            Ok(Hit { path, score, content, snippet })
        })
        .collect()
}

/// (count, total bytes, newest path) of the files matching extensions and/or a modified-since time.
pub fn summary(c: &Connection, exts: &[String], since: Option<u64>) -> rusqlite::Result<(u64, u64, Option<String>)> {
    let filt = filters(exts, since);
    let (n, bytes): (i64, i64) =
        c.query_row(&format!("SELECT count(*), coalesce(sum(size), 0) FROM files f WHERE f.kind = 'file'{filt}"), [], |r| Ok((r.get(0)?, r.get(1)?)))?;
    let newest = c.query_row(&format!("SELECT path FROM files f WHERE f.kind = 'file'{filt} ORDER BY modified DESC LIMIT 1"), [], |r| r.get(0)).ok();
    Ok((n as u64, bytes as u64, newest))
}

/// (files indexed, files still waiting for their text).
pub fn counts(c: &Connection) -> rusqlite::Result<(u64, u64)> {
    let all: Vec<&str> = TEXT_EXTS.iter().chain(IMAGE_EXTS.iter()).copied().collect();
    c.query_row(
        &format!("SELECT count(*), coalesce(sum(text_at = -1 AND ext IN ({})), 0) FROM files WHERE kind = 'file'", list(&all)),
        [],
        |r| Ok((r.get::<_, i64>(0)? as u64, r.get::<_, i64>(1)? as u64)),
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }
    fn db() -> Connection {
        let c = Connection::open_in_memory().unwrap();
        init(&c).unwrap();
        c
    }
    fn meta(path: &str, modified: u64, size: u64) -> Meta {
        let name = path.rsplit('/').next().unwrap().to_string();
        let ext = name.rsplit_once('.').map(|(_, e)| e.to_lowercase()).unwrap_or_default();
        Meta { path: path.into(), name, ext, kind: "file", size, created: 0, modified, mode: 0o644 }
    }

    #[test]
    fn opens_in_wal_with_a_busy_timeout() {
        let d = std::env::temp_dir().join(format!("arkhive_idx_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let c = open(&d.join("arkhive_real_index.db")).unwrap();
        let mode: String = c.query_row("PRAGMA journal_mode", [], |r| r.get(0)).unwrap();
        assert_eq!(mode, "wal");
        let t: i64 = c.query_row("PRAGMA busy_timeout", [], |r| r.get(0)).unwrap();
        assert_eq!(t, 5000);
    }

    #[test]
    fn fts_query_is_prefix_words_joined_by_or_in_one_column() {
        assert_eq!(fts_query(&s(&["blood", "cbc"]), "body"), r#"body:("blood"* OR "cbc"*)"#);
        assert_eq!(fts_query(&s(&["blood"]), "name"), r#"name:("blood"*)"#);
    }

    #[test]
    fn xml_text_keeps_words_and_breaks_paragraphs() {
        let x = r#"<w:p><w:r><w:t>Hemoglobin</w:t></w:r><w:r><w:t xml:space="preserve"> 13.8 g/dL</w:t></w:r></w:p><w:p><w:t>A &amp; B &lt;ok&gt; &#233;</w:t></w:p>"#;
        assert_eq!(xml_text(x), "Hemoglobin 13.8 g/dL\nA & B <ok> é");
    }

    #[test]
    fn extracts_docx_pptx_xlsx_and_text_files() {
        let d = std::env::temp_dir().join(format!("arkhive_ext_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        let zipped = |name: &str, entries: &[(&str, &str)]| {
            let f = std::fs::File::create(d.join(name)).unwrap();
            let mut z = zip::ZipWriter::new(f);
            for (e, body) in entries {
                z.start_file(*e, zip::write::SimpleFileOptions::default()).unwrap();
                z.write_all(body.as_bytes()).unwrap();
            }
            z.finish().unwrap();
        };
        zipped("a.docx", &[("word/document.xml", "<w:p><w:t>platelet count</w:t></w:p>")]);
        zipped("b.pptx", &[("ppt/slides/slide2.xml", "<a:p><a:t>second</a:t></a:p>"), ("ppt/slides/slide1.xml", "<a:p><a:t>first</a:t></a:p>")]);
        zipped("c.xlsx", &[("xl/sharedStrings.xml", "<si><t>Serum</t></si><si><t>Ferritin</t></si>")]);
        std::fs::write(d.join("d.rs"), "fn blood() {}").unwrap();
        std::fs::write(d.join("e.bin"), [0u8, 159, 146, 150]).unwrap();
        assert_eq!(extract_text(&d.join("a.docx")).unwrap(), "platelet count");
        assert_eq!(extract_text(&d.join("b.pptx")).unwrap(), "first\nsecond");
        assert_eq!(extract_text(&d.join("c.xlsx")).unwrap(), "Serum\nFerritin");
        assert_eq!(extract_text(&d.join("d.rs")).unwrap(), "fn blood() {}");
        assert_eq!(extract_text(&d.join("e.bin")), None);
        assert_eq!(extract_text(&d.join("missing.docx")), None);
    }

    #[test]
    fn skips_hidden_and_noise_folders() {
        for n in [".git", ".DS_Store", "Library", "node_modules", "target"] {
            assert!(skip_name(n), "{n}");
        }
        assert!(!skip_name("Documents"));
    }

    #[test]
    fn search_ranks_name_hits_above_content_hits_and_gives_snippets() {
        let c = db();
        upsert(&c, &[meta("/h/Downloads/Scan_Nov_10.pdf", 5, 10), meta("/h/Documents/CBC_Blood_Panel.pdf", 3, 20), meta("/h/a.txt", 1, 1)], 1).unwrap();
        set_text(&c, "/h/Downloads/Scan_Nov_10.pdf", "PATHOLOGY REPORT. Serum ferritin 18 ng/mL. Haemoglobin 11.2 g/dL.").unwrap();
        let hits = search(&c, &s(&["blood", "serum"]), &[], None, 300).unwrap();
        assert_eq!(hits.len(), 2);
        assert_eq!(hits[0].path, "/h/Documents/CBC_Blood_Panel.pdf");
        assert_eq!((hits[0].score, hits[0].content), (3, false));
        assert_eq!(hits[1].path, "/h/Downloads/Scan_Nov_10.pdf");
        assert_eq!((hits[1].score, hits[1].content), (1, true));
        assert!(hits[1].snippet.as_deref().unwrap().contains("Serum ferritin"));
        // filters: extension and modified-since
        assert!(search(&c, &s(&["blood"]), &s(&["docx"]), None, 300).unwrap().is_empty());
        assert_eq!(search(&c, &s(&["serum"]), &[], Some(4), 300).unwrap().len(), 1);
        assert!(search(&c, &s(&["serum"]), &[], Some(6), 300).unwrap().is_empty());
    }

    #[test]
    fn upsert_keeps_text_until_the_file_changes_and_prune_drops_unseen_files() {
        let c = db();
        upsert(&c, &[meta("/h/a.txt", 1, 1), meta("/h/b.txt", 1, 1)], 1).unwrap();
        assert_eq!(needs_text(&c, 10).unwrap().len(), 2);
        set_text(&c, "/h/a.txt", "lipid panel").unwrap();
        assert_eq!(needs_text(&c, 10).unwrap(), vec![("/h/b.txt".to_string(), "txt".to_string())]);
        upsert(&c, &[meta("/h/a.txt", 1, 1)], 2).unwrap(); // seen again, unchanged
        assert_eq!(search(&c, &s(&["lipid"]), &[], None, 10).unwrap().len(), 1);
        upsert(&c, &[meta("/h/a.txt", 9, 1)], 2).unwrap(); // changed: text must be read again
        assert!(needs_text(&c, 10).unwrap().iter().any(|(p, _)| p == "/h/a.txt"));
        assert_eq!(prune(&c, 2).unwrap(), 1); // b.txt was not seen in generation 2
        assert_eq!(counts(&c).unwrap().0, 1);
        remove(&c, "/h/a.txt").unwrap();
        assert_eq!(counts(&c).unwrap().0, 0);
        assert!(search(&c, &s(&["lipid"]), &[], None, 10).unwrap().is_empty());
    }

    #[test]
    fn summary_counts_files_by_extension_and_age_with_the_newest() {
        let c = db();
        upsert(&c, &[meta("/h/a.pdf", 1, 100), meta("/h/b.pdf", 7, 50), meta("/h/c.png", 3, 5)], 1).unwrap();
        assert_eq!(summary(&c, &s(&["pdf"]), None).unwrap(), (2, 150, Some("/h/b.pdf".into())));
        assert_eq!(summary(&c, &[], Some(3)).unwrap(), (2, 55, Some("/h/b.pdf".into())));
        assert_eq!(summary(&c, &s(&["zip"]), None).unwrap(), (0, 0, None));
    }

    // Owner report 2026-11-15: vaults showed counts but opened empty. A vault with no keywords lists the files it counts.
    #[test]
    fn search_without_terms_lists_the_files_summary_counts_newest_first() {
        let c = db();
        let dir = Meta { kind: "dir", ..meta("/h/Projects", 9, 0) };
        upsert(&c, &[meta("/h/a.pdf", 1, 100), meta("/h/b.pdf", 7, 50), meta("/h/c.png", 3, 5), dir], 1).unwrap();
        let paths = |h: Vec<Hit>| h.into_iter().map(|h| h.path).collect::<Vec<_>>();
        assert_eq!(paths(search(&c, &[], &s(&["pdf"]), None, 10).unwrap()), ["/h/b.pdf", "/h/a.pdf"]);
        assert_eq!(paths(search(&c, &[], &[], Some(3), 10).unwrap()), ["/h/b.pdf", "/h/c.png"]);
        assert_eq!(paths(search(&c, &[], &[], None, 1).unwrap()), ["/h/b.pdf"]);
        assert!(search(&c, &[], &s(&["zip"]), None, 10).unwrap().is_empty());
    }
}
