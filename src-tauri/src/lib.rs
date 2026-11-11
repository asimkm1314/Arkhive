use serde::Serialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
#[cfg(target_os = "macos")]
use std::process::{Command, Stdio};
use std::time::{SystemTime, UNIX_EPOCH};

const MAX_HITS: usize = 300;
// Measured: 6 parallel `mdimport -t -d3` ≈ 1.5 s, 24 ≈ 5.3 s; keeps a search near the ~2 s target.
const SNIPPET_FILES: usize = 6;

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
}

// ---------- validation (trust boundary: everything from the webview) ----------

fn valid_term(t: &str) -> bool {
    (1..=40).contains(&t.chars().count()) && t.chars().all(char::is_alphanumeric)
}

fn valid_ext(e: &str) -> bool {
    (1..=10).contains(&e.len()) && e.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit())
}

fn validate(terms: &[String], exts: &[String], days: Option<u32>) -> Result<(), String> {
    if terms.len() > 16 || exts.len() > 20 {
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

// ---------- Spotlight query + text helpers ----------

/// Terms and exts are validated alphanumerics, so they cannot break out of the quoted values.
#[cfg(any(target_os = "macos", test))]
fn build_query(term: Option<&str>, exts: &[String], days: Option<u32>) -> String {
    let mut parts = vec![];
    if let Some(t) = term {
        parts.push(format!(r#"(kMDItemFSName == "*{t}*"cd || kMDItemTextContent == "{t}*"cdw)"#));
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

fn hit(path: &str, score: u32) -> Option<FileHit> {
    let meta = std::fs::metadata(path).ok().filter(|m| m.is_file())?;
    let p = Path::new(path);
    Some(FileHit {
        name: p.file_name()?.to_string_lossy().into(),
        ext: p.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default(),
        path: path.into(),
        size: meta.len(),
        created: ms(meta.created()),
        modified: ms(meta.modified()),
        snippet: None,
        score,
    })
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
            eprintln!("archiveos: mdimport failed for {path}: {e}");
            None
        }
    }
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
                let in_name = Path::new(&p).file_name().is_some_and(|n| n.to_string_lossy().to_lowercase().contains(t.as_str()));
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
            let name = path.file_name().unwrap_or_default().to_string_lossy().to_lowercase();
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
                if name.contains(t.as_str()) {
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

// ---------- commands (contract: specs/001-archiveos/contracts/commands.md) ----------

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![search_files, open_file, reveal_file, quick_look])
        .run(tauri::generate_context!())
        .expect("error while running ArchiveOS");
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
    }

    #[test]
    fn query_for_term() {
        assert_eq!(
            build_query(Some("blood"), &[], None),
            r#"(kMDItemFSName == "*blood*"cd || kMDItemTextContent == "blood*"cdw)"#
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
            r#"(kMDItemFSName == "*cbc*"cd || kMDItemTextContent == "cbc*"cdw) && (kMDItemFSName == "*.pdf"c) && kMDItemFSContentChangeDate >= $time.today(-30)"#
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

    #[test]
    fn check_path_requires_existing_absolute_path() {
        let f = std::env::temp_dir().join("archiveos_check_path_test.txt");
        std::fs::write(&f, "x").unwrap();
        assert!(check_path(f.to_str().unwrap()).is_ok());
        assert_eq!(check_path("relative/file.pdf"), Err("not an absolute path".into()));
        assert!(check_path("/definitely/not/here.pdf").unwrap_err().starts_with("file not found"));
        std::fs::remove_file(f).unwrap();
    }
}
