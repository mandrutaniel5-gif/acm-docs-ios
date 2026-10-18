import XCTest

/// Real taps on the simulator (like a finger): the glass bar, "+", every main screen and its
/// Back button. Screenshots go to SHOTS_DIR as <device>-<step>.png for a visual check.
final class ACMDocsUITests: XCTestCase {
    var app: XCUIApplication!
    let env = ProcessInfo.processInfo.environment
    var device: String { env["DEVICE_TAG"] ?? "device" }
    let tabs = ["home", "files", "invoices", "settings"]
    let tabTitles = ["Acasă", "Fișiere", "Facturi", "Setări", "Creează"]

    override func setUpWithError() throws {
        continueAfterFailure = true
        app = XCUIApplication()
        app.launchArguments = ["-uitest"]
        app.launch()
        // the page is ready when its home screen shows
        _ = app.webViews.firstMatch.waitForExistence(timeout: 30)
        sleep(4)
    }

    // MARK: helpers

    func shot(_ name: String) {
        let dir = env["SHOTS_DIR"] ?? NSTemporaryDirectory()
        try? FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true)
        let png = XCUIScreen.main.screenshot().pngRepresentation
        try? png.write(to: URL(fileURLWithPath: dir).appendingPathComponent("\(device)-\(name).png"))
    }

    var nativeBar: Bool { app.buttons["tab-home"].waitForExistence(timeout: 8) }

    func webButton(_ prefix: String) -> XCUIElement {
        app.webViews.buttons.matching(NSPredicate(format: "label BEGINSWITH %@", prefix)).firstMatch
    }

    /// Home is back: the glass bar (iOS 26) or the page's own bar (older iOS / iPad side bar).
    func homeShown(timeout: TimeInterval = 10) -> Bool {
        let end = Date().addingTimeInterval(timeout)
        while Date() < end {
            if app.buttons["tab-home"].exists && app.buttons["tab-home"].isHittable { return true }
            if webButton("Acasă").exists && webButton("Acasă").isHittable { return true }
            if webButton("Scanează").exists && webButton("Scanează").isHittable { return true }
            usleep(300_000)
        }
        return false
    }

    func dismissSheetIfAny() {
        // exact names: "Anulează (Ctrl+Z)" is the Undo button of the editors, not a dialog's Cancel
        for label in ["Anulează", "Închide", "Renunță", "Mai târziu"] {
            let b = app.webViews.buttons.matching(NSPredicate(format: "label == %@", label)).firstMatch
            if b.exists && b.isHittable { b.tap(); sleep(1); return }
        }
    }

    func tapBack() -> Bool {
        for label in ["Înapoi la început", "Înapoi"] {
            let q = app.webViews.buttons.matching(NSPredicate(format: "label == %@", label))
            for i in 0..<q.count {
                let b = q.element(boundBy: i)
                if b.exists && b.isHittable {
                    XCTAssertGreaterThanOrEqual(b.frame.width, 36, "Back button too small on \(device)")
                    b.tap()
                    return true
                }
            }
        }
        return false
    }

    /// No button of the page may stay under the glass bar once the page is scrolled to the end.
    func checkNothingUnderBar(_ step: String) {
        guard app.buttons["tab-home"].exists else { return }
        let barTop = app.buttons["tab-home"].frame.minY - 6
        for _ in 0..<4 { app.webViews.firstMatch.swipeUp(velocity: .fast) }
        sleep(1)
        shot("\(step)-bottom")
        let all = app.webViews.buttons.allElementsBoundByIndex
        for b in all where b.exists {
            let f = b.frame
            if f.isEmpty || tabTitles.contains(where: { b.label.hasPrefix($0) }) { continue }
            if f.maxY > barTop && f.minY < app.frame.maxY - 1 && f.minY < barTop {
                // partly under the bar: still reachable if most of it is above
                if f.midY > barTop { XCTFail("\(device) \(step): '\(b.label)' is hidden under the bar") }
            }
        }
        for _ in 0..<4 { app.webViews.firstMatch.swipeDown(velocity: .fast) }
    }

    // MARK: tests

    func test1_TabBar() throws {
        shot("01-home")
        guard nativeBar else {
            shot("01-no-native-bar")
            throw XCTSkip("no glass bar here (iPad layout or iOS < 26)")
        }
        for (i, tab) in (tabs.dropFirst() + ["home"]).enumerated() {
            let b = app.buttons["tab-\(tab)"]
            XCTAssertTrue(b.isHittable, "\(device): tab \(tab) cannot be tapped")
            b.tap()
            let ok = NSPredicate(format: "value == 'page-on'")
            let exp = expectation(for: ok, evaluatedWith: b)
            XCTAssertEqual(XCTWaiter().wait(for: [exp], timeout: 6), .completed, "\(device): tapping \(tab) did not switch the page")
            sleep(1)
            shot(String(format: "02-tab-%d-%@", i, tab))
            checkNothingUnderBar("03-\(tab)")
        }
    }

    func test2_PlusMenu() throws {
        guard nativeBar else { throw XCTSkip("no glass bar here") }
        let plus = app.buttons["tab-plus"]
        XCTAssertTrue(plus.isHittable, "\(device): + cannot be tapped")
        plus.tap()
        sleep(2)
        shot("04-plus-menu")
        // the menu covers the bar: the bar must step aside
        XCTAssertFalse(app.buttons["tab-files"].isHittable, "\(device): glass bar stays on top of the + menu")
        app.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.12)).tap()
        sleep(2)
        XCTAssertTrue(homeShown(), "\(device): bar did not come back after closing the + menu")
        shot("05-after-plus")
    }

    /// The field being typed into must stay visible above the keyboard (company wizard, step 2:
    /// a sheet at the bottom of the screen, the worst case).
    func test4_KeyboardDoesNotCoverField() throws {
        if app.buttons["tab-home"].exists { app.buttons["tab-home"].tap(); sleep(1) }
        let invoice = webButton("Factură")
        guard invoice.waitForExistence(timeout: 8) else { XCTFail("\(device): no Factură on home"); return }
        invoice.tap()
        sleep(3)
        let next = webButton("Continuă")
        guard next.waitForExistence(timeout: 6) else { shot("10-kb-no-wizard"); throw XCTSkip("company wizard did not open (company already set?)") }
        next.tap()
        sleep(2)
        let fields = app.webViews.textFields.allElementsBoundByIndex.filter { $0.exists && !$0.frame.isEmpty && $0.frame.minY < app.frame.maxY }
        guard let field = fields.max(by: { $0.frame.minY < $1.frame.minY }) else { shot("10-kb-no-fields"); XCTFail("\(device): no text fields in step 2"); return }
        shot("10-kb-before")
        field.tap()
        let kb = app.keyboards.firstMatch
        guard kb.waitForExistence(timeout: 6) else { shot("10-kb-none"); throw XCTSkip("no on-screen keyboard in this simulator") }
        sleep(2) // keyboard animation + the page moving the field into view
        shot("11-kb-open")
        let f = field.frame, k = kb.frame
        XCTAssertLessThanOrEqual(f.maxY, k.minY + 1, "\(device): the keyboard covers the field (field bottom \(f.maxY), keyboard top \(k.minY))")
        XCTAssertGreaterThanOrEqual(f.minY, 0, "\(device): the field went off the top of the screen")
        field.typeText("RO123")
        sleep(1)
        shot("12-kb-typed")
        XCTAssertLessThanOrEqual(field.frame.maxY, kb.frame.minY + 1, "\(device): field covered while typing")
    }

    func test3_ScreensAndBack() throws {
        for (name, prefix) in [("document", "Document"), ("tabel", "Tabel"), ("prezentare", "Prezentare"), ("factura", "Factură")] {
            if app.buttons["tab-home"].exists { app.buttons["tab-home"].tap(); sleep(1) }
            let open = webButton(prefix)
            guard open.waitForExistence(timeout: 8) else { XCTFail("\(device): no '\(prefix)' on home"); continue }
            open.tap()
            sleep(3)
            shot("06-\(name)-open")
            dismissSheetIfAny()
            sleep(1)
            shot("07-\(name)-screen")
            if !tapBack() {
                dismissSheetIfAny()
                if !tapBack() {
                    // e.g. the invoice asks for the company first and, cancelled, stays home
                    if homeShown(timeout: 2) { shot("08-\(name)-stayed-home"); continue }
                    XCTFail("\(device): no Back button to tap on \(name)"); shot("08-\(name)-no-back"); continue
                }
            }
            sleep(2)
            dismissSheetIfAny() // e.g. "save changes?"
            if !homeShown(timeout: 4) { shot("09-\(name)-back-not-home") }
            XCTAssertTrue(homeShown(), "\(device): Back on \(name) did not return home")
            shot("09-\(name)-after-back")
        }
    }
}
