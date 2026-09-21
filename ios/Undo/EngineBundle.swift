import Foundation

/// Reads the filter files out of the app bundle.
///
/// `engine/` ships as a folder reference, so the files sit at `Undo.app/engine/`
/// exactly as they appear in the repo and anyone can extract an installed copy and
/// diff the two.
enum EngineBundle {
    static func data(_ relativePath: String) -> Data? {
        guard let resources = Bundle.main.resourceURL else { return nil }
        let url = resources.appending(path: "engine/" + relativePath)
        guard let data = try? Data(contentsOf: url) else {
            assertionFailure("Missing engine file: engine/\(relativePath)")
            return nil
        }
        return data
    }

    static func string(_ relativePath: String) -> String? {
        data(relativePath).map { String(decoding: $0, as: UTF8.self) }
    }
}
