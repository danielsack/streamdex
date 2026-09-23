import AppKit
import ApplicationServices
import Foundation

func output(_ value: [String:Any]) -> Never {
    let data = try! JSONSerialization.data(withJSONObject: value, options: [.sortedKeys])
    FileHandle.standardOutput.write(data); FileHandle.standardOutput.write(Data([10])); exit(0)
}
let command = CommandLine.arguments.dropFirst().first ?? ""
#if STREAMDEX_TESTING
let supported = ["read", "--fixture"]
#else
let supported = ["read"]
#endif
guard supported.contains(command) else { output(["ok":false,"reason":"unsupported-command"]) }
let input = FileHandle.standardInput.readData(ofLength: 65537)
guard input.count <= 65536, let payload = try? JSONSerialization.jsonObject(with:input) as? [String:Any],
      let titles = payload["titles"] as? [String], titles.count <= 16, titles.allSatisfy({ !$0.isEmpty && $0.utf8.count <= 2048 })
else { output(["ok":false,"reason":"arguments"]) }
func result(_ nodes: [SidebarNode]) -> Never {
    let encoded = try! JSONEncoder().encode(sidebarRows(nodes,titles:titles))
    output(["ok":true,"rows":try! JSONSerialization.jsonObject(with:encoded)])
}
#if STREAMDEX_TESTING
if command == "--fixture" {
    guard let raw = payload["nodes"], let data = try? JSONSerialization.data(withJSONObject:raw),
          let nodes = try? JSONDecoder().decode([SidebarNode].self,from:data), nodes.count <= 4096
    else { output(["ok":false,"reason":"fixture-arguments"]) }
    result(nodes)
}
#endif
let apps = NSRunningApplication.runningApplications(withBundleIdentifier:"com.openai.codex").filter { !$0.isTerminated && $0.activationPolicy == .regular }
guard apps.count == 1 else { output(["ok":false,"reason":"app-unavailable"]) }
guard AXIsProcessTrusted() else { output(["ok":false,"reason":"accessibility"]) }
let app = AXUIElementCreateApplication(apps[0].processIdentifier)
AXUIElementSetMessagingTimeout(app, 0.1)
func attribute(_ e:AXUIElement,_ key:String) -> CFTypeRef? {
    var value:CFTypeRef?
    return AXUIElementCopyAttributeValue(e,key as CFString,&value) == .success ? value : nil
}
func text(_ e:AXUIElement,_ key:String) -> String { attribute(e,key) as? String ?? "" }
func frame(_ e:AXUIElement) -> CGRect? {
    guard let p=attribute(e,kAXPositionAttribute), let s=attribute(e,kAXSizeAttribute), CFGetTypeID(p)==AXValueGetTypeID(), CFGetTypeID(s)==AXValueGetTypeID() else { return nil }
    var point=CGPoint.zero, size=CGSize.zero
    guard AXValueGetValue(p as! AXValue,.cgPoint,&point), AXValueGetValue(s as! AXValue,.cgSize,&size) else { return nil }
    return CGRect(origin:point,size:size)
}
guard let windows = attribute(app,kAXWindowsAttribute) as? [AXUIElement], !windows.isEmpty, windows.count <= 8 else { output(["ok":false,"reason":"windows-unavailable"]) }
let deadline = Date().addingTimeInterval(1.8)
var nodes:[SidebarNode]=[]
for window in windows {
    guard let bounds=frame(window), !bounds.isEmpty else { continue }
    var queue:[(AXUIElement,Int?,Int)]=[(window,nil,0)], cursor=0
    var visited=[CFHashCode:[AXUIElement]]()
    while cursor < queue.count {
        guard nodes.count < 4096 && Date() < deadline else { output(["ok":false,"reason":"capture-limit"]) }
        let (element,parent,depth)=queue[cursor];cursor+=1
        let hash=CFHash(element)
        if (visited[hash] ?? []).contains(where:{CFEqual($0,element)}) { continue }
        visited[hash,default:[]].append(element)
        let role=text(element,kAXRoleAttribute)
        let hidden=(attribute(element,"AXHidden") as? NSNumber)?.boolValue ?? false
        let container = !["AXButton","AXStaticText"].contains(role)
        let rect = frame(element)
        let inherited = parent.map { nodes[$0].visible } ?? true
        let geometryVisible = rect.map { $0.isEmpty && container ? inherited : (!$0.isEmpty && bounds.intersects($0)) } ?? (container && inherited)
        let visible = !hidden && geometryVisible
        let label = ["AXButton","AXStaticText"].contains(role) ? text(element,kAXTitleAttribute) : ""
        var value = role == "AXStaticText" && label.isEmpty ? text(element,kAXValueAttribute) : label
        if value.isEmpty && ["AXButton","AXStaticText"].contains(role) { value = text(element,kAXDescriptionAttribute) }
        let index=nodes.count
        nodes.append(SidebarNode(role:role,text:value,parent:parent,visible:visible))
        if depth < 32 && visible {
            guard let children=attribute(element,kAXChildrenAttribute) as? [AXUIElement] else { continue }
            queue.append(contentsOf:children.map {($0,index,depth+1)})
        }
    }
}
result(nodes)
