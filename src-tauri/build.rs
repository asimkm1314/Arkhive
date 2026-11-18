use std::process::Command;

fn main() {
    // The speech and OCR helpers ship beside the app on macOS (bundle.externalBin in tauri.macos.conf.json).
    // It must exist before tauri_build checks externalBin, so it is compiled first.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("macos") {
        let target = std::env::var("TARGET").expect("cargo sets TARGET");
        let arch = if target.starts_with("aarch64") { "arm64" } else { "x86_64" };
        std::fs::create_dir_all("binaries").expect("create binaries/");
        for helper in ["speech", "ocr"] { // arkhive-speech: the mic; arkhive-ocr: text in images for the index
            println!("cargo:rerun-if-changed={helper}/main.swift");
            let out = format!("binaries/arkhive-{helper}-{target}");
            let status = Command::new("swiftc")
                .args(["-O", "-target", &format!("{arch}-apple-macos13"), &format!("{helper}/main.swift"), "-o", &out])
                .status()
                .expect("swiftc not found: install the Xcode command line tools");
            assert!(status.success(), "swiftc failed to build {helper}/main.swift");
        }
    }
    // iPhone: the folder picker's two functions live in the app's Swift code (gen/apple/Sources/archiveos/FolderPicker.swift)
    // and are linked from the static library. The cdylib Cargo also builds is never shipped, so let them stay unresolved there.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        for sym in ["_arkhive_pick_folder", "_arkhive_saved_folders"] {
            println!("cargo:rustc-cdylib-link-arg=-Wl,-U,{sym}");
        }
    }
    tauri_build::build()
}
