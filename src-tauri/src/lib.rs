use serde::{Deserialize, Serialize};
use std::collections::HashMap;
#[cfg(target_os = "macos")]
use std::collections::HashSet;
use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_HITS: usize = 300;
// Measured: 6 parallel `mdimport -t -d3` ≈ 1.5 s, 24 ≈ 5.3 s; keeps a search near the ~2 s target.
const SNIPPET_FILES: usize = 6;
/// Where folder browsing starts, inside the home folder.
#[cfg(any(target_os = "macos", test))]
const ROOTS: [&str; 4] = ["Desktop", "Documents", "Downloads", "Pictures"];

#[derive(Serialize, Debug)]
struct FileHit {
    name: String,
    ext: String,
    path: String,
    size: u64,
    created: u64,
    modified: u64,
    snippet: Option<String>,
    score: u32,
    kind: &'static str, // "file" | "dir"
    mode: u32,          // Unix permission bits
}

/// One vault's rules, as the page defines them (same fields as `search_files`).
#[derive(Deserialize, Debug)]
struct VaultQuery {
    terms: Vec<String>,
    exts: Vec<String>,
    days: Option<u32>,
}

#[derive(Serialize, Debug)]
struct VaultSummary {
    count: u64,
    bytes: u64,
    newest: Option<FileHit>,
}

#[derive(Serialize, Debug)]
struct Listing {
    entries: Vec<FileHit>,
    total: usize, // before the MAX_HITS cut
}

// ---------- validation (trust boundary: everything from the webview) ----------

/// Letters and digits, plus any non-ASCII non-space character (combining marks in Devanagari etc.).
/// Every ASCII character that is not a letter or digit is out, so a term can't close the quoted query value.
fn word_char(c: char) -> bool {
    c.is_alphanumeric() || (!c.is_ascii() && !c.is_whitespace() && !c.is_control())
}

fn valid_term(t: &str) -> bool {
    (1..=40).contains(&t.chars().count()) && t.chars().all(word_char)
}

/// Same rule as core.js scoreFile: the (lowercase) term starts a word in the file name.
fn name_has_word(name: &str, term: &str) -> bool {
    name.to_lowercase().split(|c| !word_char(c)).any(|w| w.starts_with(term))
}

fn valid_ext(e: &str) -> bool {
    (1..=10).contains(&e.len()) && e.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
}

fn validate(terms: &[String], exts: &[String], days: Option<u32>) -> Result<(), String> {
    if terms.len() > 16 || exts.len() > 40 {
        return Err("too many terms or extensions".into());
    }
    if let Some(t) = terms.iter().find(|t| !valid_term(t)) {
        return Err(format!("invalid term: {t}"));
    }
    if let Some(e) = exts.iter().find(|e| !valid_ext(e)) {
        return Err(format!("invalid extension: {e}"));
    }
    if days.is_some_and(|d| !(1..=3650).contains(&d)) {
        return Err("invalid days".into());
    }
    if terms.is_empty() && exts.is_empty() && days.is_none() {
        return Err("nothing to search for".into());
    }
    Ok(())
}

fn check_path(p: &str) -> Result<PathBuf, String> {
    let path = Path::new(p);
    if !path.is_absolute() {
        return Err("not an absolute path".into());
    }
    if !path.exists() {
        return Err(format!("file not found: {p}"));
    }
    Ok(path.to_path_buf())
}

fn check_file(p: &str) -> Result<PathBuf, String> {
    let path = check_path(p)?;
    if !path.is_file() {
        return Err(format!("not a file: {p}"));
    }
    Ok(path)
}

/// A bare file name the owner typed for a rename.
fn valid_file_name(name: &str) -> Result<(), String> {
    if name.trim().is_empty() {
        return Err("a name is required".into());
    }
    if name.len() > 255 {
        return Err("the name is too long".into());
    }
    if name.contains('/') || name.contains(':') {
        return Err("a name cannot contain / or :".into());
    }
    if name.starts_with('.') {
        return Err("a name cannot start with a dot".into());
    }
    if name.chars().any(char::is_control) {
        return Err("a name cannot contain control characters".into());
    }
    Ok(())
}

#[cfg(any(target_os = "macos", test))]
fn valid_thumb_size(size: u32) -> bool {
    (64..=1024).contains(&size)
}

fn check_dir(p: &str) -> Result<PathBuf, String> {
    let path = check_path(p)?;
    if !path.is_dir() {
        return Err(format!("not a folder: {p}"));
    }
    Ok(path)
}

// ---------- Spotlight query + text helpers ----------

/// Terms and exts are validated alphanumerics, so they cannot break out of the quoted values.
#[cfg(any(target_os = "macos", test))]
fn build_query(term: Option<&str>, exts: &[String], days: Option<u32>) -> String {
    let mut parts = vec![];
    if let Some(t) = term {
        parts.push(format!(r#"(kMDItemFSName == "{t}*"cdw || kMDItemTextContent == "{t}*"cdw)"#));
    }
    if !exts.is_empty() {
        let any: Vec<String> = exts.iter().map(|e| format!(r#"kMDItemFSName == "*.{e}"c"#)).collect();
        parts.push(format!("({})", any.join(" || ")));
    }
    if let Some(d) = days {
        parts.push(format!("kMDItemFSContentChangeDate >= $time.today(-{d})"));
    }
    parts.join(" && ")
}

fn skip_path(p: &str) -> bool {
    p.split('/').any(|seg| seg.starts_with('.') || matches!(seg, "Library" | "node_modules" | "target"))
}

/// Decodes the escapes `mdimport -d3` uses in string values: \n \t \" \\ \Uxxxx.
#[cfg(any(target_os = "macos", test))]
fn decode_md_string(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut it = s.chars();
    while let Some(c) = it.next() {
        if c != '\\' {
            out.push(c);
            continue;
        }
        match it.next() {
            Some('n') => out.push('\n'),
            Some('t') => out.push('\t'),
            Some('U') => {
                let hex: String = it.by_ref().take(4).collect();
                out.extend(u32::from_str_radix(&hex, 16).ok().and_then(char::from_u32));
            }
            Some(other) => out.push(other),
            None => {}
        }
    }
    out
}

#[cfg(any(target_os = "macos", test))]
fn extract_text_content(dump: &str) -> Option<String> {
    dump.lines()
        .find_map(|l| l.trim().strip_prefix("kMDItemTextContent = \"")?.strip_suffix("\";"))
        .map(decode_md_string)
}

/// ~160 chars around the first term that starts a word (same rule as core.js snippetFor).
fn snippet_around(text: &str, terms: &[String]) -> Option<String> {
    let chars: Vec<char> = text.chars().take(200_000).collect();
    let lower: Vec<char> = chars.iter().map(|c| c.to_lowercase().next().unwrap_or(*c)).collect();
    let terms: Vec<Vec<char>> = terms.iter().map(|t| t.chars().collect()).collect();
    let at = (0..lower.len()).find(|&i| {
        (i == 0 || !lower[i - 1].is_alphanumeric()) && terms.iter().any(|t| lower[i..].starts_with(t))
    })?;
    let (start, end) = (at.saturating_sub(60), (at + 100).min(chars.len()));
    let body: String = chars[start..end].iter().collect();
    let body = body.split_whitespace().collect::<Vec<_>>().join(" ");
    Some(format!("{}{}{}", if start > 0 { "…" } else { "" }, body, if end < chars.len() { "…" } else { "" }))
}

fn ms(t: std::io::Result<SystemTime>) -> u64 {
    t.ok().and_then(|t| t.duration_since(UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis() as u64)
}

fn record(path: &Path, score: u32) -> Option<FileHit> {
    use std::os::unix::fs::PermissionsExt;
    let meta = std::fs::metadata(path).ok()?;
    let dir = meta.is_dir();
    Some(FileHit {
        name: path.file_name()?.to_string_lossy().into(),
        ext: if dir { String::new() } else { path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default() },
        path: path.to_string_lossy().into(),
        size: if dir { 0 } else { meta.len() },
        created: ms(meta.created()),
        modified: ms(meta.modified()),
        snippet: None,
        score,
        kind: if dir { "dir" } else { "file" },
        mode: meta.permissions().mode() & 0o777,
    })
}

fn hit(path: &str, score: u32) -> Option<FileHit> {
    record(Path::new(path), score).filter(|h| h.kind == "file")
}

// ---------- folders, drops, export ----------

/// What is directly inside `dir`: no dot-names, folders first, then by name.
fn list_entries(dir: &Path) -> Result<Listing, String> {
    let read = std::fs::read_dir(dir).map_err(|e| format!("cannot read {}: {e}", dir.display()))?;
    let mut entries: Vec<FileHit> = read
        .flatten()
        .filter(|e| !e.file_name().to_string_lossy().starts_with('.'))
        .filter_map(|e| record(&e.path(), 0))
        .collect();
    entries.sort_by(|a, b| (b.kind == "dir").cmp(&(a.kind == "dir")).then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase())));
    let total = entries.len();
    entries.truncate(MAX_HITS);
    Ok(Listing { entries, total })
}

#[cfg(target_os = "macos")]
fn home() -> Result<PathBuf, String> {
    std::env::var("HOME").map(PathBuf::from).map_err(|_| "HOME not set".to_string())
}

#[cfg(target_os = "macos")]
fn roots(_app: &tauri::AppHandle) -> Result<Listing, String> {
    let home = home()?;
    let entries: Vec<FileHit> = ROOTS.iter().filter_map(|d| record(&home.join(d), 0)).collect();
    Ok(Listing { total: entries.len(), entries })
}

#[cfg(not(target_os = "macos"))]
fn roots(app: &tauri::AppHandle) -> Result<Listing, String> {
    use tauri::Manager;
    list_entries(&app.path().document_dir().map_err(|e| format!("documents folder unavailable: {e}"))?)
}

fn stat_list(paths: &[String]) -> Result<Vec<FileHit>, String> {
    if paths.is_empty() {
        return Err("nothing dropped".into());
    }
    if paths.len() > MAX_HITS {
        return Err("too many items".into());
    }
    paths.iter().map(|p| record(&check_path(p)?, 0).ok_or_else(|| format!("file not found: {p}"))).collect()
}

/// Count, total size and newest of the paths that are files. Folders and vanished paths are left out, as on the shelf.
#[cfg(any(target_os = "macos", test))]
fn summarize(paths: impl Iterator<Item = String>) -> VaultSummary {
    let mut s = VaultSummary { count: 0, bytes: 0, newest: None };
    for h in paths.filter_map(|p| hit(&p, 0)) {
        s.count += 1;
        s.bytes += h.size;
        if s.newest.as_ref().is_none_or(|n| h.modified > n.modified) {
            s.newest = Some(h);
        }
    }
    s
}

/// Renames a file within its folder. Never replaces another file.
fn rename_in_place(path: &str, new_name: &str) -> Result<PathBuf, String> {
    let from = check_file(path)?;
    valid_file_name(new_name)?;
    let old = from.file_name().unwrap_or_default().to_string_lossy().to_string();
    if old == new_name {
        return Ok(from);
    }
    let to = from.parent().ok_or("this file has no folder")?.join(new_name);
    // A case-only change points at the same file on a case-insensitive disk, so `exists` is true and that is fine.
    // shortcut: check-then-rename is two steps; nothing else writes here in a single-user app. Use an exclusive rename (renamex_np) if that changes.
    if to.exists() && old.to_lowercase() != new_name.to_lowercase() {
        return Err(format!("a file named {new_name} already exists here"));
    }
    std::fs::rename(&from, &to).map_err(|e| format!("rename failed: {e}"))?;
    Ok(to)
}

/// The path travels as `item 1 of argv`, so no file name can change what the script does.
#[cfg(any(target_os = "macos", test))]
fn trash_args(path: &Path) -> Vec<String> {
    let script = ["on run argv", "tell application \"Finder\" to delete (POSIX file (item 1 of argv) as alias)", "end run"];
    let mut args: Vec<String> = script.iter().flat_map(|line| ["-e".to_string(), line.to_string()]).collect();
    args.push(path.to_string_lossy().into());
    args
}

/// First name in `dest` not taken: "a.txt", "a 2.txt", "a 3.txt", …
fn free_name(dest: &Path, src: &Path) -> PathBuf {
    let stem = src.file_stem().unwrap_or_default().to_string_lossy();
    let ext = src.extension().map(|e| format!(".{}", e.to_string_lossy())).unwrap_or_default();
    (1u32..)
        .map(|n| dest.join(if n == 1 { format!("{stem}{ext}") } else { format!("{stem} {n}{ext}") }))
        .find(|p| !p.exists())
        .expect("an unbounded range always yields a free name")
}

/// Copies `paths` into a newly created "Arkhive Export[ N]" folder under `parent`. Originals are only read.
#[cfg(any(target_os = "macos", test))]
fn export_into(parent: &Path, paths: &[String]) -> Result<PathBuf, String> {
    if paths.is_empty() {
        return Err("nothing to export".into());
    }
    if paths.len() > MAX_HITS {
        return Err("too many items".into());
    }
    // Check everything before creating anything, so bad input leaves no empty folder behind.
    let files = paths
        .iter()
        .map(|p| check_file(p))
        .collect::<Result<Vec<PathBuf>, String>>()?;
    // create_dir fails when the name exists, so an earlier export is never reused or overwritten.
    let mut n = 1;
    let dest = loop {
        let d = parent.join(if n == 1 { "Arkhive Export".to_string() } else { format!("Arkhive Export {n}") });
        match std::fs::create_dir(&d) {
            Ok(()) => break d,
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists && n < 10_000 => n += 1,
            Err(e) => return Err(format!("cannot create {}: {e}", d.display())),
        }
    };
    for (i, f) in files.iter().enumerate() {
        std::fs::copy(f, free_name(&dest, f)).map_err(|e| {
            format!("export failed at {}: {e} ({i} of {} copied to {})", f.display(), files.len(), dest.display())
        })?;
    }
    Ok(dest)
}

/// Moves a file into `dir`. Never replaces a file there ("x.txt" becomes "x 2.txt").
fn move_into(path: &str, dir: &str) -> Result<PathBuf, String> {
    let from = check_file(path)?;
    let dest = check_dir(dir)?;
    let same = |a: &Path, b: &Path| a.canonicalize().ok() == b.canonicalize().ok();
    if from.parent().is_some_and(|p| same(p, &dest)) {
        return Err("the file is already in that folder".into());
    }
    let to = free_name(&dest, &from);
    match std::fs::rename(&from, &to) {
        Ok(()) => Ok(to),
        // another disk: copy, and remove the original only once the copy is complete
        Err(e) if e.raw_os_error() == Some(18) => {
            std::fs::copy(&from, &to).map_err(|e| format!("move failed while copying: {e}"))?;
            std::fs::remove_file(&from).map_err(|e| format!("copied to {}, but the original could not be removed: {e}", to.display()))?;
            Ok(to)
        }
        Err(e) => Err(format!("move failed: {e}")),
    }
}

/// The text around the first matching word in one file, for a match that came back without a snippet.
fn snippet_for(path: &str, terms: &[String]) -> Result<Option<String>, String> {
    if terms.is_empty() {
        return Err("no terms".into());
    }
    validate(terms, &[], None)?;
    let file = check_file(path)?;
    let terms: Vec<String> = terms.iter().map(|t| t.to_lowercase()).collect();
    Ok(file_text(&file.to_string_lossy()).and_then(|t| snippet_around(&t, &terms)))
}

/// osascript arguments for the system folder dialog. The prompt is picked by key, never taken from the page.
fn folder_dialog_args(key: &str) -> Result<Vec<String>, String> {
    let prompt = match key {
        "move" => "Move the file to this folder",
        "export" => "Export copies into this folder",
        _ => return Err("unknown folder prompt".into()),
    };
    Ok(vec!["-e".into(), format!("POSIX path of (choose folder with prompt \"{prompt}\")")])
}

/// Relevance desc, then newest first; keeps the top MAX_HITS. `bool` = matched by contents.
fn rank(scores: HashMap<String, (u32, bool)>) -> Vec<(FileHit, bool)> {
    let mut hits: Vec<(FileHit, bool)> =
        scores.into_iter().filter_map(|(p, (s, c))| Some((hit(&p, s)?, c))).collect();
    hits.sort_by(|a, b| b.0.score.cmp(&a.0.score).then(b.0.modified.cmp(&a.0.modified)));
    hits.truncate(MAX_HITS);
    hits
}

// ---------- macOS: Spotlight ----------

#[cfg(target_os = "macos")]
fn spotlight(query: &str) -> Result<Vec<String>, String> {
    let home = std::env::var("HOME").map_err(|_| "spotlight failed: HOME not set".to_string())?;
    let out = Command::new("/usr/bin/mdfind")
        .args(["-onlyin", &home, query])
        .output()
        .map_err(|e| format!("spotlight failed: {e}"))?;
    if !out.status.success() {
        return Err(format!("spotlight failed: {}", String::from_utf8_lossy(&out.stderr).trim()));
    }
    Ok(String::from_utf8_lossy(&out.stdout).lines().filter(|p| !skip_path(p)).map(String::from).collect())
}

#[cfg(target_os = "macos")]
fn file_text(path: &str) -> Option<String> {
    let out = Command::new("/usr/bin/mdimport").args(["-t", "-d3", path]).output();
    match out {
        Ok(o) => extract_text_content(&String::from_utf8_lossy(&o.stdout))
            .or_else(|| extract_text_content(&String::from_utf8_lossy(&o.stderr))),
        Err(e) => {
            eprintln!("arkhive: mdimport failed for {path}: {e}");
            None
        }
    }
}

/// Off macOS: the file's own text, when it is text.
#[cfg(not(target_os = "macos"))]
fn file_text(path: &str) -> Option<String> {
    use std::io::Read;
    let mut buf = Vec::new();
    std::fs::File::open(path).ok()?.take(256 * 1024).read_to_end(&mut buf).ok()?;
    String::from_utf8(buf).ok()
}

#[cfg(target_os = "macos")]
fn search(_app: &tauri::AppHandle, terms: &[String], exts: &[String], days: Option<u32>) -> Result<Vec<FileHit>, String> {
    spotlight_search(terms, exts, days)
}

#[cfg(target_os = "macos")]
fn spotlight_search(terms: &[String], exts: &[String], days: Option<u32>) -> Result<Vec<FileHit>, String> {
    let mut scores: HashMap<String, (u32, bool)> = HashMap::new();
    if terms.is_empty() {
        for p in spotlight(&build_query(None, exts, days))? {
            scores.insert(p, (0, false));
        }
    } else {
        // Spotlight has no relevance score: one query per term, score = how many terms hit (name hits weigh 3).
        let results: Vec<Result<Vec<String>, String>> = std::thread::scope(|s| {
            let jobs: Vec<_> = terms.iter().map(|t| s.spawn(move || spotlight(&build_query(Some(t), exts, days)))).collect();
            jobs.into_iter().map(|j| j.join().unwrap_or_else(|_| Err("spotlight thread panicked".into()))).collect()
        });
        for (t, paths) in terms.iter().zip(results) {
            for p in paths? {
                let in_name = Path::new(&p).file_name().is_some_and(|n| name_has_word(&n.to_string_lossy(), t));
                let e = scores.entry(p).or_default();
                if in_name {
                    e.0 += 3;
                } else {
                    e.0 += 1;
                    e.1 = true;
                }
            }
        }
    }
    let mut hits = rank(scores);
    std::thread::scope(|s| {
        for (h, _) in hits.iter_mut().filter(|(_, content)| *content).take(SNIPPET_FILES) {
            s.spawn(move || h.snippet = file_text(&h.path).and_then(|t| snippet_around(&t, terms)));
        }
    });
    Ok(hits.into_iter().map(|(h, _)| h).collect())
}

// ---------- iOS (and other platforms): walk the app's Documents folder ----------

#[cfg(not(target_os = "macos"))]
fn search(app: &tauri::AppHandle, terms: &[String], exts: &[String], days: Option<u32>) -> Result<Vec<FileHit>, String> {
    use tauri::Manager;
    // shortcut: plain-text contents only and no folder picker (tauri-plugin-dialog can't pick folders on iOS); see tasks T901.
    const TEXT: [&str; 12] = ["txt", "md", "csv", "json", "rs", "py", "ts", "tsx", "js", "sql", "rtf", "cpp"];
    let root = app.path().document_dir().map_err(|e| format!("documents folder unavailable: {e}"))?;
    let cutoff = days.map(|d| ms(Ok(SystemTime::now())).saturating_sub(d as u64 * 86_400_000));
    let mut scores = HashMap::new();
    let mut texts = HashMap::new();
    let mut stack = vec![root];
    while let Some(dir) = stack.pop() {
        let entries = std::fs::read_dir(&dir).map_err(|e| format!("cannot read {}: {e}", dir.display()))?;
        for entry in entries.flatten() {
            let path = entry.path();
            let p = path.to_string_lossy().to_string();
            if skip_path(&p) {
                continue;
            }
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            let ext = path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default();
            let meta = entry.metadata().map_err(|e| format!("cannot stat {p}: {e}"))?;
            if (!exts.is_empty() && !exts.contains(&ext)) || cutoff.is_some_and(|c| ms(meta.modified()) < c) {
                continue;
            }
            let name = path.file_name().unwrap_or_default().to_string_lossy().to_string();
            let text = if TEXT.contains(&ext.as_str()) && !terms.is_empty() {
                use std::io::Read;
                let mut buf = Vec::new();
                std::fs::File::open(&path).and_then(|f| f.take(256 * 1024).read_to_end(&mut buf)).ok();
                String::from_utf8_lossy(&buf).to_string()
            } else {
                String::new()
            };
            let (mut score, mut content) = (0, false);
            for t in terms {
                if name_has_word(&name, t) {
                    score += 3;
                } else if snippet_around(&text, std::slice::from_ref(t)).is_some() {
                    score += 1;
                    content = true;
                }
            }
            if terms.is_empty() || score > 0 {
                if content {
                    texts.insert(p.clone(), text);
                }
                scores.insert(p, (score, content));
            }
        }
    }
    let mut hits = rank(scores);
    for (h, content) in hits.iter_mut().take(SNIPPET_FILES) {
        if *content {
            h.snippet = texts.get(&h.path).and_then(|t| snippet_around(t, terms));
        }
    }
    Ok(hits.into_iter().map(|(h, _)| h).collect())
}

// ---------- native actions ----------

#[cfg(target_os = "macos")]
fn native(tool: &str, flags: &[&str], path: &str, wait: bool) -> Result<(), String> {
    let p = check_path(path)?; // absolute, so it can never be read as a flag
    let mut cmd = Command::new(tool);
    cmd.args(flags).arg(&p).stdout(Stdio::null()).stderr(Stdio::piped());
    if !wait {
        return cmd.stderr(Stdio::null()).spawn().map(|_| ()).map_err(|e| format!("{tool} failed: {e}"));
    }
    let out = cmd.output().map_err(|e| format!("{tool} failed: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!("{tool} failed: {}", String::from_utf8_lossy(&out.stderr).trim()))
    }
}

#[cfg(not(target_os = "macos"))]
fn native(_tool: &str, _flags: &[&str], path: &str, _wait: bool) -> Result<(), String> {
    check_path(path)?;
    Err("not available on iOS yet".into())
}

#[cfg(target_os = "macos")]
fn vault_one(_app: &tauri::AppHandle, q: &VaultQuery) -> Result<VaultSummary, String> {
    let (exts, days) = (&q.exts, q.days);
    if q.terms.is_empty() {
        return Ok(summarize(spotlight(&build_query(None, exts, days))?.into_iter()));
    }
    let terms: Vec<String> = q.terms.iter().map(|t| t.to_lowercase()).collect();
    let results: Vec<Result<Vec<String>, String>> = std::thread::scope(|s| {
        let jobs: Vec<_> = terms.iter().map(|t| s.spawn(move || spotlight(&build_query(Some(t), exts, days)))).collect();
        jobs.into_iter().map(|j| j.join().unwrap_or_else(|_| Err("spotlight thread panicked".into()))).collect()
    });
    let mut all = HashSet::new();
    for paths in results {
        all.extend(paths?);
    }
    Ok(summarize(all.into_iter()))
}

#[cfg(not(target_os = "macos"))]
fn vault_one(app: &tauri::AppHandle, q: &VaultQuery) -> Result<VaultSummary, String> {
    // shortcut: reuses the Documents walk, which keeps the newest 300; enough for the app's own folder, revisit with T901.
    let terms: Vec<String> = q.terms.iter().map(|t| t.to_lowercase()).collect();
    let hits = search(app, &terms, &q.exts, q.days)?;
    Ok(VaultSummary { count: hits.len() as u64, bytes: hits.iter().map(|h| h.size).sum(), newest: hits.into_iter().max_by_key(|h| h.modified) })
}

/// A preview image from the system's Quick Look, for any file type the Mac can preview.
#[cfg(target_os = "macos")]
fn quicklook_png(path: &Path, size: u32) -> Result<Vec<u8>, String> {
    use std::sync::atomic::{AtomicU64, Ordering};
    static NEXT: AtomicU64 = AtomicU64::new(0);
    // qlmanage names its output after the file, so every request gets a folder of its own.
    let dir = std::env::temp_dir().join(format!("arkhive_ql_{}_{}", std::process::id(), NEXT.fetch_add(1, Ordering::Relaxed)));
    std::fs::create_dir_all(&dir).map_err(|e| format!("preview failed: {e}"))?;
    // shortcut: no timeout; qlmanage has been quick on every type tried. Add one if a file type is found to hang it.
    let ran = Command::new("/usr/bin/qlmanage")
        .args(["-t", "-s", &size.to_string(), "-o"])
        .arg(&dir)
        .arg(path)
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status();
    let png = std::fs::read(dir.join(format!("{}.png", path.file_name().unwrap_or_default().to_string_lossy())));
    let _ = std::fs::remove_dir_all(&dir);
    ran.map_err(|e| format!("preview failed: {e}"))?;
    png.map_err(|_| "no preview for this file".to_string())
}

/// Finder does the move, so the file lands in the Trash with Put Back. A plain move into ~/.Trash is blocked by macOS.
#[cfg(target_os = "macos")]
fn trash(path: &str) -> Result<(), String> {
    let file = check_file(path)?;
    let out = Command::new("/usr/bin/osascript")
        .args(trash_args(&file))
        .output()
        .map_err(|e| format!("could not move to the Trash: {e}"))?;
    if out.status.success() {
        Ok(())
    } else {
        Err(format!("could not move to the Trash: {}", String::from_utf8_lossy(&out.stderr).trim()))
    }
}

#[cfg(not(target_os = "macos"))]
fn trash(path: &str) -> Result<(), String> {
    check_file(path)?;
    Err("not available on iOS yet".into())
}

#[cfg(target_os = "macos")]
fn export(paths: &[String], dest: Option<&str>) -> Result<String, String> {
    let parent = match dest {
        Some(d) => check_dir(d)?,
        None => home()?.join("Downloads"),
    };
    let dest = export_into(&parent, paths)?.to_string_lossy().to_string();
    native("/usr/bin/open", &[], &dest, true).map_err(|e| format!("exported to {dest}, but could not show it: {e}"))?;
    Ok(dest)
}

#[cfg(not(target_os = "macos"))]
fn export(_paths: &[String], _dest: Option<&str>) -> Result<String, String> {
    Err("not available on iOS yet".into())
}

// ---------- commands (contracts: specs/001-archiveos and specs/002-arkhive, contracts/commands.md) ----------

#[tauri::command]
async fn search_files(app: tauri::AppHandle, terms: Vec<String>, exts: Vec<String>, days: Option<u32>) -> Result<Vec<FileHit>, String> {
    validate(&terms, &exts, days)?;
    let terms: Vec<String> = terms.iter().map(|t| t.to_lowercase()).collect();
    tauri::async_runtime::spawn_blocking(move || search(&app, &terms, &exts, days))
        .await
        .map_err(|e| format!("search crashed: {e}"))?
}

#[tauri::command]
fn open_file(path: String) -> Result<(), String> {
    native("/usr/bin/open", &[], &path, true)
}

#[tauri::command]
fn reveal_file(path: String) -> Result<(), String> {
    native("/usr/bin/open", &["-R"], &path, true)
}

#[tauri::command]
fn quick_look(path: String) -> Result<(), String> {
    native("/usr/bin/qlmanage", &["-p"], &path, false)
}

#[tauri::command]
async fn list_dir(app: tauri::AppHandle, path: Option<String>) -> Result<Listing, String> {
    tauri::async_runtime::spawn_blocking(move || match path {
        Some(p) => list_entries(&check_dir(&p)?),
        None => roots(&app),
    })
    .await
    .map_err(|e| format!("listing crashed: {e}"))?
}

#[tauri::command]
fn stat_paths(paths: Vec<String>) -> Result<Vec<FileHit>, String> {
    stat_list(&paths)
}

#[tauri::command]
async fn vault_summary(app: tauri::AppHandle, queries: Vec<VaultQuery>) -> Result<Vec<VaultSummary>, String> {
    if queries.is_empty() {
        return Err("nothing to count".into());
    }
    if queries.len() > 20 {
        return Err("too many queries".into());
    }
    for q in &queries {
        validate(&q.terms, &q.exts, q.days)?;
    }
    tauri::async_runtime::spawn_blocking(move || {
        let app = &app;
        std::thread::scope(|s| {
            let jobs: Vec<_> = queries.iter().map(|q| s.spawn(move || vault_one(app, q))).collect();
            jobs.into_iter().map(|j| j.join().unwrap_or_else(|_| Err("summary thread panicked".into()))).collect()
        })
    })
    .await
    .map_err(|e| format!("summary crashed: {e}"))?
}

#[cfg(target_os = "macos")]
#[tauri::command]
async fn thumbnail(path: String, size: u32) -> Result<tauri::ipc::Response, String> {
    let file = check_path(&path)?;
    if !valid_thumb_size(size) {
        return Err("invalid thumbnail size".into());
    }
    tauri::async_runtime::spawn_blocking(move || quicklook_png(&file, size))
        .await
        .map_err(|e| format!("preview crashed: {e}"))?
        .map(tauri::ipc::Response::new)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn thumbnail(path: String, size: u32) -> Result<tauri::ipc::Response, String> {
    check_path(&path)?;
    let _ = size;
    Err("not available on iOS yet".into())
}

#[tauri::command]
fn rename_file(path: String, new_name: String) -> Result<FileHit, String> {
    let to = rename_in_place(&path, new_name.trim())?;
    record(&to, 0).ok_or_else(|| format!("renamed, but could not read {}", to.display()))
}

#[tauri::command]
async fn trash_file(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || trash(&path)).await.map_err(|e| format!("trash crashed: {e}"))?
}

#[tauri::command]
async fn export_files(paths: Vec<String>, dest: Option<String>) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || export(&paths, dest.as_deref())).await.map_err(|e| format!("export crashed: {e}"))?
}

#[tauri::command]
fn move_file(path: String, dir: String) -> Result<FileHit, String> {
    let to = move_into(&path, &dir)?;
    record(&to, 0).ok_or_else(|| format!("moved, but could not read {}", to.display()))
}

#[tauri::command]
async fn snippet(path: String, terms: Vec<String>) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || snippet_for(&path, &terms)).await.map_err(|e| format!("snippet crashed: {e}"))?
}

/// The system folder dialog. `None` when the owner cancels.
#[cfg(target_os = "macos")]
#[tauri::command]
async fn choose_folder(prompt: String) -> Result<Option<String>, String> {
    let args = folder_dialog_args(&prompt)?;
    tauri::async_runtime::spawn_blocking(move || {
        let out = Command::new("/usr/bin/osascript").args(&args).output().map_err(|e| format!("folder dialog failed: {e}"))?;
        if out.status.success() {
            let path = String::from_utf8_lossy(&out.stdout).trim().trim_end_matches('/').to_string();
            return Ok(Some(if path.is_empty() { "/".into() } else { path }));
        }
        let err = String::from_utf8_lossy(&out.stderr);
        if err.contains("-128") { Ok(None) } else { Err(format!("folder dialog failed: {}", err.trim())) }
    })
    .await
    .map_err(|e| format!("folder dialog crashed: {e}"))?
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn choose_folder(prompt: String) -> Result<Option<String>, String> {
    folder_dialog_args(&prompt)?;
    Err("not available on iOS yet".into())
}

/// async so it runs off the main thread: the drag itself must start on the main thread, and we wait for it.
#[cfg(target_os = "macos")]
#[tauri::command]
async fn start_native_drag(window: tauri::WebviewWindow, path: String) -> Result<(), String> {
    let file = check_path(&path)?;
    let (tx, rx) = std::sync::mpsc::channel();
    let win = window.clone();
    window
        .run_on_main_thread(move || {
            let icon = drag::Image::Raw(include_bytes!("../icons/128x128.png").to_vec());
            let started = drag::start_drag(&win, drag::DragItem::Files(vec![file]), icon, |_result, _cursor| {}, drag::Options::default());
            let _ = tx.send(started.map_err(|e| format!("drag failed: {e}")));
        })
        .map_err(|e| format!("drag failed: {e}"))?;
    rx.recv().map_err(|e| format!("drag failed: {e}"))?
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
async fn start_native_drag(path: String) -> Result<(), String> {
    check_path(&path)?;
    Err("not available on iOS yet".into())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            search_files, open_file, reveal_file, quick_look, list_dir, stat_paths, export_files, start_native_drag, vault_summary, thumbnail,
            rename_file, trash_file, move_file, snippet, choose_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running Arkhive");
}

#[cfg(test)]
mod tests {
    use super::*;

    fn s(v: &[&str]) -> Vec<String> {
        v.iter().map(|x| x.to_string()).collect()
    }

    #[test]
    fn terms_must_be_short_alphanumeric() {
        assert!(valid_term("blood"));
        assert!(valid_term("hämoglobin"));
        assert!(!valid_term(""));
        assert!(!valid_term("blood\""));
        assert!(!valid_term("a b"));
        assert!(!valid_term("*"));
        assert!(!valid_term(&"x".repeat(41)));
    }

    #[test]
    fn exts_must_be_lowercase_alphanumeric() {
        assert!(valid_ext("pdf"));
        assert!(valid_ext("7z"));
        assert!(!valid_ext("PDF"));
        assert!(!valid_ext("p.df"));
        assert!(!valid_ext(""));
        assert!(!valid_ext("abcdefghijk"));
    }

    #[test]
    fn validate_limits() {
        assert!(validate(&s(&["blood"]), &[], None).is_ok());
        assert!(validate(&[], &s(&["pdf"]), None).is_ok());
        assert!(validate(&[], &[], Some(7)).is_ok());
        assert_eq!(validate(&[], &[], None), Err("nothing to search for".into()));
        assert!(validate(&s(&["ok", "bad\""]), &[], None).unwrap_err().starts_with("invalid term"));
        assert!(validate(&[], &s(&["P"]), None).unwrap_err().starts_with("invalid extension"));
        let many: Vec<String> = (0..17).map(|i| format!("t{i}")).collect();
        assert!(validate(&many, &[], None).is_err());
        assert!(validate(&[], &[], Some(0)).is_err());
        assert!(validate(&[], &[], Some(4000)).is_err());
        // the ALL FILES vault sends 25 extensions; 40 is the cap
        let exts: Vec<String> = (0..40).map(|i| format!("e{i}")).collect();
        assert!(validate(&[], &exts, None).is_ok());
        let exts: Vec<String> = (0..41).map(|i| format!("e{i}")).collect();
        assert!(validate(&[], &exts, None).is_err());
    }

    #[test]
    fn query_for_term() {
        assert_eq!(
            build_query(Some("blood"), &[], None),
            r#"(kMDItemFSName == "blood*"cdw || kMDItemTextContent == "blood*"cdw)"#
        );
    }

    #[test]
    fn query_for_exts_and_days() {
        assert_eq!(
            build_query(None, &s(&["pdf", "docx"]), None),
            r#"(kMDItemFSName == "*.pdf"c || kMDItemFSName == "*.docx"c)"#
        );
        assert_eq!(build_query(None, &[], Some(7)), "kMDItemFSContentChangeDate >= $time.today(-7)");
        assert_eq!(
            build_query(Some("cbc"), &s(&["pdf"]), Some(30)),
            r#"(kMDItemFSName == "cbc*"cdw || kMDItemTextContent == "cbc*"cdw) && (kMDItemFSName == "*.pdf"c) && kMDItemFSContentChangeDate >= $time.today(-30)"#
        );
    }

    #[test]
    fn decodes_spotlight_strings() {
        assert_eq!(
            decode_md_string(r#"a\nb \"q\" back\\slash \U25c7 end"#),
            "a\nb \"q\" back\\slash \u{25c7} end"
        );
    }

    #[test]
    fn extracts_text_content_line() {
        let dump = "    kMDItemContentType = \"com.adobe.pdf\";\n    kMDItemTextContent = \"Serum \\\"ferritin\\\"\\nlow\";\n    kMDItemTitle = \"x\";\n";
        assert_eq!(extract_text_content(dump), Some("Serum \"ferritin\"\nlow".into()));
        assert_eq!(extract_text_content("kMDItemTitle = \"x\";"), None);
    }

    #[test]
    fn snippet_cuts_around_first_word_start_hit() {
        let text = format!("{} Serum ferritin low {}", "a".repeat(300), "b".repeat(300));
        let snip = snippet_around(&text, &s(&["serum"])).unwrap();
        assert!(snip.starts_with('…') && snip.ends_with('…'));
        assert!(snip.contains("Serum ferritin"));
        assert!(snip.chars().count() < 200);
        assert_eq!(snippet_around("observe rum", &s(&["rum"])), Some("observe rum".into()));
        assert_eq!(snippet_around("serum only", &s(&["rum"])), None);
        assert_eq!(snippet_around("nothing", &s(&["serum"])), None);
    }

    #[test]
    fn skips_hidden_and_noise_paths() {
        assert!(skip_path("/Users/a/.cache/x.pdf"));
        assert!(skip_path("/Users/a/Library/Mail/x.pdf"));
        assert!(skip_path("/Users/a/code/node_modules/x/readme.md"));
        assert!(skip_path("/Users/a/code/app/target/debug/x.json"));
        assert!(!skip_path("/Users/a/Documents/Medical/CBC.pdf"));
    }

    /// Live check against real Spotlight. Run with `cargo test -- --ignored`.
    /// Spotlight's indexing delay varies (measured 4–30+ s), so wait on a cheap name query first.
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore]
    fn live_spotlight_finds_file_by_contents() {
        let name = format!("archiveos_live_{}.txt", std::process::id());
        let f = PathBuf::from(std::env::var("HOME").unwrap()).join(&name);
        std::fs::write(&f, "Quarterly checkup. Haemoglobin 11.2 g/dL, serum ferritin low.").unwrap();
        let path = f.to_string_lossy().to_string();
        let indexed = (0..120).any(|_| {
            std::thread::sleep(std::time::Duration::from_secs(1));
            spotlight(&format!(r#"kMDItemFSName == "{name}""#)).unwrap().contains(&path)
        });
        let hits = spotlight_search(&s(&["blood", "haemoglobin", "serum"]), &[], None);
        std::fs::remove_file(&f).unwrap();
        assert!(indexed, "Spotlight did not index the test file within 120 s");
        let h = hits.unwrap().into_iter().find(|h| h.path == path).expect("indexed file missing from search results");
        assert_eq!(h.score, 2, "two content hits, no name hit");
        assert!(h.snippet.unwrap().contains("Haemoglobin"));
    }

    // ---------- 002 Arkhive ----------

    /// A fresh, empty temp folder per test.
    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("arkhive_{name}_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    fn p(path: &Path) -> String {
        path.to_string_lossy().to_string()
    }

    #[test]
    fn terms_allow_non_latin_words_but_no_ascii_punctuation() {
        assert!(valid_term("रक्त"), "Devanagari with a combining mark");
        assert!(valid_term("血"));
        assert!(!valid_term("blood\""));
        assert!(!valid_term("a\\b"));
        assert!(!valid_term("a\u{3000}b"), "ideographic space is whitespace");
    }

    #[test]
    fn name_match_starts_at_a_word() {
        assert!(name_has_word("Lease_2026.pdf", "lease"));
        assert!(name_has_word("Lab_Bloodwork.jpg", "blood"));
        assert!(!name_has_word("Release_Notes.md", "lease"));
        assert!(!name_has_word("Amritsar_Trip.jpg", "mri"));
    }

    #[test]
    fn lists_a_folder_dirs_first_without_hidden_names() {
        use std::os::unix::fs::PermissionsExt;
        let d = tmp("list");
        std::fs::write(d.join("b.txt"), "x").unwrap();
        std::fs::write(d.join(".secret"), "x").unwrap();
        std::fs::write(d.join("a.PDF"), "xyz").unwrap();
        std::fs::create_dir(d.join("Zeta")).unwrap();
        std::fs::set_permissions(d.join("a.PDF"), std::fs::Permissions::from_mode(0o640)).unwrap();
        let l = list_entries(&d).unwrap();
        let names: Vec<&str> = l.entries.iter().map(|e| e.name.as_str()).collect();
        assert_eq!(names, ["Zeta", "a.PDF", "b.txt"]);
        assert_eq!(l.total, 3);
        assert_eq!((l.entries[0].kind, l.entries[0].ext.as_str(), l.entries[0].size), ("dir", "", 0));
        assert_eq!((l.entries[1].kind, l.entries[1].ext.as_str(), l.entries[1].size), ("file", "pdf", 3));
        assert_eq!(l.entries[1].mode, 0o640);
        std::fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn listing_is_cut_at_the_cap_and_reports_the_total() {
        let d = tmp("cap");
        for i in 0..(MAX_HITS + 5) {
            std::fs::write(d.join(format!("f{i:04}.txt")), "").unwrap();
        }
        let l = list_entries(&d).unwrap();
        assert_eq!((l.entries.len(), l.total), (MAX_HITS, MAX_HITS + 5));
        assert_eq!(l.entries[0].name, "f0000.txt");
        std::fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn check_dir_requires_an_existing_absolute_folder() {
        let d = tmp("checkdir");
        std::fs::write(d.join("f.txt"), "x").unwrap();
        assert!(check_dir(&p(&d)).is_ok());
        assert_eq!(check_dir("relative/dir"), Err("not an absolute path".into()));
        assert!(check_dir("/definitely/not/here").unwrap_err().starts_with("file not found"));
        assert!(check_dir(&p(&d.join("f.txt"))).unwrap_err().starts_with("not a folder"));
        std::fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn stat_keeps_order_and_validates_every_path() {
        let d = tmp("stat");
        std::fs::write(d.join("b.txt"), "x").unwrap();
        std::fs::create_dir(d.join("A")).unwrap();
        let got = stat_list(&[p(&d.join("b.txt")), p(&d.join("A"))]).unwrap();
        assert_eq!(got.iter().map(|h| (h.name.as_str(), h.kind)).collect::<Vec<_>>(), [("b.txt", "file"), ("A", "dir")]);
        assert_eq!(stat_list(&[]).unwrap_err(), "nothing dropped");
        assert_eq!(stat_list(&["rel.txt".into()]).unwrap_err(), "not an absolute path");
        assert!(stat_list(&[p(&d.join("b.txt")), "/definitely/not/here".into()]).unwrap_err().starts_with("file not found"));
        std::fs::remove_dir_all(d).unwrap();
    }

    // ---------- 003 Arkhive prism ----------

    #[test]
    fn browsing_starts_at_four_folders() {
        assert_eq!(ROOTS, ["Desktop", "Documents", "Downloads", "Pictures"]);
    }

    #[test]
    fn summarize_counts_files_only_sums_bytes_and_finds_the_newest() {
        let d = tmp("summary");
        std::fs::write(d.join("old.txt"), "123").unwrap();
        std::fs::write(d.join("new.txt"), "12345").unwrap();
        std::fs::create_dir(d.join("Folder")).unwrap();
        let hour_ago = SystemTime::now() - std::time::Duration::from_secs(3600);
        std::fs::File::options().write(true).open(d.join("old.txt")).unwrap().set_modified(hour_ago).unwrap();
        let paths = [p(&d.join("old.txt")), p(&d.join("new.txt")), p(&d.join("Folder")), "/definitely/not/here".to_string()];
        let s = summarize(paths.into_iter());
        assert_eq!((s.count, s.bytes), (2, 8), "the folder and the missing path are not files");
        assert_eq!(s.newest.unwrap().name, "new.txt");
        let none = summarize(std::iter::empty());
        assert_eq!((none.count, none.bytes, none.newest.is_none()), (0, 0, true));
        std::fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn file_names_are_checked_before_a_rename() {
        for ok in ["Report.pdf", "a", "Blood panel (final).pdf", "रक्त.txt"] {
            assert!(valid_file_name(ok).is_ok(), "{ok}");
        }
        assert_eq!(valid_file_name("").unwrap_err(), "a name is required");
        assert_eq!(valid_file_name("   ").unwrap_err(), "a name is required");
        assert_eq!(valid_file_name("a/b.pdf").unwrap_err(), "a name cannot contain / or :");
        assert_eq!(valid_file_name("a:b.pdf").unwrap_err(), "a name cannot contain / or :");
        assert_eq!(valid_file_name(".hidden").unwrap_err(), "a name cannot start with a dot");
        assert_eq!(valid_file_name("..").unwrap_err(), "a name cannot start with a dot");
        assert_eq!(valid_file_name("a\nb").unwrap_err(), "a name cannot contain control characters");
        assert_eq!(valid_file_name(&"x".repeat(256)).unwrap_err(), "the name is too long");
    }

    #[test]
    fn rename_changes_only_the_name_and_never_replaces_a_file() {
        let d = tmp("rename");
        std::fs::write(d.join("a.txt"), "A").unwrap();
        std::fs::write(d.join("b.txt"), "B").unwrap();
        std::fs::create_dir(d.join("Folder")).unwrap();

        let c = rename_in_place(&p(&d.join("a.txt")), "c.txt").unwrap();
        assert_eq!(c, d.join("c.txt"));
        assert_eq!(std::fs::read_to_string(&c).unwrap(), "A");
        assert!(!d.join("a.txt").exists());

        let taken = rename_in_place(&p(&c), "b.txt").unwrap_err();
        assert!(taken.starts_with("a file named b.txt already exists"), "{taken}");
        assert_eq!(std::fs::read_to_string(d.join("b.txt")).unwrap(), "B", "the other file is untouched");
        assert!(c.exists(), "the file we tried to rename is still there");

        let upper = rename_in_place(&p(&c), "C.txt").unwrap();
        assert!(std::fs::read_dir(&d).unwrap().flatten().any(|e| e.file_name() == "C.txt"), "a case-only change is allowed");
        assert!(rename_in_place(&p(&upper), "C.txt").is_ok(), "the same name is a no-op");

        assert_eq!(rename_in_place(&p(&upper), "x/y.txt").unwrap_err(), "a name cannot contain / or :");
        assert!(rename_in_place(&p(&d.join("Folder")), "X").unwrap_err().starts_with("not a file"));
        assert!(rename_in_place("/definitely/not/here.txt", "x.txt").unwrap_err().starts_with("file not found"));
        std::fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn trash_passes_the_path_as_an_argument_never_inside_the_script() {
        let a = trash_args(Path::new("/tmp/it's \"odd\".txt"));
        assert_eq!(a.last().unwrap(), "/tmp/it's \"odd\".txt");
        assert!(a[..a.len() - 1].iter().all(|s| !s.contains("odd")), "{a:?}");
        assert!(a.iter().any(|s| s.contains("item 1 of argv")));
    }

    #[test]
    fn thumbnail_size_is_bounded() {
        assert!(valid_thumb_size(64) && valid_thumb_size(1024));
        assert!(!valid_thumb_size(63) && !valid_thumb_size(1025));
    }

    /// Real Quick Look on a file that ships with the repo.
    #[cfg(target_os = "macos")]
    #[test]
    fn quick_look_returns_a_png_for_a_real_file() {
        let icon = Path::new(env!("CARGO_MANIFEST_DIR")).join("icons/128x128.png");
        let png = quicklook_png(&icon, 128).unwrap();
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    }

    /// Moves one temp file to the real Trash through Finder (macOS may ask to allow it). Run with `cargo test -- --ignored live_trash`.
    #[cfg(target_os = "macos")]
    #[test]
    #[ignore]
    fn live_trash_moves_a_file_to_the_trash() {
        let d = tmp("trash");
        let f = d.join(format!("arkhive_trash_test_{}.txt", std::process::id()));
        std::fs::write(&f, "safe to delete").unwrap();
        trash(&p(&f)).unwrap();
        assert!(!f.exists(), "the file should have left its folder");
        std::fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn export_copies_into_a_new_numbered_folder_and_never_overwrites() {
        let d = tmp("export");
        let (src, dl) = (d.join("src"), d.join("dl"));
        std::fs::create_dir_all(src.join("sub")).unwrap();
        std::fs::create_dir_all(&dl).unwrap();
        std::fs::write(src.join("a.txt"), "A").unwrap();
        std::fs::write(src.join("sub/a.txt"), "B").unwrap();
        let both = [p(&src.join("a.txt")), p(&src.join("sub/a.txt"))];

        let out = export_into(&dl, &both).unwrap();
        assert_eq!(out, dl.join("Arkhive Export"));
        assert_eq!(std::fs::read_to_string(out.join("a.txt")).unwrap(), "A");
        assert_eq!(std::fs::read_to_string(out.join("a 2.txt")).unwrap(), "B", "repeated name is numbered");
        assert_eq!(std::fs::read_to_string(src.join("a.txt")).unwrap(), "A", "original untouched");

        let again = export_into(&dl, &both[..1]).unwrap();
        assert_eq!(again, dl.join("Arkhive Export 2"), "an existing export folder is never reused");
        std::fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn export_rejects_bad_input_before_creating_anything() {
        let d = tmp("exportbad");
        std::fs::create_dir(d.join("Folder")).unwrap();
        assert_eq!(export_into(&d, &[]).unwrap_err(), "nothing to export");
        assert!(export_into(&d, &[p(&d.join("Folder"))]).unwrap_err().starts_with("not a file"));
        assert!(export_into(&d, &["/definitely/not/here.pdf".into()]).unwrap_err().starts_with("file not found"));
        assert!(!d.join("Arkhive Export").exists(), "no folder left behind");
        std::fs::remove_dir_all(d).unwrap();
    }

    #[test]
    fn check_path_requires_existing_absolute_path() {
        let f = std::env::temp_dir().join("archiveos_check_path_test.txt");
        std::fs::write(&f, "x").unwrap();
        assert!(check_path(f.to_str().unwrap()).is_ok());
        assert_eq!(check_path("relative/file.pdf"), Err("not an absolute path".into()));
        assert!(check_path("/definitely/not/here.pdf").unwrap_err().starts_with("file not found"));
        std::fs::remove_file(f).unwrap();
    }

    // ---------- 004 follow-ups (T047) ----------

    #[test]
    fn move_into_moves_and_never_replaces_a_file() {
        let d = tmp("move");
        std::fs::create_dir(d.join("a")).unwrap();
        std::fs::create_dir(d.join("b")).unwrap();
        std::fs::write(d.join("a/x.txt"), "moved").unwrap();
        std::fs::write(d.join("b/x.txt"), "kept").unwrap();
        let to = move_into(&p(&d.join("a/x.txt")), &p(&d.join("b"))).unwrap();
        assert_eq!(to, d.join("b/x 2.txt"));
        assert_eq!(std::fs::read_to_string(&to).unwrap(), "moved");
        assert_eq!(std::fs::read_to_string(d.join("b/x.txt")).unwrap(), "kept");
        assert!(!d.join("a/x.txt").exists());
    }

    #[test]
    fn move_into_refuses_the_same_folder_a_missing_folder_and_a_folder_as_source() {
        let d = tmp("move_refuse");
        std::fs::write(d.join("x.txt"), "x").unwrap();
        assert_eq!(move_into(&p(&d.join("x.txt")), &p(&d)), Err("the file is already in that folder".into()));
        assert!(move_into(&p(&d.join("x.txt")), &p(&d.join("nope"))).unwrap_err().starts_with("file not found"));
        std::fs::create_dir(d.join("sub")).unwrap();
        assert!(move_into(&p(&d.join("sub")), &p(&d)).unwrap_err().starts_with("not a file"));
        assert!(d.join("x.txt").exists());
    }

    #[test]
    fn snippet_for_checks_terms_and_the_file_first() {
        assert!(snippet_for("/no/such/file.txt", &s(&["blood"])).unwrap_err().starts_with("file not found"));
        let d = tmp("snippet");
        std::fs::write(d.join("a.txt"), "x").unwrap();
        assert!(snippet_for(&p(&d.join("a.txt")), &s(&["bad\""])).unwrap_err().starts_with("invalid term"));
        assert!(snippet_for(&p(&d.join("a.txt")), &[]).is_err());
    }

    #[test]
    fn folder_dialog_prompts_are_fixed_text_chosen_by_key() {
        let a = folder_dialog_args("move").unwrap();
        assert_eq!(a[0], "-e");
        assert!(a[1].contains("choose folder with prompt \"Move the file to this folder\""));
        assert!(folder_dialog_args("export").unwrap()[1].contains("Export copies"));
        assert!(folder_dialog_args("\" & do shell script \"x").is_err());
    }
}
