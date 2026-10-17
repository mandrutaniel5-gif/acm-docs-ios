import UIKit
import WebKit

/// The whole app is the web app (same as on Android and Windows) inside a WKWebView.
/// The page talks to iOS through `window.AndroidBridge` (same names as on Android):
/// quick answers go through a blocking prompt(), slow ones (pickers, camera, PDF)
/// through a message and come back with `window.__bridgeCb(id, error, result)`.
final class WebViewController: UIViewController, WKUIDelegate, WKNavigationDelegate {
    private(set) var web: WKWebView!
    private lazy var bridge = Bridge(controller: self)
    private var barDark = false
    private var loaded = false

    override var preferredStatusBarStyle: UIStatusBarStyle { barDark ? .lightContent : .darkContent }

    override func loadView() {
        let root = UIView()
        root.backgroundColor = .systemBackground
        view = root

        let config = WKWebViewConfiguration()
        config.setURLSchemeHandler(SchemeHandler(), forURLScheme: "acm")
        let content = WKUserContentController()
        content.addUserScript(WKUserScript(source: Bridge.script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        content.add(WeakScriptHandler(bridge), name: "acm")
        config.userContentController = content
        config.allowsInlineMediaPlayback = true
        config.dataDetectorTypes = []

        let web = WKWebView(frame: .zero, configuration: config)
        web.uiDelegate = self
        web.navigationDelegate = self
        web.allowsLinkPreview = false
        web.allowsBackForwardNavigationGestures = false
        web.isOpaque = false
        web.backgroundColor = .clear
        web.scrollView.bounces = false
        web.scrollView.isScrollEnabled = false // the app scrolls its own panels
        web.scrollView.contentInsetAdjustmentBehavior = .never
        if #available(iOS 16.4, *) { web.isInspectable = true }
        web.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(web)
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: root.safeAreaLayoutGuide.topAnchor),
            web.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            web.bottomAnchor.constraint(equalTo: root.bottomAnchor), // the page leaves room for the home bar itself
        ])
        self.web = web
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        web.load(URLRequest(url: URL(string: "acm://app/index.html")!))
    }

    // MARK: files opened from other apps ("Open in ACM Docs", share sheet)

    func receive(_ url: URL) {
        if loaded { deliver(url); return }
        // the page asks for it when it starts ("startup")
        if let copy = try? Files.importCopy(of: url) { bridge.startupPath = copy.path }
    }
    private func deliver(_ url: URL) {
        guard let copy = try? Files.importCopy(of: url) else { return }
        let js = "window.__onOpenFile && window.__onOpenFile(\(Bridge.json(copy.path)))"
        web.evaluateJavaScript(js, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loaded = true
        if ProcessInfo.processInfo.arguments.contains("-selftest") {
            DispatchQueue.main.asyncAfter(deadline: .now() + 6) { self.selfTest() }
        }
    }

    // MARK: automatic check used by the cloud build (simulator): writes Documents/selftest.json

    private func selfTest() {
        let js = """
        const out = {};
        const step = async (name, fn) => { try { out[name] = await fn(); } catch (e) { out[name] = 'ERROR ' + (e && e.message || e); } };
        await step('info', () => JSON.parse(AndroidBridge.info()));
        await step('files', async () => {
          const p = Host.info.docs + '/selftest/a.txt';
          Host.mkdirp(Host.info.docs + '/selftest');
          Host.writeFile(p, new TextEncoder().encode('salut ăîșț'));
          return { rw: new TextDecoder().decode(Host.readFile(p)), list: Host.listDir(Host.info.docs + '/selftest'),
                   mtime: Host.mtime(p) > 0, async: new TextDecoder().decode(await Host.readFileAsync(p)) };
        });
        await step('fonts', () => JSON.parse(AndroidBridge.fonts()).length);
        await step('engine', () => ({ worker: typeof Worker, offscreen: typeof OffscreenCanvas, pdfium: !!(window.PDF && PDF.ready) }));
        await step('pdf', async () => {
          const t = performance.now();
          const b = await Host.htmlToPdf('<html><head><style>@page{size:A4;margin:15mm}</style></head><body><h1>Test ăîșț</h1><p>' + 'Paragraf de test. '.repeat(500) + '</p></body></html>');
          const d = PDF.Doc.open(b); const pages = d.pageSizes().length; d.close();
          return { bytes: b.length, pages, ms: Math.round(performance.now() - t), native: localStorage.getItem('acm.print') !== 'image' };
        });
        await step('ocr', async () => {
          const c = document.createElement('canvas'); c.width = 900; c.height = 200;
          const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, 900, 200); x.fillStyle = '#000'; x.font = '48px Arial'; x.fillText('Factura 1234 Oradea', 40, 120);
          const png = new Uint8Array(await (await new Promise((r) => c.toBlob(r, 'image/png'))).arrayBuffer());
          const t = performance.now();
          const r = await Promise.race([Host.ocr(png, null, { page: true }), new Promise((_, j) => setTimeout(() => j(new Error('timeout')), 60000))]);
          return { text: r.paragraphs.flatMap((p) => p.lines.map((l) => l.text)).join(' | '), ms: Math.round(performance.now() - t) };
        });
        await step('scanWorker', async () => {
          const w = new Worker('js/scancore.js');
          const res = await new Promise((ok, no) => { w.onmessage = (e) => ok(e.data); w.onerror = (e) => no(new Error(e.message || 'worker')); w.postMessage({ id: 1, op: 'otsu', args: [new Uint8Array([10, 10, 200, 200]), 4] }); setTimeout(() => no(new Error('timeout')), 10000); });
          w.terminate();
          return res;
        });
        return JSON.stringify(out, null, 1);
        """
        web.callAsyncJavaScript(js, arguments: [:], in: nil, in: .page) { result in
            let text: String
            switch result {
            case .success(let v): text = (v as? String) ?? String(describing: v)
            case .failure(let e): text = "ERROR " + e.localizedDescription
            }
            try? text.write(to: Files.docsRoot.appendingPathComponent("selftest.json"), atomically: true, encoding: .utf8)
            // a short tour, for the screenshots of the cloud build
            let steps = ["App.showView('settings')", "Invoice.open({ type: 'invoice' })", "App.showHome(); App.showView('files')"]
            for (i, s) in steps.enumerated() {
                DispatchQueue.main.asyncAfter(deadline: .now() + Double(8 * (i + 1))) { self.web.evaluateJavaScript(s, completionHandler: nil) }
            }
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
        if url.scheme == "acm" || url.scheme == "about" || url.scheme == "blob" || url.scheme == "data" {
            return decisionHandler(.allow)
        }
        // links to the web, e-mail, phone: in their own apps
        UIApplication.shared.open(url)
        decisionHandler(.cancel)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // iOS stopped the page (memory): start it again
        webView.reload()
    }

    // MARK: theme (colour behind the status bar)

    func setTheme(dark: Bool, color: String) {
        barDark = dark
        view.backgroundColor = UIColor(hex: color) ?? (dark ? .black : .white)
        overrideUserInterfaceStyle = dark ? .dark : .light
        setNeedsStatusBarAppearanceUpdate()
    }

    // MARK: the blocking prompt() = quick bridge calls; real alerts for the rest

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        if prompt == "acm-sync" {
            completionHandler(bridge.sync(defaultText ?? "{}"))
            return
        }
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Anulează", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        present(alert, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Anulează", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        present(alert, animated: true)
    }

    /// The controller to show pickers / sheets from (the top-most one).
    var top: UIViewController {
        var c: UIViewController = self
        while let p = c.presentedViewController { c = p }
        return c
    }
}

/// Avoids a retain cycle between the web view and its message handler.
final class WeakScriptHandler: NSObject, WKScriptMessageHandler {
    weak var target: WKScriptMessageHandler?
    init(_ target: WKScriptMessageHandler) { self.target = target }
    func userContentController(_ c: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(c, didReceive: message)
    }
}

extension UIColor {
    convenience init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespacesAndNewlines)
        if s.hasPrefix("#") { s.removeFirst() }
        if s.count == 3 { s = s.map { "\($0)\($0)" }.joined() }
        guard s.count == 6, let v = UInt32(s, radix: 16) else { return nil }
        self.init(red: CGFloat((v >> 16) & 255) / 255, green: CGFloat((v >> 8) & 255) / 255, blue: CGFloat(v & 255) / 255, alpha: 1)
    }
}
