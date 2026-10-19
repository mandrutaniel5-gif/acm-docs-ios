import UIKit
import WebKit
import PhotosUI
import UniformTypeIdentifiers

/// What the web app can ask iOS for. Same names and answers as the Android app,
/// so the web app does not need to know which phone it runs on.
final class Bridge: NSObject, WKScriptMessageHandler {
    weak var controller: WebViewController?
    var startupPath: String?
    private var lang = "ro"
    private var pending: [Int: Any] = [:] // keeps pickers' helpers alive until they answer

    init(controller: WebViewController) {
        self.controller = controller
        super.init()
    }

    private func t(_ ro: String, _ en: String) -> String { lang == "en" ? en : ro }

    /// The page side: window.AndroidBridge, built on prompt() (instant answers) and a message channel.
    static let script = """
    (function () {
      if (window.AndroidBridge) return;
      function S(m, a) {
        var r = prompt('acm-sync', JSON.stringify({ m: m, a: a || [] }));
        if (r === null || r === undefined) throw new Error('bridge ' + m);
        var o = JSON.parse(r);
        if (o.err !== undefined) throw new Error(o.err);
        return o.ok;
      }
      window.AndroidBridge = {
        info: function () { return S('info'); },
        readB64: function (p) { return S('readB64', [p]); },
        readAsset: function (p) { return S('readAsset', [p]); },
        writeB64: function (p, b) { return S('writeB64', [p, b]); },
        isFile: function (p) { return S('isFile', [p]); },
        listDir: function (p) { return S('listDir', [p]); },
        mkdirs: function (p) { return S('mkdirs', [p]); },
        mtime: function (p) { return S('mtime', [p]); },
        remove: function (p) { return S('remove', [p]); },
        fonts: function () { return S('fonts'); },
        setTheme: function (d, c) { try { S('setTheme', [!!d, c || '']); } catch (e) {} },
        setLang: function (l) { try { S('setLang', [l]); } catch (e) {} },
        exit: function () {},
        request: function (id, op, args) {
          window.webkit.messageHandlers.acm.postMessage({ id: id, op: op, args: args || '{}' });
        }
      };
    })();
    """

    static func json(_ s: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: [s], options: [])
        let text = data.flatMap { String(data: $0, encoding: .utf8) } ?? "[\"\"]"
        return String(text.dropFirst().dropLast())
    }

    private func answer(_ value: Any?) -> String {
        let obj: [String: Any] = ["ok": value ?? NSNull()]
        guard let data = try? JSONSerialization.data(withJSONObject: obj, options: [.fragmentsAllowed]),
              let s = String(data: data, encoding: .utf8) else { return "{\"err\":\"json\"}" }
        return s
    }
    private func failure(_ message: String) -> String {
        let data = try? JSONSerialization.data(withJSONObject: ["err": message], options: [])
        return data.flatMap { String(data: $0, encoding: .utf8) } ?? "{\"err\":\"error\"}"
    }

    // MARK: instant answers

    func sync(_ payload: String) -> String {
        guard let data = payload.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let m = obj["m"] as? String else { return failure("bad call") }
        let a = obj["a"] as? [Any] ?? []
        let s0 = a.first as? String ?? ""
        let fm = FileManager.default
        switch m {
        case "info":
            let info: [String: Any] = [
                "docs": Files.docsRoot.path,
                "version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "",
                "sdk": 0, "platform": "ios",
                "model": UIDevice.current.model + " iOS " + UIDevice.current.systemVersion,
                "density": UIScreen.main.scale,
                "args": ProcessInfo.processInfo.arguments.filter { $0.hasPrefix("-uitest") },
            ]
            let d = (try? JSONSerialization.data(withJSONObject: info)) ?? Data()
            return answer(String(data: d, encoding: .utf8) ?? "{}")
        case "readB64":
            guard let d = fm.contents(atPath: s0) else { return failure("FileNotFound " + s0) }
            return answer(d.base64EncodedString())
        case "readAsset":
            guard let d = fm.contents(atPath: Files.www.appendingPathComponent(s0).path) else { return failure("FileNotFound " + s0) }
            return answer(d.base64EncodedString())
        case "writeB64":
            let b64 = a.count > 1 ? (a[1] as? String ?? "") : ""
            guard let d = Data(base64Encoded: b64) else { return answer(false) }
            let url = URL(fileURLWithPath: s0)
            do {
                try fm.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
                try d.write(to: url, options: .atomic)
                return answer(true)
            } catch { return answer(false) }
        case "isFile":
            var dir: ObjCBool = false
            return answer(fm.fileExists(atPath: s0, isDirectory: &dir) && !dir.boolValue)
        case "listDir":
            let names = (try? fm.contentsOfDirectory(atPath: s0)) ?? []
            let d = (try? JSONSerialization.data(withJSONObject: names)) ?? Data("[]".utf8)
            return answer(String(data: d, encoding: .utf8) ?? "[]")
        case "mkdirs":
            do { try fm.createDirectory(atPath: s0, withIntermediateDirectories: true); return answer(true) } catch { return answer(false) }
        case "mtime":
            let date = (try? fm.attributesOfItem(atPath: s0))?[.modificationDate] as? Date
            return answer(date.map { ($0.timeIntervalSince1970 * 1000).rounded() } ?? 0)
        case "remove":
            do { try fm.removeItem(atPath: s0); return answer(true) } catch { return answer(false) }
        case "fonts":
            // fonts that come with the app (Arial, Times, Calibri look-alikes)
            var list: [[String: String]] = []
            let dir = Files.www.appendingPathComponent("fonts")
            for n in ((try? fm.contentsOfDirectory(atPath: dir.path)) ?? []).sorted() where n.lowercased().hasSuffix(".ttf") {
                var base = (n as NSString).deletingPathExtension.replacingOccurrences(of: "-", with: " ").replacingOccurrences(of: "_", with: " ")
                base = base.replacingOccurrences(of: "([a-z])([A-Z])", with: "$1 $2", options: .regularExpression)
                list.append(["name": base, "path": "asset:fonts/" + n])
            }
            let d = (try? JSONSerialization.data(withJSONObject: list)) ?? Data("[]".utf8)
            return answer(String(data: d, encoding: .utf8) ?? "[]")
        case "setTheme":
            let dark = a.first as? Bool ?? false
            let color = a.count > 1 ? (a[1] as? String ?? "") : ""
            DispatchQueue.main.async { self.controller?.setTheme(dark: dark, color: color) }
            return answer(true)
        case "setLang":
            lang = s0 == "en" ? "en" : "ro"
            return answer(true)
        default:
            return failure("unknown " + m)
        }
    }

    // MARK: slow answers (come back through window.__bridgeCb)

    func reply(_ id: Int, _ error: String?, _ result: String?) {
        let e = error.map { Bridge.json($0) } ?? "null"
        let r = result.map { Bridge.json($0) } ?? "null"
        DispatchQueue.main.async {
            self.controller?.web.evaluateJavaScript("window.__bridgeCb(\(id), \(e), \(r))", completionHandler: nil)
        }
    }

    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        // iOS 26+: the page reports its bottom bar (visible? which tab?) for the native glass bar
        if let body = message.body as? [String: Any], body["op"] as? String == "tabbar" {
            let visible = body["visible"] as? Bool ?? false
            let active = body["active"] as? String ?? ""
            DispatchQueue.main.async { self.controller?.updateTabbar(visible: visible, active: active) }
            return
        }
        guard let body = message.body as? [String: Any], let id = (body["id"] as? NSNumber)?.intValue,
              let op = body["op"] as? String else { return }
        let argsText = body["args"] as? String ?? "{}"
        let args = (try? JSONSerialization.jsonObject(with: Data(argsText.utf8))) as? [String: Any] ?? [:]
        handle(id, op, args)
    }

    private func handle(_ id: Int, _ op: String, _ a: [String: Any]) {
        guard let vc = controller else { return reply(id, "app", nil) }
        switch op {
        case "startup":
            let p = startupPath
            startupPath = nil
            reply(id, nil, p)

        case "open":
            let mimes = a["mimes"] as? [String] ?? []
            let picker = UIDocumentPickerViewController(forOpeningContentTypes: Files.types(forMimes: mimes), asCopy: true)
            let helper = PickerHelper { [weak self] urls in
                guard let self = self else { return }
                self.pending[id] = nil
                guard let url = urls?.first else { return self.reply(id, nil, nil) }
                do { self.reply(id, nil, try Files.importCopy(of: url).path) } catch { self.reply(id, self.t("Nu am putut citi fișierul ales.", "Could not read the chosen file."), nil) }
            }
            pending[id] = helper
            picker.delegate = helper
            vc.top.present(picker, animated: true)

        case "images":
            var config = PHPickerConfiguration()
            config.filter = .images
            config.selectionLimit = 0
            let picker = PHPickerViewController(configuration: config)
            let helper = PhotosHelper { [weak self] paths in
                self?.pending[id] = nil
                let d = (try? JSONSerialization.data(withJSONObject: paths)) ?? Data("[]".utf8)
                self?.reply(id, nil, String(data: d, encoding: .utf8))
            }
            pending[id] = helper
            picker.delegate = helper
            vc.top.present(picker, animated: true)

        case "camera":
            guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
                return reply(id, t("Camera nu este disponibilă.", "The camera is not available."), nil)
            }
            let picker = UIImagePickerController()
            picker.sourceType = .camera
            let helper = CameraHelper { [weak self] image in
                guard let self = self else { return }
                self.pending[id] = nil
                guard let image = image, let jpeg = image.jpegData(compressionQuality: 0.92) else { return self.reply(id, nil, nil) }
                let f = DateFormatter()
                f.dateFormat = "yyyy-MM-dd HH.mm.ss"
                let url = Files.freeURL(in: Files.docsRoot.appendingPathComponent("Scanări"), name: "Scan \(f.string(from: Date())).jpg")
                do { try jpeg.write(to: url, options: .atomic); self.reply(id, nil, url.path) } catch { self.reply(id, error.localizedDescription, nil) }
            }
            pending[id] = helper
            picker.delegate = helper
            vc.top.present(picker, animated: true)

        case "export":
            let url = URL(fileURLWithPath: a["path"] as? String ?? "")
            let picker = UIDocumentPickerViewController(forExporting: [url], asCopy: true)
            let helper = PickerHelper { [weak self] urls in
                self?.pending[id] = nil
                self?.reply(id, nil, urls == nil ? nil : "true")
            }
            pending[id] = helper
            picker.delegate = helper
            vc.top.present(picker, animated: true)

        case "share", "view":
            let path = a["path"] as? String ?? ""
            guard FileManager.default.fileExists(atPath: path) else { return reply(id, t("Fișierul nu mai există.", "The file no longer exists."), nil) }
            var items: [Any] = [URL(fileURLWithPath: path)]
            if let text = a["text"] as? String, !text.isEmpty { items.append(text) }
            let sheet = UIActivityViewController(activityItems: items, applicationActivities: nil)
            sheet.completionWithItemsHandler = { [weak self] _, _, _, _ in self?.reply(id, nil, "true") }
            if let pop = sheet.popoverPresentationController {
                pop.sourceView = vc.view
                pop.sourceRect = CGRect(x: vc.view.bounds.midX, y: vc.view.bounds.maxY - 80, width: 1, height: 1)
            }
            vc.top.present(sheet, animated: true)

        case "external":
            if let url = URL(string: a["url"] as? String ?? ""), ["mailto", "http", "https", "tel"].contains(url.scheme?.lowercased() ?? "") {
                UIApplication.shared.open(url) { ok in self.reply(id, ok ? nil : self.t("Nu am găsit o aplicație pentru asta.", "No app can open this."), ok ? "true" : nil) }
            } else { reply(id, "blocked", nil) }

        case "fetch":
            guard let url = URL(string: a["url"] as? String ?? ""), url.scheme == "https",
                  let host = url.host, host == "bnr.ro" || host == "www.bnr.ro" else { return reply(id, "blocked", nil) }
            URLSession.shared.dataTask(with: url) { data, _, error in
                if let data = data, let s = String(data: data, encoding: .utf8) { self.reply(id, nil, s) }
                else { self.reply(id, error?.localizedDescription ?? "fetch", nil) }
            }.resume()

        case "pdf":
            let printer = PdfPrinter(html: a["html"] as? String ?? "",
                                     widthMils: (a["width"] as? NSNumber)?.doubleValue ?? 8268,
                                     heightMils: (a["height"] as? NSNumber)?.doubleValue ?? 11693,
                                     margins: ["top", "right", "bottom", "left"].map { (a[$0] as? NSNumber)?.doubleValue ?? 0 })
            pending[id] = printer
            printer.run(in: vc.view) { [weak self] data, error in
                self?.pending[id] = nil
                if let data = data { self?.reply(id, nil, data.base64EncodedString()) } else { self?.reply(id, error ?? "NATIVE_FAILED", nil) }
            }

        case "capture":
            let rect = CGRect(x: (a["x"] as? NSNumber)?.doubleValue ?? 0, y: (a["y"] as? NSNumber)?.doubleValue ?? 0,
                              width: (a["w"] as? NSNumber)?.doubleValue ?? 100, height: (a["h"] as? NSNumber)?.doubleValue ?? 100)
            let cfg = WKSnapshotConfiguration()
            cfg.rect = rect
            vc.web.takeSnapshot(with: cfg) { image, error in
                if let png = image?.pngData() { self.reply(id, nil, png.base64EncodedString()) } else { self.reply(id, error?.localizedDescription ?? "capture", nil) }
            }

        // ---- account keys (Keychain + Face ID), see Secure.swift
        case "secureSet":
            let name = a["name"] as? String ?? ""
            guard !name.isEmpty, let data = Data(base64Encoded: a["data"] as? String ?? "") else { return reply(id, "secure", nil) }
            DispatchQueue.global(qos: .userInitiated).async {
                do { try Secure.set(name, data); self.reply(id, nil, "true") }
                catch Secure.Failure.noPasscode { self.reply(id, self.t("Setează un cod de deblocare pe telefon: fără el, cheile nu pot fi protejate.", "Set a passcode on this phone: without it the keys cannot be protected."), nil) }
                catch { self.reply(id, "secure \(error)", nil) }
            }

        case "secureGet":
            let name = a["name"] as? String ?? ""
            let reason = (a["reason"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? t("Deblochează cheile ACM Docs", "Unlock your ACM Docs keys")
            DispatchQueue.global(qos: .userInitiated).async {
                do { self.reply(id, nil, try Secure.get(name, reason: reason)?.base64EncodedString()) }
                catch Secure.Failure.cancelled { self.reply(id, "cancel", nil) }
                catch { self.reply(id, "secure \(error)", nil) }
            }

        case "secureHas":
            let name = a["name"] as? String ?? ""
            DispatchQueue.global(qos: .userInitiated).async { self.reply(id, nil, Secure.has(name) ? "true" : "false") }

        case "secureDelete":
            Secure.delete(a["name"] as? String ?? "")
            reply(id, nil, "true")

        case "confirmOwner":
            let reason = (a["reason"] as? String).flatMap { $0.isEmpty ? nil : $0 } ?? t("Confirmă că ești tu", "Confirm it's you")
            Secure.confirmOwner(reason: reason) { ok in self.reply(id, ok ? nil : "cancel", ok ? "true" : nil) }

        case "oauth":
            guard let url = URL(string: a["url"] as? String ?? ""), url.scheme == "https",
                  let scheme = a["callback"] as? String, !scheme.isEmpty else { return reply(id, "oauth", nil) }
            let runner = OAuthRunner(anchor: vc.view.window)
            pending[id] = runner
            runner.start(url: url, callbackScheme: scheme) { [weak self] back, error in
                self?.pending[id] = nil
                self?.reply(id, error, back?.absoluteString)
            }

        case "googleToken":
            // Google sign-in, step 2: the one-time code for the ID token. Only Google's token address.
            var req = URLRequest(url: URL(string: "https://oauth2.googleapis.com/token")!)
            req.httpMethod = "POST"
            req.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")
            req.httpBody = (a["body"] as? String ?? "").data(using: .utf8)
            URLSession.shared.dataTask(with: req) { data, _, error in
                if let data = data, let s = String(data: data, encoding: .utf8) { self.reply(id, nil, s) }
                else { self.reply(id, error?.localizedDescription ?? "google", nil) }
            }.resume()

        default:
            reply(id, "op " + op, nil)
        }
    }
}

// MARK: - picker helpers

final class PickerHelper: NSObject, UIDocumentPickerDelegate {
    private let done: ([URL]?) -> Void
    init(_ done: @escaping ([URL]?) -> Void) { self.done = done }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) { done(urls) }
    func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) { done(nil) }
}

final class PhotosHelper: NSObject, PHPickerViewControllerDelegate {
    private let done: ([String]) -> Void
    init(_ done: @escaping ([String]) -> Void) { self.done = done }

    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        picker.dismiss(animated: true)
        guard !results.isEmpty else { return done([]) }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("scan", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var paths = [String?](repeating: nil, count: results.count)
        let lock = NSLock()
        let group = DispatchGroup()
        let stamp = Int(Date().timeIntervalSince1970 * 1000)
        for (i, r) in results.enumerated() {
            guard r.itemProvider.canLoadObject(ofClass: UIImage.self) else { continue }
            group.enter()
            r.itemProvider.loadObject(ofClass: UIImage.self) { obj, _ in
                // JPEG with the picture already upright (HEIC photos too)
                if let img = (obj as? UIImage)?.uprighted(), let jpeg = img.jpegData(compressionQuality: 0.92) {
                    let url = dir.appendingPathComponent("\(stamp)-\(i).jpg")
                    if (try? jpeg.write(to: url, options: .atomic)) != nil { lock.lock(); paths[i] = url.path; lock.unlock() }
                }
                group.leave()
            }
        }
        group.notify(queue: .main) { self.done(paths.compactMap { $0 }) }
    }
}

final class CameraHelper: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    private let done: (UIImage?) -> Void
    init(_ done: @escaping (UIImage?) -> Void) { self.done = done }
    func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        picker.dismiss(animated: true)
        done((info[.originalImage] as? UIImage)?.uprighted())
    }
    func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        picker.dismiss(animated: true)
        done(nil)
    }
}

extension UIImage {
    /// The same picture with its pixels turned the way it is shown (no rotation flag left).
    func uprighted() -> UIImage {
        if imageOrientation == .up { return self }
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let px = CGSize(width: size.width * scale, height: size.height * scale)
        return UIGraphicsImageRenderer(size: px, format: format).image { _ in draw(in: CGRect(origin: .zero, size: px)) }
    }
}

// MARK: - HTML -> PDF (invoices, documents)

/// Lays an HTML page out on paper of the given size with the system's printing
/// engine (sharp, selectable text). Gives up after a while: the app then draws the PDF itself.
final class PdfPrinter: NSObject, WKNavigationDelegate {
    private let html: String
    private let paper: CGRect
    private let printable: CGRect
    private var web: WKWebView?
    private var done: ((Data?, String?) -> Void)?

    init(html: String, widthMils: Double, heightMils: Double, margins: [Double]) {
        self.html = html
        let pt = { (mils: Double) in CGFloat(mils * 72 / 1000) }
        paper = CGRect(x: 0, y: 0, width: pt(widthMils), height: pt(heightMils))
        printable = paper.inset(by: UIEdgeInsets(top: pt(margins[0]), left: pt(margins[3]), bottom: pt(margins[2]), right: pt(margins[1])))
    }

    func run(in host: UIView, done: @escaping (Data?, String?) -> Void) {
        self.done = done
        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(SchemeHandler(), forURLScheme: "acm")
        let w = WKWebView(frame: CGRect(x: 0, y: 0, width: printable.width, height: printable.height), configuration: config)
        w.navigationDelegate = self
        w.isHidden = true
        host.insertSubview(w, at: 0)
        web = w
        w.loadHTMLString(html, baseURL: URL(string: "acm://app/"))
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in self?.finish(nil, "NATIVE_FAILED timeout") }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { self.render() }
    }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(nil, "NATIVE_FAILED " + error.localizedDescription) }

    private func render() {
        guard let w = web else { return }
        let renderer = UIPrintPageRenderer()
        renderer.addPrintFormatter(w.viewPrintFormatter(), startingAtPageAt: 0)
        renderer.setValue(NSValue(cgRect: paper), forKey: "paperRect")
        renderer.setValue(NSValue(cgRect: printable), forKey: "printableRect")
        let data = NSMutableData()
        UIGraphicsBeginPDFContextToData(data, paper, nil)
        let n = max(1, renderer.numberOfPages)
        renderer.prepare(forDrawingPages: NSRange(location: 0, length: n))
        for i in 0..<n {
            UIGraphicsBeginPDFPage()
            renderer.drawPage(at: i, in: UIGraphicsGetPDFContextBounds())
        }
        UIGraphicsEndPDFContext()
        finish(data.length > 0 ? data as Data : nil, data.length > 0 ? nil : "NATIVE_FAILED empty")
    }

    private func finish(_ data: Data?, _ error: String?) {
        guard let cb = done else { return }
        done = nil
        web?.removeFromSuperview()
        web = nil
        cb(data, error)
    }
}
