import UIKit
import UserNotifications

/// Chat notifications through Apple (APNs). The server sends only "a new message from <name>"; the message itself is
/// sealed on the devices. The device's address is handed to the page (Bridge "pushToken"), which keeps it on this
/// device's record of the account.
final class Push: NSObject, UNUserNotificationCenterDelegate {
    static let shared = Push()
    private var token: String?
    private var waiting: [(String?) -> Void] = []
    /// the conversation of a notification tapped before the page was ready
    var pendingChat: String?
    weak var controller: WebViewController?

    func start() { UNUserNotificationCenter.current().delegate = self }

    /// The device's address; with `ask`, the person is asked for notifications first (only the first time).
    func address(ask: Bool, _ done: @escaping (String?) -> Void) {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { s in
            let go = {
                DispatchQueue.main.async {
                    if let t = self.token { return done(t) }
                    self.waiting.append(done)
                    UIApplication.shared.registerForRemoteNotifications()
                }
            }
            switch s.authorizationStatus {
            case .authorized, .provisional, .ephemeral: go()
            case .notDetermined where ask:
                center.requestAuthorization(options: [.alert, .sound, .badge]) { ok, _ in if ok { go() } else { done(nil) } }
            default: done(nil)
            }
        }
    }

    func registered(_ data: Data?) {
        token = data.map { $0.map { String(format: "%02x", $0) }.joined() }
        let w = waiting
        waiting = []
        w.forEach { $0(token) }
    }

    /// Development builds (Xcode, ad hoc for testing) talk to Apple's test servers; TestFlight and the App Store to the real ones.
    static var environment: String {
        guard let url = Bundle.main.url(forResource: "embedded", withExtension: "mobileprovision"),
              let data = try? Data(contentsOf: url) else { return "prod" }
        let text = String(decoding: data, as: UTF8.self)
        guard let r = text.range(of: "<key>aps-environment</key>") else { return "prod" }
        return text[r.upperBound...].prefix(80).contains("development") ? "dev" : "prod"
    }

    // the app is open: the banner still shows (the page itself does not show any)
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification,
                                withCompletionHandler done: @escaping (UNNotificationPresentationOptions) -> Void) {
        done([.banner, .list, .sound])
    }

    // tapped: its conversation opens
    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse,
                                withCompletionHandler done: @escaping () -> Void) {
        if let cid = response.notification.request.content.userInfo["cid"] as? String { openChat(cid) }
        done()
    }

    func openChat(_ cid: String) {
        guard let c = controller, c.pageReady else { pendingChat = cid; return }
        c.web.evaluateJavaScript("window.__onPushOpen && window.__onPushOpen(\(Bridge.json(cid)))", completionHandler: nil)
    }
}
