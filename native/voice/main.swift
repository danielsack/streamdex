import AppKit
import ApplicationServices
import CryptoKit
import Foundation
import Darwin

func output(_ value:[String:Any],code:Int32=0)->Never {
    FileHandle.standardOutput.write(try! JSONSerialization.data(withJSONObject:value,options:[.sortedKeys]))
    FileHandle.standardOutput.write(Data([10]));exit(code)
}
func attr(_ e:AXUIElement,_ name:String)->CFTypeRef? {var v:CFTypeRef?;return AXUIElementCopyAttributeValue(e,name as CFString,&v) == .success ? v:nil}
func text(_ e:AXUIElement,_ name:String)->String {(attr(e,name) as? String) ?? ""}
func flag(_ e:AXUIElement,_ name:String)->Bool {(attr(e,name) as? NSNumber)?.boolValue ?? false}
func hash(_ s:String)->String {SHA256.hash(data:Data(s.utf8)).map{String(format:"%02x",$0)}.joined()}
func normalized(_ s:String)->String {s.trimmingCharacters(in:.whitespacesAndNewlines).lowercased()}
// These exact labels are the app's realtime input/output controls, not system volume.
func controlState(_ label:String,kind:String)->Bool? {
    let s=normalized(label)
    if kind == "mic" {if s == "mute microphone" {return true};if s == "unmute microphone" {return false}}
    if kind == "sound" {if ["mute voice chat","mute speakers"].contains(s){return true};if ["unmute voice chat","unmute speakers"].contains(s){return false}}
    return nil
}
func isEnd(_ label:String)->Bool {["end voice chat","stop voice chat","end call"].contains(normalized(label))}
struct Node {let element:AXUIElement;let labels:[String];let enabled:Bool;let window:AXUIElement}
struct Control {let kind:String;let on:Bool;let token:String;let node:Node
    var json:[String:Any]{["kind":kind,"on":on,"token":token,"enabled":node.enabled]}
}
struct Snapshot {let active:Bool;let target:String;let controls:[Control];let complete:Bool;let diagnostics:[String:Any]
    var json:[String:Any]{["ok":complete,"active":active,"targetId":target,"controls":controls.map(\.json),"reason":!complete ? "unverified":active ? "ready":"no-session","observedAt":Int(Date().timeIntervalSince1970*1000)]}
}
func frame(_ e:AXUIElement)->CGRect? {
    guard let p=attr(e,"AXPosition"),let s=attr(e,"AXSize"),CFGetTypeID(p)==AXValueGetTypeID(),CFGetTypeID(s)==AXValueGetTypeID() else{return nil}
    var point=CGPoint.zero,size=CGSize.zero
    guard AXValueGetValue(p as! AXValue,.cgPoint,&point),AXValueGetValue(s as! AXValue,.cgSize,&size) else{return nil}
    return CGRect(origin:point,size:size)
}
func initializeAccessibility(_ ax:AXUIElement) {
    if flag(ax,"AXManualAccessibility") || flag(ax,"AXEnhancedUserInterface"){return}
    let manual=AXUIElementSetAttributeValue(ax,"AXManualAccessibility" as CFString,kCFBooleanTrue)
    if manual == .success {Thread.sleep(forTimeInterval:2.1);return}
    if manual == .attributeUnsupported || manual == .notImplemented {
        let enhanced=AXUIElementSetAttributeValue(ax,"AXEnhancedUserInterface" as CFString,kCFBooleanTrue)
        if enhanced == .success || enhanced == .notImplemented {Thread.sleep(forTimeInterval:2.1)}
    }
}
func hasActiveEvidence(endCount:Int,micWindows:Set<CFHashCode>,soundWindows:Set<CFHashCode>)->Bool {
    // The avatar can expose its two mute buttons without exposing the orb as an end button.
    return endCount>0 || !micWindows.intersection(soundWindows).isEmpty
}
func scan()->Snapshot {
    if let session=CGSessionCopyCurrentDictionary() as? [String:Any],session["CGSSessionScreenIsLocked"] as? Bool == true {
        return Snapshot(active:false,target:"",controls:[],complete:false,diagnostics:["screenLocked":true])
    }
    guard let app=NSRunningApplication.runningApplications(withBundleIdentifier:"com.openai.codex").first else{return Snapshot(active:false,target:"",controls:[],complete:true,diagnostics:["appRunning":false])}
    let ax=AXUIElementCreateApplication(app.processIdentifier);AXUIElementSetMessagingTimeout(ax,0.15)
    initializeAccessibility(ax)
    let listed=attr(ax,"AXWindows") as? [AXUIElement]
    var windows=(listed ?? []).filter{text($0,"AXRole")=="AXWindow"}
    for key in ["AXMainWindow","AXFocusedWindow"] {if let v=attr(ax,key),CFGetTypeID(v)==AXUIElementGetTypeID(){let w=v as! AXUIElement;if text(w,"AXRole")=="AXWindow" && !windows.contains(where:{CFEqual($0,w)}){windows.append(w)}}}
    // Some native floating windows appear in app children before AXWindows updates.
    for w in attr(ax,"AXChildren") as? [AXUIElement] ?? [] {if text(w,"AXRole")=="AXWindow" && !windows.contains(where:{CFEqual($0,w)}){windows.append(w)}}
    var nodes:[Node]=[],seen=Set<CFHashCode>(),complete = !windows.isEmpty,visited=0
    let deadline=Date().addingTimeInterval(4)
    for w in windows.prefix(16) {
        var queue:[(AXUIElement,Int)]=[(w,0)],index=0
        let bounds=frame(w)
        while index<queue.count && visited<8000 && Date()<deadline {
            let (e,depth)=queue[index];index+=1;visited+=1
            if !seen.insert(CFHash(e)).inserted || flag(e,"AXHidden"){continue}
            let role=text(e,"AXRole")
            if ["AXButton","AXCheckBox","AXToggleButton"].contains(role) {
                let labels=[text(e,"AXTitle"),text(e,"AXDescription"),text(e,"AXHelp")].filter{!$0.isEmpty}
                let relevant=labels.contains{isEnd($0)||controlState($0,kind:"mic") != nil||controlState($0,kind:"sound") != nil}
                if relevant,let f=frame(e),!f.isEmpty,bounds?.intersects(f) ?? true {nodes.append(Node(element:e,labels:labels,enabled:flag(e,"AXEnabled"),window:w))}
            }
            if depth<50 {for c in attr(e,"AXChildren") as? [AXUIElement] ?? [] {queue.append((c,depth+1))}}
        }
        if index<queue.count{complete=false}
    }
    if windows.count>16{complete=false}
    let ends=nodes.filter{$0.labels.contains(where:isEnd)}
    // The installed host coordinator owns one global realtime Voice session.
    // Main-window and floating-avatar controls may both represent that session.
    let micWindows=Set(nodes.filter{$0.labels.contains{controlState($0,kind:"mic") != nil}}.map{CFHash($0.window)})
    let soundWindows=Set(nodes.filter{$0.labels.contains{controlState($0,kind:"sound") != nil}}.map{CFHash($0.window)})
    let active=hasActiveEvidence(endCount:ends.count,micWindows:micWindows,soundWindows:soundWindows)
    let target=active ? hash("\(app.processIdentifier)|"+Set(nodes.map{"\(CFHash($0.window))"}).sorted().joined(separator:"|")):""
    var controls:[Control]=[]
    if active {
        for kind in ["mic","sound"] {
            let matches=nodes.compactMap{n->(Node,Bool)? in let states=Set(n.labels.compactMap{controlState($0,kind:kind)});guard states.count==1,let on=states.first else{return nil};return(n,on)}
            // Duplicated surfaces are accepted only when they agree on state.
            if Set(matches.map{$0.1}).count==1,let match=matches.sorted(by:{CFHash($0.0.element)<CFHash($1.0.element)}).first(where:{$0.0.enabled}) {
                let (node,on)=match
                controls.append(Control(kind:kind,on:on,token:hash("\(target)|\(kind)|\(CFHash(node.element))|\(on)"),node:node))
            }
        }
    }
    return Snapshot(active:active,target:target,controls:controls,complete:complete,diagnostics:["appRunning":true,"background":!app.isActive,"listedWindows":listed?.count ?? -1,"windows":windows.count,"nodes":visited,"endControls":ends.count,"voiceControls":nodes.map{["labels":$0.labels,"enabled":$0.enabled]}])
}
let args=Array(CommandLine.arguments.dropFirst())
if args.first == "selftest" {
    let fixtures:[(String,String,Bool?)]=[("Mute microphone","mic",true),("Unmute microphone","mic",false),("Mute speakers","sound",true),("Unmute speakers","sound",false),("Mute voice chat","sound",true),("Unmute voice chat","sound",false),("Mute all","mic",nil),("Mute","sound",nil),("Microphone settings","mic",nil),("Mute microphone","sound",nil),("Mute voice chat","mic",nil),("Start voice chat","mic",nil)]
    for (s,k,want) in fixtures {guard controlState(s,kind:k)==want else{output(["ok":false,"fixture":s],code:1)}}
    guard isEnd("End voice chat"),isEnd("Stop voice chat"),!isEnd("Start voice chat") else{output(["ok":false],code:1)}
    guard hasActiveEvidence(endCount:1,micWindows:[],soundWindows:[]),
        hasActiveEvidence(endCount:0,micWindows:[1],soundWindows:[1]),
        !hasActiveEvidence(endCount:0,micWindows:[1],soundWindows:[2]),
        !hasActiveEvidence(endCount:0,micWindows:[1],soundWindows:[]),
        !hasActiveEvidence(endCount:0,micWindows:[],soundWindows:[]) else{output(["ok":false,"fixture":"voice-evidence"],code:1)}
    output(["ok":true,"fixtures":fixtures.count+8])
}
guard AXIsProcessTrusted() else{output(["ok":false,"active":false,"controls":[],"reason":"accessibility"],code:1)}
let before=scan()
if args.isEmpty || ["read","inspect"].contains(args[0]){var r=before.json;if args.first=="inspect"{r["diagnostics"]=before.diagnostics};output(r)}
guard args.count==2,args[0]=="act",let data=args[1].data(using:.utf8),let expected=(try? JSONSerialization.jsonObject(with:data)) as? [String:Any],let target=expected["targetId"] as? String,let kind=expected["kind"] as? String,let token=expected["token"] as? String,let on=expected["on"] as? Bool,let observed=expected["observedAt"] as? Double,Date().timeIntervalSince1970*1000-observed<10000,Date().timeIntervalSince1970*1000>=observed else{output(["ok":false,"reason":"stale"],code:1)}
guard before.complete,before.active,before.target==target,let control=before.controls.first(where:{$0.kind==kind && $0.token==token && $0.on==on && $0.node.enabled}) else{output(["ok":false,"reason":"session-changed","state":before.json],code:1)}
guard AXUIElementPerformAction(control.node.element,kAXPressAction as CFString) == .success else{output(["ok":false,"reason":"control-unavailable"],code:1)}
let deadline=Date().addingTimeInterval(3)
repeat {
    usleep(120000)
    let after=scan()
    if after.complete,after.active,after.target==target,after.controls.contains(where:{$0.kind==kind && $0.on == !on}){output(["ok":true,"state":after.json])}
    if !after.active || after.target != target{output(["ok":false,"reason":"session-changed","state":after.json],code:1)}
}while Date()<deadline
output(["ok":false,"reason":"not-confirmed"],code:1)
