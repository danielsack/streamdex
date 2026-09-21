import Foundation
import AppKit
import CryptoKit
import Darwin
let fm=FileManager.default
struct Failure: Error, CustomStringConvertible { let description:String; init(_ s:String){description=s} }
func json(_ url:URL) throws -> [String:Any] { guard let v=try JSONSerialization.jsonObject(with:Data(contentsOf:url)) as? [String:Any] else{throw Failure("Invalid JSON")};return v }
func save(_ v:[String:Any],_ url:URL) throws {try fm.createDirectory(at:url.deletingLastPathComponent(),withIntermediateDirectories:true);try JSONSerialization.data(withJSONObject:v,options:[.prettyPrinted,.sortedKeys]).write(to:url,options:.atomic)}
func hash(_ url:URL) throws -> String {SHA256.hash(data:try Data(contentsOf:url)).map{String(format:"%02x",$0)}.joined()}
@discardableResult func run(_ path:String,_ args:[String]) throws -> String {let p=Process();p.executableURL=URL(fileURLWithPath:path);p.arguments=args;let pipe=Pipe();p.standardOutput=pipe;p.standardError=pipe;try p.run();let data=pipe.fileHandleForReading.readDataToEndOfFile();p.waitUntilExit();guard p.terminationStatus==0 else{throw Failure("System command failed: "+URL(fileURLWithPath:path).lastPathComponent)};return String(data:data,encoding:.utf8) ?? ""}
let args=Array(CommandLine.arguments.dropFirst()),command=args.first ?? "inspect"
let kit=URL(fileURLWithPath:CommandLine.arguments[0]).standardizedFileURL.deletingLastPathComponent()
let identity="io.streamdex.plugin",pluginName=identity+".sdPlugin"
var testRoot:URL?
var lights:[String]=[]
do {
 var i=1
 while i<args.count {let option=args[i];i+=1;guard i<args.count else{throw Failure("Missing option value")};let value=args[i];i+=1
  if option=="--test-root" {let root=URL(fileURLWithPath:value).standardizedFileURL;guard fm.fileExists(atPath:root.appendingPathComponent(".streamdex-test-root").path) else{throw Failure("Test root marker required")};testRoot=root}
  else if option=="--light" {guard value.range(of:"^[a-zA-Z0-9][a-zA-Z0-9.-]{0,252}$",options:.regularExpression) != nil else{throw Failure("Use a light hostname or IPv4 address without a port")};lights.append(value)}
  else {throw Failure("Unknown option")}
 }
 guard lights.count<=2 else{throw Failure("At most two lights are supported")}
 let home=testRoot ?? fm.homeDirectoryForCurrentUser
 let support=home.appendingPathComponent("Library/Application Support"),state=support.appendingPathComponent("Streamdex"),deck=support.appendingPathComponent("com.elgato.StreamDeck"),installed=deck.appendingPathComponent("Plugins/"+pluginName),profiles=deck.appendingPathComponent("ProfilesV3"),receipt=state.appendingPathComponent("install.json"),config=state.appendingPathComponent("config.json")
 func payload() throws -> [String:String] {
  let all=try json(kit.appendingPathComponent("payload.json"));guard let hashes=all["files"] as? [String:String],!hashes.isEmpty else{throw Failure("Missing payload inventory")}
  for (relative,expected) in hashes {
   guard !relative.hasPrefix("/"),!relative.split(separator:"/").contains("..") else{throw Failure("Invalid payload path")}
   let file=kit.appendingPathComponent(relative);let values=try file.resourceValues(forKeys:[.isSymbolicLinkKey]);guard values.isSymbolicLink != true,try hash(file)==expected else{throw Failure("Kit integrity check failed")}
  };return hashes
 }
 func ownedProfiles() throws -> [URL] {
  guard fm.fileExists(atPath:profiles.path) else{return []}
  return try fm.contentsOfDirectory(at:profiles,includingPropertiesForKeys:nil).filter{ p in
   guard p.pathExtension=="sdProfile",let v=try? json(p.appendingPathComponent("manifest.json")) else{return false};return v["InstalledByPluginUUID"] as? String == identity
  }
 }
 func copy(_ from:URL,_ to:URL) throws {try fm.createDirectory(at:to.deletingLastPathComponent(),withIntermediateDirectories:true);try fm.copyItem(at:from,to:to)}
 func installedMatches(_ hashes:[String:String]) -> Bool {
  let prefix=pluginName+"/";let entries=hashes.filter{$0.key.hasPrefix(prefix)}
  return !entries.isEmpty && entries.allSatisfy{key,value in (try? hash(installed.appendingPathComponent(String(key.dropFirst(prefix.count)))))==value}
 }
 switch command {
 case "inspect":
  let verified=(try? payload()) != nil
  let info:[String:Any]=["kitVerified":verified,"platform":ProcessInfo.processInfo.operatingSystemVersionString,"appleSilicon":testRoot != nil || (try? run("/usr/bin/uname",["-m"]).trimmingCharacters(in:.whitespacesAndNewlines)) == "arm64","streamDeckInstalled":testRoot != nil || fm.fileExists(atPath:"/Applications/Elgato Stream Deck.app"),"codexInstalled":testRoot != nil || NSWorkspace.shared.urlForApplication(withBundleIdentifier:"com.openai.codex") != nil,"streamdexInstalled":fm.fileExists(atPath:installed.path),"streamdexProfiles":try ownedProfiles().count,"lightingConfigured":((try? json(config)["lights"] as? [String]) ?? []).count,"changesMade":false]
  print(String(data:try JSONSerialization.data(withJSONObject:info,options:[.prettyPrinted,.sortedKeys]),encoding:.utf8)!)
 case "install":
  let hashes=try payload()
  if testRoot==nil {
   guard try run("/usr/bin/uname",["-m"]).trimmingCharacters(in:.whitespacesAndNewlines)=="arm64" else{throw Failure("This candidate supports Apple Silicon only")}
   guard fm.fileExists(atPath:"/Applications/Elgato Stream Deck.app"),NSWorkspace.shared.urlForApplication(withBundleIdentifier:"com.openai.codex") != nil else{throw Failure("Install Stream Deck and Codex first")}
  }
  if installedMatches(hashes) {
   if !lights.isEmpty {throw Failure("Already installed. Edit the Streamdex config lights list, then restart Stream Deck; existing configuration was preserved.")}
   print("The same Streamdex build is installed. No profiles or settings changed.");break
  }
  if let pending=try? json(receipt),pending["phase"] as? String == "pending" {throw Failure("An installation is pending. Complete it and run verify, or run rollback first.")}
  let backup=state.appendingPathComponent("backups/"+UUID().uuidString.lowercased());try fm.createDirectory(at:backup,withIntermediateDirectories:true)
  let hadPlugin=fm.fileExists(atPath:installed.path),hadConfig=fm.fileExists(atPath:config.path)
  if hadPlugin {try copy(installed,backup.appendingPathComponent(pluginName))}
  if hadConfig {try copy(config,backup.appendingPathComponent("config.json"))}
  let owned=try ownedProfiles();for p in owned {try copy(p,backup.appendingPathComponent("profiles/"+p.lastPathComponent))}
  try save(["phase":"pending","backup":backup.lastPathComponent,"hadPlugin":hadPlugin,"hadConfig":hadConfig,"profiles":owned.map{$0.lastPathComponent}],receipt)
  if !hadConfig || !lights.isEmpty {try save(["lights":lights],config)}
  if testRoot != nil {
   if hadPlugin {try fm.removeItem(at:installed)}
   try copy(kit.appendingPathComponent(pluginName),installed)
   print("Installed fixture payload in the marked test root.")
  } else {
   try run("/usr/bin/open",[kit.appendingPathComponent(identity+".streamDeckPlugin").path])
   print("The normal Stream Deck installer is open. Complete its prompts, then run ./streamdex-setup verify. Select the Streamdex profile on each device when ready. Your previous profiles remain available.")
  }
 case "verify":
  let hashes=try payload();guard installedMatches(hashes) else{throw Failure("Installed files do not match this kit. Complete installation before verifying.")}
  if testRoot==nil {
   let found=try ownedProfiles().compactMap{try? json($0.appendingPathComponent("manifest.json"))["PreconfiguredName"] as? String}
   print("Owned profiles found: \(found.count). Confirm the appropriate profile appears for each connected supported device.")
  }
  if var v=try? json(receipt) {v["phase"]="verified";try save(v,receipt)}
  print("Installed payload hashes match. Device behavior and macOS Accessibility approval still require the documented acceptance checks.")
 case "rollback":
  let v=try json(receipt);guard let name=v["backup"] as? String,UUID(uuidString:name) != nil else{throw Failure("Invalid backup receipt")}
  if testRoot==nil {
   let running=try? run("/usr/bin/pgrep",["-x","Stream Deck"])
   guard running==nil || running!.isEmpty else{throw Failure("Quit Stream Deck before rollback, then run this command again.")}
  }
  let backup=state.appendingPathComponent("backups/"+name);guard fm.fileExists(atPath:backup.path) else{throw Failure("Backup unavailable")}
  if fm.fileExists(atPath:installed.path){try fm.removeItem(at:installed)}
  for p in try ownedProfiles(){try fm.removeItem(at:p)}
  if v["hadPlugin"] as? Bool == true {try copy(backup.appendingPathComponent(pluginName),installed)}
  for name in (v["profiles"] as? [String] ?? []) {guard !name.contains("/"),name.hasSuffix(".sdProfile") else{throw Failure("Invalid profile receipt")};try copy(backup.appendingPathComponent("profiles/"+name),profiles.appendingPathComponent(name))}
  if fm.fileExists(atPath:config.path){try fm.removeItem(at:config)}
  if v["hadConfig"] as? Bool == true {try copy(backup.appendingPathComponent("config.json"),config)}
  try fm.removeItem(at:receipt);print("Previous Streamdex files restored. Unrelated plugins and profiles were not changed. Restart Stream Deck.")
 default:throw Failure("Usage: ./streamdex-setup inspect | install [--light HOST] [--light HOST] | verify | rollback")
 }
} catch {fputs("Streamdex: \(error)\n",stderr);exit(1)}
