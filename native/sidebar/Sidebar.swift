import Foundation

struct SidebarNode: Codable {
    let role: String
    let text: String
    let parent: Int?
    let visible: Bool
}
struct SidebarRow: Codable {
    let titleIndex: Int
    let pending: Bool
}
func normalizedTitle(_ text: String) -> String {
    text.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ")
}
// Display evidence only. Rows never contain action tokens or authorize a press.
func sidebarRows(_ nodes: [SidebarNode], titles: [String]) -> [SidebarRow] {
    let names = titles.map(normalizedTitle)
    var rows: [SidebarRow] = []
    for i in nodes.indices where nodes[i].role == "AXButton" && nodes[i].visible {
        var ancestor = nodes[i].parent, list = false, seen = Set<Int>()
        for _ in 0..<6 {
            guard let a = ancestor, nodes.indices.contains(a), seen.insert(a).inserted, nodes[a].visible else { break }
            if nodes[a].role == "AXButton" { break }
            if nodes[a].role == "AXList" { list = true; break }
            ancestor = nodes[a].parent
        }
        guard list else { continue }
        func below(_ child: Int) -> Bool {
            var at: Int? = child, seen = Set<Int>()
            for _ in 0..<8 {
                guard let index = at, nodes.indices.contains(index), seen.insert(index).inserted, nodes[index].visible else { return false }
                if index == i { return true }
                if index != child && nodes[index].role == "AXButton" { return false }
                at = nodes[index].parent
            }
            return false
        }
        let labels = nodes.indices.filter { nodes[$0].role == "AXStaticText" && below($0) }
            .map { normalizedTitle(nodes[$0].text) }.filter { !$0.isEmpty }
        // The first text in a task row is its full title. Never substring-match
        // the combined button label, which can include badges or another task.
        let title = labels.first ?? normalizedTitle(nodes[i].text)
        let matches = names.indices.filter { !names[$0].isEmpty && names[$0] == title }
        guard matches.count == 1 else { continue }
        let pending = labels.dropFirst().contains { ["awaiting approval", "awaiting input"].contains($0.lowercased()) }
        rows.append(SidebarRow(titleIndex: matches[0], pending: pending))
    }
    return rows
}
