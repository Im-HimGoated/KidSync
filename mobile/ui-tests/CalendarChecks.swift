import XCTest

/// Read-only acceptance against the account already open in Expo Go.
final class CalendarChecks: XCTestCase {
    @MainActor
    private func capture(_ app: XCUIApplication, _ name: String) {
        let attachment = XCTAttachment(screenshot: app.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    private func tapVisible(_ app: XCUIApplication, _ label: String) -> Bool {
        let matches = app.descendants(matching: .any)
            .matching(NSPredicate(format: "label == %@", label))
        // Home and the weekly brief can both contain "Open calendar".
        // Choose the visible control rather than the obscured Home button.
        for element in matches.allElementsBoundByIndex where element.isHittable {
            element.tap()
            return true
        }
        return false
    }

    @MainActor
    private func scrollHours(_ app: XCUIApplication) {
        let start = app.coordinate(withNormalizedOffset: CGVector(dx: 0.65, dy: 0.82))
        let end = app.coordinate(withNormalizedOffset: CGVector(dx: 0.65, dy: 0.62))
        start.press(forDuration: 0.1, thenDragTo: end)
    }

    @MainActor
    func testDayAndWeek() throws {
        continueAfterFailure = false
        let app = XCUIApplication(bundleIdentifier: "host.exp.Exponent")
        app.activate()
        XCTAssertTrue(app.wait(for: .runningForeground, timeout: 20))

        // Activate the existing session; never relaunch, sign out or change accounts.
        _ = tapVisible(app, "Open calendar")
        XCTAssertTrue(tapVisible(app, "Day"), "Open the signed-in English calendar before running this check")
        XCTAssertTrue(app.buttons["Day"].isSelected)
        XCTAssertTrue(tapVisible(app, "Go to today"))
        capture(app, "iPhone16Pro-Day-today")
        scrollHours(app)
        capture(app, "iPhone16Pro-Day-scrolled")
        XCTAssertTrue(tapVisible(app, "Next day"))
        capture(app, "iPhone16Pro-Day-next")
        XCTAssertTrue(tapVisible(app, "Go to today"))

        XCTAssertTrue(tapVisible(app, "Week"))
        XCTAssertTrue(app.buttons["Week"].isSelected)
        XCTAssertTrue(tapVisible(app, "Go to today"))
        capture(app, "iPhone16Pro-Week-today")
        scrollHours(app)
        capture(app, "iPhone16Pro-Week-scrolled")
        XCTAssertTrue(tapVisible(app, "Next week"))
        capture(app, "iPhone16Pro-Week-next")
        XCTAssertTrue(tapVisible(app, "Go to today"))
        // Leave the requested Day view open with the current time in view.
        XCTAssertTrue(tapVisible(app, "Day"))
        XCTAssertTrue(tapVisible(app, "Go to today"))
        capture(app, "iPhone16Pro-Day-final")
    }
}
