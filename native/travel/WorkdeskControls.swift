import AppKit
import ApplicationServices
import Foundation

// Read the user's actual bindings, including overrides, on every press.
func workdeskShortcut(_ command: String, fallback: String? = nil, targetPID: pid_t? = nil) throws {
    let url = FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".codex/keybindings.json")
    let data = try Data(contentsOf: url)
    let bindings = try JSONSerialization.jsonObject(with: data) as? [[String: Any]] ?? []
    let entry = bindings.first { $0["command"] as? String == command }
    guard let key = entry == nil ? fallback : entry?["key"] as? String else {
        throw ControlError.failed("No keyboard shortcut is configured for \(command).")
    }
    let parts = key.lowercased().split(separator: "+").map(String.init)
    let codes: [String: CGKeyCode] = ["a":0,"s":1,"d":2,"f":3,"h":4,"g":5,"z":6,"x":7,"c":8,"v":9,"b":11,"q":12,"w":13,"e":14,"r":15,"y":16,"t":17,"o":31,"u":32,"i":34,"p":35,"l":37,"j":38,"k":40,"n":45,"m":46,"space":49,"enter":36,"return":36,"tab":48]
    guard let last = parts.last, let code = codes[last] else { throw ControlError.failed("Unsupported shortcut: \(key)") }
    var flags: CGEventFlags = []
    for modifier in parts.dropLast() {
        switch modifier {
        case "ctrl", "control": flags.insert(.maskControl)
        case "cmd", "command", "cmdorctrl": flags.insert(.maskCommand)
        case "alt", "option": flags.insert(.maskAlternate)
        case "shift": flags.insert(.maskShift)
        default: throw ControlError.failed("Unsupported shortcut modifier: \(modifier)")
        }
    }
    if let pid = targetPID {
        guard let down = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: true),
              let up = CGEvent(keyboardEventSource: nil, virtualKey: code, keyDown: false) else {
            throw ControlError.failed("Could not create shortcut events.")
        }
        down.flags = flags; up.flags = flags
        down.postToPid(pid); usleep(60_000); up.postToPid(pid)
        usleep(400_000)
    } else { try pressKey(code, flags: flags); usleep(400_000) }
}

func workdeskGlobal(_ command: String, app: NSRunningApplication) throws {
    if command == "voice" {
        // This is the app's OS-global realtime session toggle, not dictation.
        try workdeskShortcut("realtimeVoice")
        return
    }
    app.activate(options: [])
    AXUIElementSetAttributeValue(AXUIElementCreateApplication(app.processIdentifier), kAXFrontmostAttribute as CFString, kCFBooleanTrue)
    guard waitUntil(timeout: 2, operation: { boolAttribute(AXUIElementCreateApplication(app.processIdentifier), kAXFrontmostAttribute as CFString) == true ? true : nil }) != nil else {
        throw ControlError.failed("ChatGPT did not become active.")
    }
    usleep(200_000)
    switch command {
    case "quick-chat": try workdeskShortcut("quickChat", fallback: "Command+Alt+N", targetPID: app.processIdentifier)
    case "plan": try workdeskShortcut("composer.togglePlanMode", targetPID: app.processIdentifier)
    case "new-chat":
        let opener = Process()
        opener.executableURL = URL(fileURLWithPath: "/usr/bin/open")
        opener.arguments = ["-b", "com.openai.codex", "codex://threads/new?mode=codex"]
        try opener.run(); opener.waitUntilExit()
        guard opener.terminationStatus == 0 else { throw ControlError.failed("Could not open a new Codex task.") }
        usleep(400_000)
    default: throw ControlError.failed("Unsupported work desk command.")
    }
}

