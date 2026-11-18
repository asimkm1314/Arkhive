//! Keeps the index in step with the Mac: a two-phase walk at launch, a content pass that never ends
//! (new and changed files get their text), and an FSEvents watcher for changes made in Finder.

use crate::index::{self, Meta};
use rusqlite::Connection;
use std::path::{Path, PathBuf};

/// Hidden files, ~/Library and dependency folders stay out (the latter are still browsable folder by folder).
pub fn skip(name: &str) -> bool {
    index::skip_name(name)
}

fn ms(t: std::io::Result<std::time::SystemTime>) -> u64 {
    t.ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_millis() as u64)
}

pub fn meta_of(path: &Path) -> Option<Meta> {
    use std::os::unix::fs::PermissionsExt;
    let md = std::fs::symlink_metadata(path).ok()?;
    if md.file_type().is_symlink() {
        return None;
    }
    let name = path.file_name()?.to_string_lossy().to_string();
    let dir = md.is_dir() && !crate::is_package(&name); // an app or the Photos library is one item, like in Finder
    Some(Meta {
        ext: if dir { String::new() } else { path.extension().map(|e| e.to_string_lossy().to_lowercase()).unwrap_or_default() },
        path: path.to_string_lossy().to_string(),
        name,
        kind: if dir { "dir" } else { "file" },
        size: if dir { 0 } else { md.len() },
        created: ms(md.created()),
        modified: ms(md.modified()),
        mode: md.permissions().mode() & 0o777,
    })
}

/// Everything under `dir` (not `dir` itself), `depth` levels down (None: all), handing batches to `flush`.
pub fn walk(dir: &Path, depth: Option<u32>, out: &mut Vec<Meta>, flush: &mut dyn FnMut(&mut Vec<Meta>)) {
    let Ok(entries) = std::fs::read_dir(dir) else { return }; // unreadable (privacy prompt refused): skipped, the access check reports it
    for e in entries.flatten() {
        let name = e.file_name().to_string_lossy().to_string();
        if skip(&name) {
            continue;
        }
        let Some(m) = meta_of(&e.path()) else { continue };
        let is_dir = m.kind == "dir";
        out.push(m);
        if out.len() >= 2000 {
            flush(out);
        }
        if is_dir && depth != Some(0) { // packages come back as files, so they are never walked into
            walk(&e.path(), depth.map(|d| d - 1), out, flush);
        }
    }
}

/// Brings the index up to date for paths FSEvents reported: present ones are (re)read, missing ones removed.
/// iCloud Drive sits inside ~/Library, which is otherwise left out.
pub fn icloud(home: &Path) -> PathBuf {
    home.join("Library/Mobile Documents/com~apple~CloudDocs")
}

pub fn apply_changes(c: &Connection, home: &Path, paths: &[PathBuf], gen: i64) -> rusqlite::Result<usize> {
    let mut rows = vec![];
    let mut n = 0;
    let cloud = icloud(home);
    for p in paths {
        let Ok(rel) = p.strip_prefix(&cloud).or_else(|_| p.strip_prefix(home)) else { continue };
        if rel.components().any(|s| skip(&s.as_os_str().to_string_lossy())) {
            continue;
        }
        match meta_of(p) {
            Some(m) => rows.push(m),
            None if !p.exists() => {
                index::remove(c, &p.to_string_lossy())?;
                n += 1;
            }
            None => {}
        }
    }
    n += rows.len();
    index::upsert(c, &rows, gen)?;
    Ok(n)
}

// ---------- runtime: three background threads ----------

use std::sync::atomic::{AtomicBool, AtomicI64, AtomicU64, Ordering};
use std::sync::Arc;
use tauri::Emitter;

/// Shared by the commands: where the index is and how far it has got.
pub struct Indexer {
    pub db: PathBuf,
    pub ready: AtomicBool,        // Phase 1 done (or a warm index from last time)
    pub content_done: AtomicBool, // nothing waiting for its text
    gen: AtomicI64,
    last_emit: AtomicU64,
}

impl Indexer {
    pub fn conn(&self) -> Result<Connection, String> {
        index::open(&self.db).map_err(|e| format!("index unavailable: {e}"))
    }
    fn emit(&self, app: &tauri::AppHandle, event: &str, force: bool) {
        let now = ms(Ok(std::time::SystemTime::now()));
        if force || now.saturating_sub(self.last_emit.swap(now, Ordering::Relaxed)) > 2000 {
            let counts = self.conn().ok().and_then(|c| index::counts(&c).ok()).unwrap_or((0, 0));
            let _ = app.emit(event, counts);
        }
    }
}

fn log(what: &str, e: impl std::fmt::Display) {
    eprintln!("arkhive index: {what}: {e}");
}

/// Starts the crawler, the content pass and the watcher. Errors are logged; the app keeps Spotlight as a fallback.
pub fn start(app: tauri::AppHandle, home: PathBuf, db: PathBuf) -> Arc<Indexer> {
    let ix = Arc::new(Indexer {
        db,
        ready: AtomicBool::new(false),
        content_done: AtomicBool::new(false),
        gen: AtomicI64::new(ms(Ok(std::time::SystemTime::now())) as i64),
        last_emit: AtomicU64::new(0),
    });
    let (a, h, i) = (app.clone(), home.clone(), ix.clone());
    std::thread::spawn(move || crawl(&a, &h, &i));
    let (a, i) = (app.clone(), ix.clone());
    std::thread::spawn(move || content_pass(&a, &i));
    let (a, h, i) = (app, home, ix.clone());
    std::thread::spawn(move || watch(&a, &h, &i));
    ix
}

fn crawl(app: &tauri::AppHandle, home: &Path, ix: &Indexer) {
    let c = match ix.conn() {
        Ok(c) => c,
        Err(e) => return log("open", e),
    };
    let gen = ix.gen.load(Ordering::Relaxed);
    let mut flush = |rows: &mut Vec<Meta>| {
        if let Err(e) = index::upsert(&c, rows, gen) {
            log("write", e);
        }
        rows.clear();
    };
    if index::counts(&c).is_ok_and(|(n, _)| n > 0) {
        ix.ready.store(true, Ordering::Relaxed); // warm index from the last launch: usable at once
        ix.emit(app, "fs-index-ready", true);
    }
    // Phase 1: where most documents live, three levels down
    let mut rows = vec![];
    for root in ["Desktop", "Documents", "Downloads", "Pictures"] {
        walk(&home.join(root), Some(3), &mut rows, &mut flush);
    }
    flush(&mut rows);
    ix.ready.store(true, Ordering::Relaxed);
    ix.emit(app, "fs-index-ready", true);
    // then all of the home folder, and drop what is gone
    if let Ok(entries) = std::fs::read_dir(home) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().to_string();
            if skip(&name) {
                continue;
            }
            if let Some(m) = meta_of(&e.path()) {
                let dir = m.kind == "dir";
                rows.push(m);
                if dir {
                    walk(&e.path(), None, &mut rows, &mut flush);
                }
            }
        }
    }
    // iCloud Drive, and the apps in /Applications (one item each)
    walk(&icloud(home), None, &mut rows, &mut flush);
    walk(Path::new("/Applications"), Some(1), &mut rows, &mut flush);
    flush(&mut rows);
    match index::prune(&c, gen) {
        Ok(n) if n > 0 => eprintln!("arkhive index: {n} entries removed that no longer exist"),
        Ok(_) => {}
        Err(e) => log("prune", e),
    }
    ix.emit(app, "fs-index-updated", true);
}

/// The OCR helper (ocr/main.swift): one image path per line in, one line of text out.
struct Ocr(Option<(std::process::Child, std::io::BufReader<std::process::ChildStdout>)>, bool);

impl Ocr {
    fn read(&mut self, path: &str) -> Option<String> {
        use std::io::{BufRead, Write};
        if path.contains('\n') || self.1 {
            return None;
        }
        if self.0.is_none() {
            let helper = std::env::current_exe().ok()?.with_file_name("arkhive-ocr");
            let spawned = std::process::Command::new(&helper)
                .stdin(std::process::Stdio::piped())
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::null())
                .spawn();
            match spawned {
                Ok(mut child) => {
                    let out = std::io::BufReader::new(child.stdout.take()?);
                    self.0 = Some((child, out));
                }
                Err(e) => {
                    self.1 = true; // no helper in this build: images keep their names only
                    log("ocr helper", e);
                    return None;
                }
            }
        }
        let (child, out) = self.0.as_mut()?;
        let mut line = String::new();
        let ok = writeln!(child.stdin.as_mut()?, "{path}").is_ok() && out.read_line(&mut line).is_ok_and(|n| n > 0);
        if !ok {
            let _ = child.kill();
            self.0 = None;
            return None;
        }
        Some(line.trim().to_string())
    }
}

fn content_pass(app: &tauri::AppHandle, ix: &Indexer) {
    let c = match ix.conn() {
        Ok(c) => c,
        Err(e) => return log("open", e),
    };
    let mut ocr = Ocr(None, false);
    loop {
        let todo = index::needs_text(&c, 32).unwrap_or_else(|e| {
            log("read", e);
            vec![]
        });
        if todo.is_empty() {
            if !ix.content_done.swap(true, Ordering::Relaxed) {
                ix.emit(app, "fs-index-updated", true);
            }
            std::thread::sleep(std::time::Duration::from_secs(3));
            continue;
        }
        ix.content_done.store(false, Ordering::Relaxed);
        let (images, docs): (Vec<_>, Vec<_>) = todo.into_iter().partition(|(_, e)| index::IMAGE_EXTS.contains(&e.as_str()));
        // documents in four threads; a file with no readable text is stored as done with no text
        let mut texts: Vec<(String, String)> = std::thread::scope(|s| {
            let jobs: Vec<_> = docs
                .chunks(docs.len().div_ceil(4).max(1))
                .map(|chunk| s.spawn(move || chunk.iter().map(|(p, _)| (p.clone(), index::extract_text(Path::new(p)).unwrap_or_default())).collect::<Vec<_>>()))
                .collect();
            jobs.into_iter().flat_map(|j| j.join().unwrap_or_default()).collect()
        });
        texts.extend(images.into_iter().map(|(p, _)| {
            let t = ocr.read(&p).unwrap_or_default();
            (p, t)
        }));
        for (p, t) in &texts {
            if let Err(e) = index::set_text(&c, p, t) {
                log(p, e);
            }
        }
        ix.emit(app, "fs-index-updated", false);
    }
}

fn watch(app: &tauri::AppHandle, home: &Path, ix: &Indexer) {
    use notify::{RecursiveMode, Watcher};
    let (tx, rx) = std::sync::mpsc::channel();
    let mut watcher = match notify::recommended_watcher(tx) {
        Ok(w) => w,
        Err(e) => return log("watcher", e),
    };
    if let Err(e) = watcher.watch(home, RecursiveMode::Recursive) {
        return log("watch", e);
    }
    let c = match ix.conn() {
        Ok(c) => c,
        Err(e) => return log("open", e),
    };
    while let Ok(first) = rx.recv() {
        // gather a burst of events (a copy or an unzip) into one write
        std::thread::sleep(std::time::Duration::from_millis(300));
        let mut paths: Vec<PathBuf> = vec![];
        for ev in std::iter::once(first).chain(rx.try_iter()) {
            match ev {
                Ok(ev) if !ev.kind.is_access() => paths.extend(ev.paths),
                Ok(_) => {}
                Err(e) => log("event", e),
            }
        }
        paths.sort();
        paths.dedup();
        match apply_changes(&c, home, &paths, ix.gen.load(Ordering::Relaxed)) {
            Ok(n) if n > 0 => ix.emit(app, "fs-index-updated", false),
            Ok(_) => {}
            Err(e) => log("apply", e),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tmp(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("arkhive_crawl_{name}_{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn skips_packages_hidden_and_noise_folders() {
        for n in [".git", "node_modules", "Library"] {
            assert!(skip(n), "{n}");
        }
        assert!(!skip("Xcode.app") && !skip("Photos Library.photoslibrary"), "packages are kept, as one item each");
        assert!(!skip("Lab report.pdf"));
        assert!(!skip("Documents"));
    }

    #[test]
    fn walk_respects_depth_skips_and_flushes_in_batches() {
        let d = tmp("walk");
        std::fs::create_dir_all(d.join("a/b/c")).unwrap();
        std::fs::write(d.join("a/one.txt"), "1").unwrap();
        std::fs::write(d.join("a/b/c/deep.txt"), "3").unwrap();
        std::fs::create_dir_all(d.join("node_modules/x")).unwrap();
        std::fs::create_dir_all(d.join("Pics.photoslibrary/originals")).unwrap();
        let names = |depth| {
            let mut out = vec![];
            walk(&d, depth, &mut out, &mut |_| {});
            let mut n: Vec<String> = out.iter().map(|m| m.path.strip_prefix(&*d.to_string_lossy()).unwrap().to_string()).collect();
            n.sort();
            n
        };
        assert_eq!(names(None), ["/Pics.photoslibrary", "/a", "/a/b", "/a/b/c", "/a/b/c/deep.txt", "/a/one.txt"]);
        assert_eq!(names(Some(1)), ["/Pics.photoslibrary", "/a", "/a/b", "/a/one.txt"]);
        let pkg = meta_of(&d.join("Pics.photoslibrary")).unwrap();
        assert_eq!((pkg.kind, pkg.ext.as_str()), ("file", "photoslibrary"));
        let m = meta_of(&d.join("a/one.txt")).unwrap();
        assert_eq!((m.name.as_str(), m.ext.as_str(), m.kind, m.size), ("one.txt", "txt", "file", 1));
    }

    #[test]
    fn finder_changes_add_update_and_remove_rows() {
        let d = tmp("changes");
        let c = Connection::open_in_memory().unwrap();
        index::init(&c).unwrap();
        let f = d.join("Blood_Test.pdf");
        std::fs::write(&f, "x").unwrap();
        apply_changes(&c, &d, &[f.clone(), d.join(".hidden/x.txt")], 1).unwrap();
        assert_eq!(index::counts(&c).unwrap().0, 1);
        std::fs::remove_file(&f).unwrap();
        apply_changes(&c, &d, std::slice::from_ref(&f), 1).unwrap();
        assert_eq!(index::counts(&c).unwrap().0, 0);
        assert_eq!(apply_changes(&c, Path::new("/elsewhere"), &[f], 1).unwrap(), 0, "outside home: ignored");
        let cloud = icloud(&d);
        std::fs::create_dir_all(&cloud).unwrap();
        std::fs::write(cloud.join("Lab.pdf"), "x").unwrap();
        std::fs::create_dir_all(d.join("Library/Mail")).unwrap();
        std::fs::write(d.join("Library/Mail/m.txt"), "x").unwrap();
        assert_eq!(apply_changes(&c, &d, &[cloud.join("Lab.pdf"), d.join("Library/Mail/m.txt")], 1).unwrap(), 1, "iCloud Drive yes, the rest of Library no");
    }
}
