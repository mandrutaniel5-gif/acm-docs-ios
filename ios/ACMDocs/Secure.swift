import Foundation
import LocalAuthentication
import AuthenticationServices
import Security
import UIKit

/// Account keys and the 24 recovery words, in the iPhone's Keychain.
/// Each item is protected by the Secure Enclave and opens only after Face ID / Touch ID
/// (or the phone's code), and never leaves this phone (no iCloud sync, no backup copy).
enum Secure {
    static let service = "ro.acmcode.docs.secure"

    /// UI tests on the simulator (no Face ID enrolled): only in Debug builds launched with -uitest.
    static var testBypass: Bool {
        #if DEBUG
        let a = ProcessInfo.processInfo.arguments; return a.contains("-uitest") || a.contains("-selftest")
        #else
        return false
        #endif
    }

    enum Failure: Error { case noPasscode, cancelled, failed(OSStatus) }

    /// quiet: a device-only item read without Face ID (the device's own session key). Never leaves
    /// this phone, not in backups, readable only after the first unlock since the phone started.
    static func set(_ name: String, _ data: Data, quiet: Bool = false) throws {
        let base: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                   kSecAttrService as String: service,
                                   kSecAttrAccount as String: name]
        SecItemDelete(base as CFDictionary)
        var item = base
        item[kSecValueData as String] = data
        if quiet {
            item[kSecAttrAccessible as String] = kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly
        } else if testBypass {
            item[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        } else {
            var err: Unmanaged<CFError>?
            guard let access = SecAccessControlCreateWithFlags(nil, kSecAttrAccessibleWhenPasscodeSetThisDeviceOnly, .userPresence, &err) else {
                throw Failure.noPasscode
            }
            item[kSecAttrAccessControl as String] = access
        }
        let status = SecItemAdd(item as CFDictionary, nil)
        if status == errSecSuccess { return }
        // no code set on the phone: the keys cannot be protected, so they are not saved
        if status == errSecAuthFailed || status == errSecNotAvailable || status == -25293 { throw Failure.noPasscode }
        throw Failure.failed(status)
    }

    /// Asks for Face ID with `reason`. nil = nothing saved under this name.
    static func get(_ name: String, reason: String, quiet: Bool = false) throws -> Data? {
        var q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrService as String: service,
                                kSecAttrAccount as String: name,
                                kSecReturnData as String: true,
                                kSecMatchLimit as String: kSecMatchLimitOne]
        if !testBypass && !quiet {
            let ctx = LAContext()
            ctx.localizedReason = reason
            q[kSecUseAuthenticationContext as String] = ctx
        }
        var out: CFTypeRef?
        let status = SecItemCopyMatching(q as CFDictionary, &out)
        switch status {
        case errSecSuccess: return out as? Data
        case errSecItemNotFound: return nil
        case errSecUserCanceled, errSecAuthFailed: throw Failure.cancelled
        default: throw Failure.failed(status)
        }
    }

    /// Is something saved under this name? (no Face ID asked)
    static func has(_ name: String) -> Bool {
        let ctx = LAContext()
        ctx.interactionNotAllowed = true
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrService as String: service,
                                kSecAttrAccount as String: name,
                                kSecUseAuthenticationContext as String: ctx,
                                kSecMatchLimit as String: kSecMatchLimitOne]
        let status = SecItemCopyMatching(q as CFDictionary, nil)
        return status == errSecSuccess || status == errSecInteractionNotAllowed
    }

    static func delete(_ name: String) {
        let q: [String: Any] = [kSecClass as String: kSecClassGenericPassword,
                                kSecAttrService as String: service,
                                kSecAttrAccount as String: name]
        SecItemDelete(q as CFDictionary)
    }

    /// Face ID / Touch ID / the phone's code, before something important.
    static func confirmOwner(reason: String, done: @escaping (Bool) -> Void) {
        if testBypass { return done(true) }
        let ctx = LAContext()
        var err: NSError?
        guard ctx.canEvaluatePolicy(.deviceOwnerAuthentication, error: &err) else { return done(false) }
        ctx.evaluatePolicy(.deviceOwnerAuthentication, localizedReason: reason) { ok, _ in
            DispatchQueue.main.async { done(ok) }
        }
    }
}

/// Sign-in pages (Google) open in Safari's secure sheet, never inside the app's own page.
final class OAuthRunner: NSObject, ASWebAuthenticationPresentationContextProviding {
    private var session: ASWebAuthenticationSession?
    private weak var anchor: UIWindow?

    init(anchor: UIWindow?) { self.anchor = anchor }

    func start(url: URL, callbackScheme: String, done: @escaping (URL?, String?) -> Void) {
        let s = ASWebAuthenticationSession(url: url, callbackURLScheme: callbackScheme) { result, error in
            DispatchQueue.main.async {
                if let result = result { done(result, nil) }
                else if let e = error as? ASWebAuthenticationSessionError, e.code == .canceledLogin { done(nil, "cancel") }
                else { done(nil, error?.localizedDescription ?? "oauth") }
            }
        }
        s.presentationContextProvider = self
        s.prefersEphemeralWebBrowserSession = true
        session = s
        if !s.start() { done(nil, "oauth") }
    }

    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        anchor ?? ASPresentationAnchor()
    }
}
