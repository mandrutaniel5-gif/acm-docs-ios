import Foundation
import UniformTypeIdentifiers
import WebKit

/// Where the app keeps its files and how it serves its own pages.
enum Files {
    /// The app's Documents folder ("On My iPhone › ACM Docs" in the Files app).
    static let docsRoot: URL = {
        let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }()

    /// The web app inside the app package.
    static let www: URL = Bundle.main.resourceURL!.appendingPathComponent("www", isDirectory: true)

    static func mime(_ name: String) -> String {
        switch (name as NSString).pathExtension.lowercased() {
        case "html", "htm": return "text/html"
        case "js", "mjs": return "application/javascript"
        case "css": return "text/css"
        case "json": return "application/json"
        case "wasm": return "application/wasm"
        case "png": return "image/png"
        case "jpg", "jpeg": return "image/jpeg"
        case "gif": return "image/gif"
        case "webp": return "image/webp"
        case "heic": return "image/heic"
        case "svg": return "image/svg+xml"
        case "woff2": return "font/woff2"
        case "woff": return "font/woff"
        case "ttf": return "font/ttf"
        case "otf": return "font/otf"
        case "gz": return "application/gzip"
        case "pdf": return "application/pdf"
        case "docx": return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        case "doc": return "application/msword"
        case "xlsx": return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        case "xls": return "application/vnd.ms-excel"
        case "pptx": return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        case "txt": return "text/plain"
        case "csv": return "text/csv"
        default: return "application/octet-stream"
        }
    }

    /// A free name in [dir] ("name (2).pdf" when "name.pdf" exists).
    static func freeURL(in dir: URL, name: String) -> URL {
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var target = dir.appendingPathComponent(name)
        let base = (name as NSString).deletingPathExtension, ext = (name as NSString).pathExtension
        var n = 2
        while FileManager.default.fileExists(atPath: target.path) {
            target = dir.appendingPathComponent(ext.isEmpty ? "\(base) (\(n))" : "\(base) (\(n)).\(ext)")
            n += 1
        }
        return target
    }

    /// Copies a file picked or shared from elsewhere into "Importate" (the same file is reused).
    static func importCopy(of url: URL) throws -> URL {
        let scoped = url.startAccessingSecurityScopedResource()
        defer { if scoped { url.stopAccessingSecurityScopedResource() } }
        if url.path.hasPrefix(docsRoot.path) { return url }
        let data = try Data(contentsOf: url)
        let dir = docsRoot.appendingPathComponent("Importate", isDirectory: true)
        let same = dir.appendingPathComponent(url.lastPathComponent)
        if let old = try? Data(contentsOf: same), old == data { return same }
        let target = freeURL(in: dir, name: url.lastPathComponent)
        try data.write(to: target, options: .atomic)
        return target
    }

    /// Private to the app: not shown in the Files app, excluded from iCloud / iTunes backups.
    static var privateRoot: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("private", isDirectory: true)
        if !FileManager.default.fileExists(atPath: base.path) {
            try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.complete])
            var u = base
            var v = URLResourceValues(); v.isExcludedFromBackup = true
            try? u.setResourceValues(v)
        }
        return base
    }

    static func types(forMimes mimes: [String]) -> [UTType] {
        if mimes.isEmpty || mimes.contains("*/*") { return [.item] }
        var out: [UTType] = []
        for m in mimes {
            if m == "image/*" { out.append(.image); continue }
            if let t = UTType(mimeType: m) { out.append(t) }
        }
        return out.isEmpty ? [.item] : out
    }
}

/// Serves the app's pages (acm://app/...) and, under /~file/, files of the phone
/// (much faster for big photos and PDFs than copying them as text).
final class SchemeHandler: NSObject, WKURLSchemeHandler {
    func webView(_ webView: WKWebView, start urlSchemeTask: WKURLSchemeTask) {
        guard let url = urlSchemeTask.request.url else { return }
        let path = url.path // already decoded
        if let found = serve(path: path) {
            let (data, mime) = found
            let headers = ["Content-Type": mime, "Content-Length": String(data.count),
                           "Access-Control-Allow-Origin": "*", "Cache-Control": "no-store"]
            let response = HTTPURLResponse(url: url, statusCode: 200, httpVersion: "HTTP/1.1", headerFields: headers)!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(data)
            urlSchemeTask.didFinish()
        } else {
            let response = HTTPURLResponse(url: url, statusCode: 404, httpVersion: "HTTP/1.1", headerFields: ["Content-Type": "text/plain"])!
            urlSchemeTask.didReceive(response)
            urlSchemeTask.didReceive(Data())
            urlSchemeTask.didFinish()
        }
    }

    func webView(_ webView: WKWebView, stop urlSchemeTask: WKURLSchemeTask) {}

    func serve(path: String) -> (Data, String)? {
        if path.hasPrefix("/~file/") {
            let filePath = String(path.dropFirst(6))
            guard let data = FileManager.default.contents(atPath: filePath) else { return nil }
            return (data, Files.mime(filePath))
        }
        var rel = path
        if rel.isEmpty || rel == "/" { rel = "/index.html" }
        let url = Files.www.appendingPathComponent(String(rel.dropFirst()))
        // never leave the web app folder
        guard url.standardizedFileURL.path.hasPrefix(Files.www.standardizedFileURL.path),
              let data = FileManager.default.contents(atPath: url.path) else { return nil }
        return (data, Files.mime(url.lastPathComponent))
    }
}
