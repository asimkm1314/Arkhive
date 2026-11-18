// Arkhive on iPhone: folders the owner picks in the Files picker, kept across launches as security-scoped
// bookmarks. Rust calls these two C functions (src-tauri/src/lib.rs, cfg(target_os = "ios")); no Tauri plugin needed.
import UIKit
import UniformTypeIdentifiers

private let bookmarksKey = "arkhive.folders"
private var opened: [URL] = [] // folders whose security scope stays open for the app's lifetime
private var restored = false

private func saved() -> [Data] { UserDefaults.standard.array(forKey: bookmarksKey) as? [Data] ?? [] }

/// Paths of every saved folder, "\n"-separated, opening each one's scope once. The caller frees the string.
@_cdecl("arkhive_saved_folders")
public func arkhive_saved_folders() -> UnsafeMutablePointer<CChar>? {
    if !restored {
        restored = true
        var keep: [Data] = []
        for data in saved() {
            var stale = false
            guard let url = try? URL(resolvingBookmarkData: data, options: [], relativeTo: nil, bookmarkDataIsStale: &stale) else { continue } // folder gone: forget it
            if url.startAccessingSecurityScopedResource() { opened.append(url) }
            keep.append(stale ? ((try? url.bookmarkData()) ?? data) : data)
        }
        UserDefaults.standard.set(keep, forKey: bookmarksKey)
    }
    return strdup(opened.map(\.path).joined(separator: "\n"))
}

public typealias ArkhivePicked = @convention(c) (UnsafePointer<CChar>?) -> Void

private final class PickerDelegate: NSObject, UIDocumentPickerDelegate {
    let done: ArkhivePicked
    init(done: @escaping ArkhivePicked) { self.done = done }

    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return done(nil) }
        guard url.startAccessingSecurityScopedResource() else { return "!iOS did not give access to that folder".withCString { done($0) } }
        do {
            let data = try url.bookmarkData()
            var all = saved()
            if !opened.contains(where: { $0.path == url.path }) { opened.append(url); all.append(data) }
            UserDefaults.standard.set(all, forKey: bookmarksKey)
            url.path.withCString { done($0) }
        } catch {
            "!the folder could not be remembered (\(error.localizedDescription))".withCString { done($0) }
        }
    }

    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { done(nil) }
}
private var current: PickerDelegate?

/// Shows the Files folder picker. `done` gets the path, "!reason" on failure, or nil when cancelled.
@_cdecl("arkhive_pick_folder")
public func arkhive_pick_folder(_ done: @escaping ArkhivePicked) {
    DispatchQueue.main.async {
        let scene = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first
        guard var top = scene?.windows.first(where: \.isKeyWindow)?.rootViewController else {
            return "!no window to show the folder picker in".withCString { done($0) }
        }
        while let next = top.presentedViewController { top = next }
        let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.folder])
        let delegate = PickerDelegate(done: done)
        current = delegate
        picker.delegate = delegate
        top.present(picker, animated: true)
    }
}
