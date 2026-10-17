import UIKit

/// iOS 26+: the bottom bar of the app (Acasă, Fișiere, +, Facturi, Setări) drawn by iOS itself
/// with Liquid Glass, floating over the page. The page keeps its own bar (invisible) and stays
/// the source of truth: taps here press the page's buttons, and the page tells us which tab is
/// on and when the bar must hide (another screen, a sheet or a dialog on top).
@available(iOS 26.0, *)
final class GlassTabBar: UIView {
    struct Item { let view: String; let title: String; let symbol: String }

    static let items = [
        Item(view: "home", title: "Acasă", symbol: "house.fill"),
        Item(view: "files", title: "Fișiere", symbol: "folder.fill"),
        Item(view: "invoices", title: "Facturi", symbol: "doc.text.fill"),
        Item(view: "settings", title: "Setări", symbol: "gearshape.fill"),
    ]

    var onSelect: ((String) -> Void)?
    var onPlus: (() -> Void)?

    private let capsule = UIVisualEffectView()
    private let plus = UIVisualEffectView()
    private let selection = UIView()
    private let stack = UIStackView()
    private var buttons: [TabButton] = []
    private(set) var active = "home"
    private let feedback = UISelectionFeedbackGenerator()

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = .clear

        // the four tabs, on one glass capsule
        let glass = UIGlassEffect()
        glass.isInteractive = true
        capsule.effect = glass
        capsule.layer.cornerCurve = .continuous
        capsule.clipsToBounds = true
        addSubview(capsule)

        selection.backgroundColor = UIColor.label.withAlphaComponent(0.09)
        selection.layer.cornerCurve = .continuous
        capsule.contentView.addSubview(selection)

        stack.axis = .horizontal
        stack.distribution = .fillEqually
        capsule.contentView.addSubview(stack)
        for item in Self.items {
            let b = TabButton(item: item)
            // TabButton is a plain UIControl: it sends touchUpInside (not primaryActionTriggered)
            b.addAction(UIAction { [weak self] _ in self?.tap(item.view) }, for: .touchUpInside)
            buttons.append(b)
            stack.addArrangedSubview(b)
        }

        // "+" on its own tinted glass circle, like the separate button in Apple's apps
        let tinted = UIGlassEffect()
        tinted.isInteractive = true
        tinted.tintColor = .systemBlue
        plus.effect = tinted
        plus.clipsToBounds = true
        addSubview(plus)
        let plusButton = UIButton(type: .system)
        plusButton.setImage(UIImage(systemName: "plus", withConfiguration: UIImage.SymbolConfiguration(pointSize: 22, weight: .semibold)), for: .normal)
        plusButton.tintColor = .white
        plusButton.accessibilityLabel = "Creează"
        plusButton.accessibilityIdentifier = "tab-plus"
        plusButton.addAction(UIAction { [weak self] _ in
            self?.feedback.selectionChanged()
            self?.onPlus?()
        }, for: .primaryActionTriggered)
        plusButton.frame = plus.contentView.bounds
        plusButton.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        plus.contentView.addSubview(plusButton)

        setActive("home", animated: false)
    }

    required init?(coder: NSCoder) { fatalError() }

    override func layoutSubviews() {
        super.layoutSubviews()
        let h = bounds.height
        let gap: CGFloat = 10
        plus.frame = CGRect(x: bounds.width - h, y: 0, width: h, height: h)
        plus.layer.cornerRadius = h / 2
        capsule.frame = CGRect(x: 0, y: 0, width: bounds.width - h - gap, height: h)
        capsule.layer.cornerRadius = h / 2
        stack.frame = capsule.contentView.bounds.insetBy(dx: 4, dy: 4)
        placeSelection()
    }

    private func placeSelection() {
        guard let i = Self.items.firstIndex(where: { $0.view == active }), i < buttons.count else { selection.alpha = 0; return }
        let f = stack.convert(buttons[i].frame, to: capsule.contentView)
        selection.frame = f
        selection.layer.cornerRadius = f.height / 2
        selection.alpha = 1
    }

    private func tap(_ view: String) {
        if view != active { feedback.selectionChanged() }
        setActive(view, animated: true)
        onSelect?(view)
    }

    /// What the page itself says is on (UI tests check it: proves the tap reached the page).
    func setPageActive(_ view: String) {
        for b in buttons { b.accessibilityValue = b.item.view == view ? "page-on" : "page-off" }
    }

    func setActive(_ view: String, animated: Bool) {
        active = view
        for b in buttons { b.isOn = b.item.view == view }
        guard animated else { setNeedsLayout(); return }
        UIView.animate(withDuration: 0.35, delay: 0, usingSpringWithDamping: 0.8, initialSpringVelocity: 0, options: [.beginFromCurrentState, .allowUserInteraction]) {
            self.placeSelection()
        }
    }

    private(set) var shown = false

    func setShown(_ shown: Bool) {
        guard shown != self.shown else { return }
        self.shown = shown
        if shown { isHidden = false }
        UIView.animate(withDuration: 0.25, delay: 0, options: [.beginFromCurrentState]) {
            self.alpha = shown ? 1 : 0
            self.transform = shown ? .identity : CGAffineTransform(translationX: 0, y: 24).scaledBy(x: 0.96, y: 0.96)
        } completion: { _ in
            if !self.shown { self.isHidden = true }
        }
    }
}

@available(iOS 26.0, *)
private final class TabButton: UIControl {
    let item: GlassTabBar.Item
    private let icon = UIImageView()
    private let label = UILabel()

    var isOn = false {
        didSet {
            let c: UIColor = isOn ? .systemBlue : .label
            icon.tintColor = c
            label.textColor = c
            accessibilityTraits = isOn ? [.button, .selected] : .button
        }
    }

    init(item: GlassTabBar.Item) {
        self.item = item
        super.init(frame: .zero)
        icon.image = UIImage(systemName: item.symbol, withConfiguration: UIImage.SymbolConfiguration(pointSize: 19, weight: .medium))
        icon.contentMode = .center
        label.text = item.title
        label.font = .systemFont(ofSize: 10.5, weight: .semibold)
        label.textAlignment = .center
        let col = UIStackView(arrangedSubviews: [icon, label])
        col.axis = .vertical
        col.alignment = .center
        col.spacing = 2
        col.isUserInteractionEnabled = false
        col.translatesAutoresizingMaskIntoConstraints = false
        addSubview(col)
        NSLayoutConstraint.activate([
            col.centerXAnchor.constraint(equalTo: centerXAnchor),
            col.centerYAnchor.constraint(equalTo: centerYAnchor),
        ])
        accessibilityLabel = item.title
        accessibilityIdentifier = "tab-" + item.view
        accessibilityTraits = .button
        isAccessibilityElement = true
        isOn = false
    }

    required init?(coder: NSCoder) { fatalError() }

    override var isHighlighted: Bool {
        didSet { UIView.animate(withDuration: 0.12) { self.transform = self.isHighlighted ? CGAffineTransform(scaleX: 0.92, y: 0.92) : .identity } }
    }
}
