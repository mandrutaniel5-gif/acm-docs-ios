import UIKit
import AVFoundation

/// Full-screen camera that reads one QR code (an ACM Docs contact code) and closes.
final class QRScannerViewController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    private let session = AVCaptureSession()
    private var preview: AVCaptureVideoPreviewLayer?
    private var finished = false
    private let titleText: String
    private let done: (String?, String?) -> Void

    /// done(code, error): code = the text of the QR; both nil = cancelled
    init(title: String, done: @escaping (String?, String?) -> Void) {
        self.titleText = title
        self.done = done
        super.init(nibName: nil, bundle: nil)
        modalPresentationStyle = .fullScreen
    }
    required init?(coder: NSCoder) { fatalError() }

    override var preferredStatusBarStyle: UIStatusBarStyle { .lightContent }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black

        // frame where the code should go
        let frame = UIView()
        frame.translatesAutoresizingMaskIntoConstraints = false
        frame.layer.borderColor = UIColor.white.withAlphaComponent(0.9).cgColor
        frame.layer.borderWidth = 3
        frame.layer.cornerRadius = 28
        view.addSubview(frame)

        let label = UILabel()
        label.translatesAutoresizingMaskIntoConstraints = false
        label.text = titleText
        label.textColor = .white
        label.font = .systemFont(ofSize: 17, weight: .semibold)
        label.numberOfLines = 0
        label.textAlignment = .center
        view.addSubview(label)

        let close = UIButton(type: .system)
        close.translatesAutoresizingMaskIntoConstraints = false
        close.setTitle(Locale.preferredLanguages.first?.hasPrefix("ro") == false ? "Cancel" : "Anulează", for: .normal)
        close.titleLabel?.font = .systemFont(ofSize: 17, weight: .semibold)
        close.setTitleColor(.white, for: .normal)
        close.backgroundColor = UIColor.white.withAlphaComponent(0.18)
        close.layer.cornerRadius = 24
        close.accessibilityIdentifier = "qr-cancel"
        close.addTarget(self, action: #selector(cancel), for: .touchUpInside)
        view.addSubview(close)

        NSLayoutConstraint.activate([
            frame.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            frame.centerYAnchor.constraint(equalTo: view.centerYAnchor, constant: -20),
            frame.widthAnchor.constraint(equalTo: view.widthAnchor, multiplier: 0.68),
            frame.heightAnchor.constraint(equalTo: frame.widthAnchor),
            label.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 28),
            label.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -28),
            label.bottomAnchor.constraint(equalTo: frame.topAnchor, constant: -28),
            close.centerXAnchor.constraint(equalTo: view.centerXAnchor),
            close.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -24),
            close.widthAnchor.constraint(equalToConstant: 170),
            close.heightAnchor.constraint(equalToConstant: 48),
        ])

        AVCaptureDevice.requestAccess(for: .video) { ok in
            DispatchQueue.main.async { ok ? self.startCamera() : self.finish(nil, "camera-denied") }
        }
    }

    private func startCamera() {
        guard let device = AVCaptureDevice.default(for: .video),
              let input = try? AVCaptureDeviceInput(device: device), session.canAddInput(input) else {
            return finish(nil, "camera")
        }
        session.addInput(input)
        let output = AVCaptureMetadataOutput()
        guard session.canAddOutput(output) else { return finish(nil, "camera") }
        session.addOutput(output)
        output.setMetadataObjectsDelegate(self, queue: .main)
        output.metadataObjectTypes = [.qr]
        let layer = AVCaptureVideoPreviewLayer(session: session)
        layer.videoGravity = .resizeAspectFill
        layer.frame = view.bounds
        view.layer.insertSublayer(layer, at: 0)
        preview = layer
        DispatchQueue.global(qos: .userInitiated).async { self.session.startRunning() }
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        preview?.frame = view.bounds
    }

    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let code = metadataObjects.compactMap({ ($0 as? AVMetadataMachineReadableCodeObject)?.stringValue }).first else { return }
        UINotificationFeedbackGenerator().notificationOccurred(.success)
        finish(code, nil)
    }

    @objc private func cancel() { finish(nil, nil) }

    private func finish(_ code: String?, _ error: String?) {
        if finished { return }
        finished = true
        let s = session
        DispatchQueue.global(qos: .userInitiated).async { if s.isRunning { s.stopRunning() } }
        dismiss(animated: true) { self.done(code, error) }
    }
}
