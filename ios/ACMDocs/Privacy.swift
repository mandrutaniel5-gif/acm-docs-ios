import UIKit

/// Protection for sensitive screens (recovery words, a decrypted .acm document):
/// - screen recording, AirPlay / mirroring: the content is hidden behind a blur while it lasts
/// - app switcher: the snapshot iOS keeps of the app shows the blur, not the document
/// - screenshots (iOS cannot block them): the page is told, so it can warn
/// And a quick look for signs of a jailbroken phone.
final class PrivacyGuard {
    static let shared = PrivacyGuard()
    private(set) var on = false
    private weak var host: WebViewController?
    private var cover: UIVisualEffectView?
    private var inBackground = false

    func attach(_ vc: WebViewController) {
        host = vc
        let nc = NotificationCenter.default
        nc.addObserver(self, selector: #selector(update), name: UIScreen.capturedDidChangeNotification, object: nil)
        nc.addObserver(self, selector: #selector(resign), name: UIApplication.willResignActiveNotification, object: nil)
        nc.addObserver(self, selector: #selector(active), name: UIApplication.didBecomeActiveNotification, object: nil)
        nc.addObserver(self, selector: #selector(screenshot), name: UIApplication.userDidTakeScreenshotNotification, object: nil)
    }

    func set(_ value: Bool) { on = value; update() }

    @objc private func resign() { inBackground = true; update() }
    @objc private func active() { inBackground = false; update() }

    @objc private func screenshot() {
        guard on else { return }
        host?.web.evaluateJavaScript("window.__onScreenshot && window.__onScreenshot()", completionHandler: nil)
    }

    private var captured: Bool {
        if let s = host?.view.window?.windowScene?.screen { return s.isCaptured }
        return UIScreen.main.isCaptured
    }

    @objc func update() {
        guard let root = host?.view else { return }
        let hide = on && (inBackground || captured)
        if hide && cover == nil {
            let v = UIVisualEffectView(effect: UIBlurEffect(style: .systemThickMaterial))
            v.frame = root.bounds
            v.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            let label = UILabel()
            label.text = Locale.preferredLanguages.first?.hasPrefix("ro") == false
                ? "Hidden for your safety while the screen is shared or recorded."
                : "Ascuns pentru siguranța ta cât timp ecranul e înregistrat sau partajat."
            label.numberOfLines = 0
            label.textAlignment = .center
            label.font = .systemFont(ofSize: 17, weight: .semibold)
            label.translatesAutoresizingMaskIntoConstraints = false
            v.contentView.addSubview(label)
            NSLayoutConstraint.activate([
                label.centerYAnchor.constraint(equalTo: v.contentView.centerYAnchor),
                label.leadingAnchor.constraint(equalTo: v.contentView.leadingAnchor, constant: 32),
                label.trailingAnchor.constraint(equalTo: v.contentView.trailingAnchor, constant: -32),
            ])
            label.isHidden = inBackground && !captured
            root.addSubview(v)
            cover = v
        } else if !hide, let v = cover {
            v.removeFromSuperview()
            cover = nil
        } else if let v = cover {
            root.bringSubviewToFront(v)
        }
    }

    /// Signs that the phone was jailbroken (a modified iOS lets other apps read this one).
    static func integrity() -> [String: Any] {
        #if targetEnvironment(simulator)
        return ["risk": false, "signs": []]
        #else
        var signs: [String] = []
        let paths = ["/Applications/Cydia.app", "/Applications/Sileo.app", "/Library/MobileSubstrate/MobileSubstrate.dylib",
                     "/bin/bash", "/usr/sbin/sshd", "/etc/apt", "/private/var/lib/apt/", "/var/jb", "/usr/bin/ssh", "/var/binpack"]
        for p in paths where FileManager.default.fileExists(atPath: p) { signs.append(p) }
        let probe = "/private/acm-jb-\(UUID().uuidString)"
        if (try? "x".write(toFile: probe, atomically: true, encoding: .utf8)) != nil {
            signs.append("sandbox")
            try? FileManager.default.removeItem(atPath: probe)
        }
        if let url = URL(string: "cydia://package/com.example"), UIApplication.shared.canOpenURL(url) { signs.append("cydia") }
        return ["risk": !signs.isEmpty, "signs": signs]
        #endif
    }
}
