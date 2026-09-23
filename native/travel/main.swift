import AppKit
import ApplicationServices
import CryptoKit
import Foundation
import Darwin

func output(_ value: [String: Any], code: Int32 = 0) -> Never {
    let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([10]))
    exit(code)
}
func label(_ e: ElementInfo) -> String {
    [e.description, e.title, e.value].first(where: { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty })?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
}
func digest(_ string: String) -> String {
    SHA256.hash(data: Data(string.utf8)).map { String(format: "%02x", $0) }.joined()
}
func isButton(_ e: ElementInfo, window: CGRect?) -> Bool {
    guard e.role == "AXButton", e.enabled, !e.hidden, let f = e.elementFrame, !f.isEmpty else { return false }
    return window?.intersects(f) ?? false
}
// Exact labels only. An unknown or ambiguous UI exposes navigation instead.
let allowLabels = Set(["allow once", "approve once", "allow", "approve", "yes, allow once", "yes, approve once", "yes, proceed"])
let denyLabels = Set(["deny", "reject", "decline", "no, deny"])
let planLabels = Set(["implement this plan", "implement plan", "start implementation"])
let stopLabels = Set(["stop", "stop task", "stop generating", "stop generation", "interrupt"])
struct Choice { let name: String; let index: Int; let token: String }
func choices(_ tx: TargetTransaction) -> (String, String, [Choice]) {
    let es = tx.snapshot.elements
    let win = es.first?.elementFrame
    let buttons = es.indices.filter { isButton(es[$0], window: win) }
    let observation = observeComposer(in: es, windowFrame: win)
    let composerFrame = composerCandidates(in: tx.snapshot).first?.elementFrame
    func matching(_ labels: Set<String>, nearComposer: Bool = false) -> [Int] {
        buttons.filter { i in
            guard labels.contains(label(es[i]).lowercased()) else { return false }
            guard nearComposer else { return true }
            guard let c = composerFrame, let f = es[i].elementFrame else { return false }
            return c.insetBy(dx: -100, dy: -100).intersects(f)
        }
    }
    let allow = matching(allowLabels), deny = matching(denyLabels), plan = matching(planLabels), stop = matching(stopLabels, nearComposer: true)
    var kind = "idle", title = "", selected: [(String,Int)] = []
    if observation?.pending == true {
        kind = "approval"; title = observation?.pendingTitle ?? "Approval required"
        if allow.count == 1 && deny.count == 1 {
            selected = [("allow",allow[0]),("deny",deny[0])]
        }
    } else if plan.count == 1 {
        kind = "plan"; title = "Plan ready"; selected = [("start",plan[0])]
    } else if stop.count == 1 {
        kind = "running"; title = "Running"; selected = [("interrupt",stop[0])]
    }
    // Retain text in the smallest shared decision container. Live output is
    // excluded from Stop's token so output arriving does not prevent a stop.
    var decisionText = title
    if kind == "approval" || kind == "plan", let first = selected.first?.1 {
        var ancestors: [Int] = []; var cursor: Int? = first
        while let i = cursor { ancestors.append(i); cursor = es[i].parentIndex }
        func below(_ child: Int, _ ancestor: Int) -> Bool {
            var i: Int? = child
            while let at = i { if at == ancestor { return true }; i = es[at].parentIndex }
            return false
        }
        if let container = ancestors.first(where: { a in selected.allSatisfy { below($0.1,a) } && (selected.count > 1 || a != first) }) {
            decisionText += "|" + es.indices.filter { below($0,container) && !es[$0].hidden }.map { label(es[$0]) }.joined(separator:"|")
        }
    }
    let out = selected.map { name, i in
        let e = es[i]
        let token = digest([tx.context.witness.conversationId,tx.context.witness.rendererWindowId,name,String(CFHash(e.element)),label(e),decisionText].joined(separator:"|"))
        return Choice(name:name,index:i,token:token)
    }
    return (kind,title,out)
}
// Global voice UI can remain visible when a task composer is covered by a preview.
// Read only: no menu opening, keyboard events, or microphone access.
func voiceState(_ snapshot: AXSnapshot) -> String {
    let labels = Set(snapshot.elements.filter { isButton($0, window: snapshot.elements.first?.elementFrame) }.map { label($0).lowercased() })
    if !labels.isDisjoint(with: ["end voice chat", "end call", "stop voice chat"]) {
        if !labels.isDisjoint(with: ["unmute microphone", "unmute mic", "unmute"]) { return "muted" }
        return "active"
    }
    if !labels.isDisjoint(with: ["start new voice chat", "start voice chat"]) { return "off" }
    return "unknown"
}
let args = Array(CommandLine.arguments.dropFirst())
guard args.count >= 2 else { output(["ok":false,"reason":"arguments"],code:1) }
let command = args[0]
guard Set(["globals", "confirm", "navigate", "read", "inspect", "act"]).contains(command) else {
    output(["ok":false,"reason":"unsupported-command"],code:1)
}
let threadId = command == "inspect" && args[1] == "current" ? (globallyCurrentWitness(in: desktopLogFiles(), scoped: true)?.conversationId ?? "") : args[1]
var appRunning = false
var captured = false
var globals: [String:Any] = ["voice":"unknown"]
do {
    let app = try runningCodex(); appRunning = true
    guard AXIsProcessTrusted() else { output(["ok":false,"reason":"accessibility","appRunning":true],code:1) }
    let appElement = AXUIElementCreateApplication(app.processIdentifier)
    if command == "navigate" {
        guard UUID(uuidString: threadId) != nil else { output(["ok":false,"reason":"arguments"],code:1) }
        AXUIElementSetMessagingTimeout(appElement, 0.25)
        let target: TargetContext
        if let current = try? captureCurrentCodex(app, appElement:appElement, threadId:threadId),
           (try? verifyCurrentTarget(app, appElement:appElement, token:encodeWitnessToken(current.witness))) != nil {
            target = current
        } else {
            target = try focusCodex(app, appElement:appElement, threadId:threadId, navigationOnly:true)
        }
        // No control tokens: this result authorizes read acknowledgement only.
        output(["ok":true,"appRunning":true,"threadId":threadId,"windowId":target.witness.rendererWindowId])
    }
    if command == "globals" {
        let windows = attribute(appElement,kAXWindowsAttribute as CFString) as? [AXUIElement] ?? []
        let snapshots = windows.prefix(4).map { captureAXSnapshot($0, maximumDepth: maximumCodexWindowTraversalDepth) }
        let states = snapshots.map { voiceState($0) }
        let voice = states.contains("muted") ? "muted" : states.contains("active") ? "active" : states.contains("off") ? "off" : "unknown"
        var response:[String:Any] = ["ok":true,"appRunning":true,"voice":voice]
        if args[1] == "inspect" { response["voiceControls"] = snapshots.flatMap { snapshot in snapshot.elements.filter { isButton($0,window:snapshot.elements.first?.elementFrame) && ["voice","microphone","call"].contains(where:label($0).lowercased().contains) }.map { label($0) } } }
        output(response)
    }
    let target = try captureCurrentCodex(app, appElement:appElement, threadId:threadId)
    if command == "confirm" {
        // For navigation only. Direct actions still require the full composer transaction below.
        try verifyCurrentTarget(app, appElement:appElement, token:encodeWitnessToken(target.witness))
        output(["ok":true,"appRunning":true,"threadId":threadId,"windowId":target.witness.rendererWindowId])
    }
    var tx = try preflightTargetTransaction(target,app:app,appElement:appElement)
    captured = true
    globals["voice"] = voiceState(tx.snapshot)
    if let plan = try? readMode("plan", elements:tx.snapshot.elements) { globals["plan"] = plan }
    if let fast = pickerFastState(in:tx.snapshot.elements) { globals["fast"] = fast }
    let (kind,title,offered) = choices(tx)
    if command == "read" || command == "inspect" {
        var response: [String:Any] = ["ok":true,"appRunning":true,"threadId":threadId,"windowId":target.witness.rendererWindowId,"kind":kind,"title":title,"choices":offered.map { ["action":$0.name,"token":$0.token] }]
        response["ui"] = globals
        if command == "inspect" { response["buttons"] = tx.snapshot.elements.filter { isButton($0,window:tx.snapshot.elements.first?.elementFrame) }.map { label($0) } }
        output(response)
    }
    guard command == "act", args.count == 4, let choice = offered.first(where: { $0.name == args[2] && $0.token == args[3] }) else {
        output(["ok":false,"reason":"request-changed","appRunning":true],code:1)
    }
    // The exact AX control, current task/window and decision content were
    // checked in this process; no generic Enter/Escape is sent.
    try pressAccessibilityControl(tx.snapshot.elements[choice.index].element)
    guard waitUntil(timeout: 2.0, operation: { () -> Bool? in
        guard let refreshed = try? preflightTargetTransaction(target, app: app, appElement: appElement) else { return nil }
        return choices(refreshed).2.contains(where: { $0.name == choice.name && $0.token == choice.token }) ? nil : true
    }) != nil else {
        output(["ok":false,"reason":"not-confirmed","appRunning":true],code:1)
    }
    try recordTransactionOperation(&tx)
    try postflightTargetTransaction(&tx,app:app,appElement:appElement)
    output(["ok":true,"action":choice.name,"threadId":threadId])
} catch {
    output(["ok":false,"ui":globals,"appRunning":appRunning,"reason":!appRunning ? "offline" : captured ? "control-failed" : "no-focus","message":String(describing:error)],code:1)
}
