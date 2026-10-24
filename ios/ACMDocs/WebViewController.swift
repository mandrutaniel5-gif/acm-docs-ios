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
        #if DEBUG
        if #available(iOS 16.4, *) { web.isInspectable = true } // Safari Web Inspector: test builds only
        #endif
        web.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(web)
        let bottom = web.bottomAnchor.constraint(equalTo: root.bottomAnchor) // the page leaves room for the home bar itself
        NSLayoutConstraint.activate([
            web.topAnchor.constraint(equalTo: root.safeAreaLayoutGuide.topAnchor),
            web.leadingAnchor.constraint(equalTo: root.leadingAnchor),
            web.trailingAnchor.constraint(equalTo: root.trailingAnchor),
            bottom,
        ])
        webBottom = bottom
        self.web = web

        // the keyboard must never cover what is being typed: the page shrinks to the space above it
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(keyboardChanged(_:)), name: UIResponder.keyboardWillChangeFrameNotification, object: nil)
        nc.addObserver(self, selector: #selector(keyboardChanged(_:)), name: UIResponder.keyboardWillHideNotification, object: nil)

        if #available(iOS 26.0, *) { addGlassTabBar(to: root, content: content) }
        PrivacyGuard.shared.attach(self)
    }

    // MARK: keyboard

    private var webBottom: NSLayoutConstraint?
    private(set) var keyboardShown = false
    private var lastTabbarVisible = false

    @objc private func keyboardChanged(_ n: Notification) {
        guard let info = n.userInfo, isViewLoaded, view.window != nil else { return }
        let end = (info[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue ?? .zero
        let frame = view.convert(end, from: nil)
        let hiding = n.name == UIResponder.keyboardWillHideNotification
        let overlap = hiding ? 0 : max(0, view.bounds.maxY - frame.minY)
        let open = overlap > 40 // a floating / undocked iPad keyboard does not count
        guard webBottom?.constant != -overlap || open != keyboardShown else { return }
        keyboardShown = open
        webBottom?.constant = open ? -overlap : 0
        let duration = (info[UIResponder.keyboardAnimationDurationUserInfoKey] as? NSNumber)?.doubleValue ?? 0.25
        let curve = (info[UIResponder.keyboardAnimationCurveUserInfoKey] as? NSNumber)?.uintValue ?? 7
        UIView.animate(withDuration: duration, delay: 0, options: [UIView.AnimationOptions(rawValue: curve << 16), .beginFromCurrentState]) {
            self.view.layoutIfNeeded()
        } completion: { _ in
            // tell the page (no home-bar gap above the keyboard) and bring the field into view
            let js = """
            (function () {
              document.documentElement.classList.toggle('kb-open', \(open));
              var e = document.activeElement;
              if (\(open) && e && e !== document.body && e.scrollIntoView) e.scrollIntoView({ block: 'center', behavior: 'smooth' });
            })()
            """
            // WebKit may have pushed the whole page up on its own: undo it, the page scrolls its panels itself
            self.web.scrollView.setContentOffset(.zero, animated: false)
            self.web.evaluateJavaScript(js, completionHandler: nil)
        }
        if #available(iOS 26.0, *), let bar = glassBar as? GlassTabBar { bar.setShown(!open && lastTabbarVisible) }
    }

    // MARK: iOS 26+: Liquid Glass bottom bar

    private var glassBar: AnyObject?

    /// Watches the page's own bottom bar and reports it: shown (and not covered by a sheet
    /// or dialog) and which tab is on. Also turns on the glass styles (css/glass.css).
    static let glassScript = """
    (function () {
      if (window.__acmGlass) return; window.__acmGlass = true;
      document.documentElement.classList.add('ios-glass', 'native-tabbar');
      var last = '';
      function check() {
        var tb = document.getElementById('tabbar'), visible = false, active = '';
        if (tb) {
          if (getComputedStyle(tb).display !== 'none' && tb.offsetParent !== null) {
            var r = tb.getBoundingClientRect();
            if (r.height > 0) {
              var el = document.elementFromPoint(r.left + r.width / 2, r.top + Math.min(30, r.height / 2));
              visible = !!(el && tb.contains(el));
            }
          }
          var on = tb.querySelector('button.on[data-view]');
          active = on ? on.dataset.view : '';
        }
        var key = visible + '|' + active;
        if (key !== last) {
          last = key;
          try { window.webkit.messageHandlers.acm.postMessage({ op: 'tabbar', visible: visible, active: active }); } catch (e) {}
        }
      }
      var queued = false;
      function q() { if (queued) return; queued = true; requestAnimationFrame(function () { queued = false; check(); }); }
      new MutationObserver(q).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'hidden'] });
      addEventListener('resize', q);
      setInterval(check, 700);
      check();
    })();
    """

    @available(iOS 26.0, *)
    private func addGlassTabBar(to root: UIView, content: WKUserContentController) {
        content.addUserScript(WKUserScript(source: Self.glassScript, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        let bar = GlassTabBar()
        bar.isHidden = true
        bar.alpha = 0
        bar.translatesAutoresizingMaskIntoConstraints = false
        root.addSubview(bar)
        // floats just above the home indicator, like the bars of Apple's own apps
        let low = bar.bottomAnchor.constraint(equalTo: root.safeAreaLayoutGuide.bottomAnchor, constant: 10)
        low.priority = .defaultHigh
        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: root.safeAreaLayoutGuide.leadingAnchor, constant: 16),
            bar.trailingAnchor.constraint(equalTo: root.safeAreaLayoutGuide.trailingAnchor, constant: -16),
            bar.heightAnchor.constraint(equalToConstant: 62),
            bar.bottomAnchor.constraint(lessThanOrEqualTo: root.bottomAnchor, constant: -12),
            low,
        ])
        bar.onSelect = { [weak self] view in
            let js = "(function(){var b=document.querySelector('#tabbar button[data-view=\"\(view)\"]'); if(b) b.click();})()"
            self?.web.evaluateJavaScript(js, completionHandler: nil)
        }
        bar.onPlus = { [weak self] in
            self?.web.evaluateJavaScript("(function(){var b=document.getElementById('tab-new'); if(b) b.click();})()", completionHandler: nil)
        }
        glassBar = bar
    }

    func updateTabbar(visible: Bool, active: String) {
        guard #available(iOS 26.0, *), let bar = glassBar as? GlassTabBar else { return }
        if !active.isEmpty && active != bar.active { bar.setActive(active, animated: bar.shown) }
        if !active.isEmpty { bar.setPageActive(active) }
        lastTabbarVisible = visible
        bar.setShown(visible && !keyboardShown)
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
        await step('secure', async () => {
          const data = new TextEncoder().encode('chei secrete ăîșț');
          await Host.secureSet('selftest', data);
          const has = await Host.secureHas('selftest');
          const back = new TextDecoder().decode(await Host.secureGet('selftest', 'test'));
          await Host.secureDelete('selftest');
          return { has, back, gone: !(await Host.secureHas('selftest')) };
        });
        await step('acm', async () => {
          const A = window.__lib.acmcrypto, t = performance.now();
          const a = A.deriveIdentity(A.generateMnemonic()), m = A.deriveIdentity(A.generateMnemonic());
          const f = A.seal({ bytes: new TextEncoder().encode('contract'), name: 'c.pdf' }, a, [m.bundle], { password: 'parola-buna-123' });
          const r = A.open(f, m, { password: 'parola-buna-123' });
          return { ok: new TextDecoder().decode(r.bytes) === 'contract' && r.sender.fingerprint === a.fingerprint, bytes: f.length, ms: Math.round(performance.now() - t) };
        });
        await step('firebase', async () => { await Account.ready(); return { ready: true, user: !!Account.current() }; });
        return JSON.stringify(out, null, 1);
        """
        // Plain evaluateJavaScript only: the Swift-only WebKit calls (callAsyncJavaScript with Result)
        // need libswiftWebKit.dylib, which iOS 18 no longer has (the app would not even start).
        // The page writes the result itself, then takes a short tour for the cloud build's screenshots.
        let wrapped = """
        (async () => {
          let text;
          try { text = await (async () => { \(js) })(); } catch (e) { text = 'ERROR ' + (e && e.message || e); }
          try { AndroidBridge.writeB64(Host.info.docs + '/selftest.json', Host.toB64(new TextEncoder().encode(text))); } catch (e) {}
          const tour = [() => App.showView('settings'), () => Invoice.open({ type: 'invoice' }), () => { App.showHome(); App.showView('files'); }];
          tour.forEach((f, i) => setTimeout(() => { try { f(); } catch (e) {} }, 8000 * (i + 1)));
        })(); 0
        """
        web.evaluateJavaScript(wrapped, completionHandler: nil)
    }

    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction,
                 decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { return decisionHandler(.cancel) }
        if url.scheme == "acm" || url.scheme == "about" {
            return decisionHandler(.allow)
        }
        // blob: only inside frames (previews); data: pages never (they would run outside the app's rules)
        if url.scheme == "blob", navigationAction.targetFrame != nil, navigationAction.targetFrame?.isMainFrame == false {
            return decisionHandler(.allow)
        }
        if url.scheme == "blob" || url.scheme == "data" || url.scheme == "javascript" || url.scheme == "file" {
            return decisionHandler(.cancel)
        }
        // links to the web, e-mail, phone: in their own apps; any other scheme (other apps' links) is ignored
        if ["http", "https", "mailto", "tel"].contains(url.scheme?.lowercased() ?? "") { UIApplication.shared.open(url) }
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
            // only the app's own page (acm://app, main frame) may talk to the phone
            guard frame.isMainFrame, frame.securityOrigin.protocol == "acm" else { completionHandler(nil); return }
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
