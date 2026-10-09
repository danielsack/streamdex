import AppKit
import Foundation

func requestCodexForeground(_ app: NSRunningApplication) -> Bool {
    guard let url = app.bundleURL else { return false }
    let configuration = NSWorkspace.OpenConfiguration()
    configuration.activates = true
    // A background helper's activate() request can leave the app behind other
    // windows. Use the normal application-opening path for this running app.
    NSWorkspace.shared.openApplication(at: url, configuration: configuration)
    return true
}

// Shared by both production helpers. The injected effects also let native
// fixtures reproduce activation races without accessing a running app.
func navigateToFocusedTask(
    threadId: String,
    isFrontmost: () -> Bool,
    activate: () -> Bool,
    focusedWindowAvailable: () -> Bool,
    captureCursor: () -> DesktopLogCursor,
    openTarget: () -> Bool,
    observe: (DesktopLogCursor) -> DesktopWitness?,
    confirm: (DesktopWitness) -> Bool,
    now: () -> TimeInterval = { ProcessInfo.processInfo.systemUptime },
    pause: () -> Void = { RunLoop.current.run(until: Date().addingTimeInterval(0.04)) }
) throws -> DesktopWitness {
    func wait<T>(_ timeout: TimeInterval, _ read: () -> T?) -> T? {
        let deadline = now() + timeout
        repeat {
            if let value = read() { return value }
            pause()
        } while now() < deadline
        return nil
    }
    func requestedWitness(_ cursor: DesktopLogCursor) -> DesktopWitness? {
        guard let witness = observe(cursor),
              witness.conversationId == threadId,
              !witness.rendererWindowId.isEmpty
        else { return nil }
        return witness
    }

    // Capture before activation: bringing forward an already-open task may
    // produce its only fresh focus event. Reopening it need not emit another.
    let cursor = captureCursor()
    if !isFrontmost() && !activate() {
        throw ControlError.failed("Could not bring Codex to the foreground.", "NO_FOCUS")
    }
    guard wait(1.0, {
        isFrontmost() && focusedWindowAvailable() ? true : nil
    }) != nil else {
        throw ControlError.failed("Codex did not expose a focused foreground window.", "NO_FOCUS")
    }
    if let current = requestedWitness(cursor), confirm(current) {
        return current
    }

    guard openTarget() else {
        throw ControlError.failed("Could not open the target Codex task.", "NO_FOCUS")
    }
    guard let witness = wait(3.0, { requestedWitness(cursor) }) else {
        throw ControlError.failed("Codex emitted no fresh focused task/window witness after navigation.", "NO_FOCUS")
    }
    // AX focus can settle just after the log event. Retry only confirmation
    // of this captured witness; never replace it with a later task/window.
    guard wait(0.6, { confirm(witness) ? true : nil }) != nil else {
        throw ControlError.failed("The exact focused Codex task/window could not be confirmed.", "TARGET_MISMATCH")
    }
    return witness
}
