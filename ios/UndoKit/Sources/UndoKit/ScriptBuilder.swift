import Foundation

/// Builds the small scripts the app installs into a page.
public enum ScriptBuilder {
    /// A script that installs a stylesheet before the page body is parsed.
    ///
    /// Running at document start is the whole point: the elements the stylesheet
    /// hides are never painted, so they are never seen. The CSS travels as a JSON
    /// string, which is also a valid JavaScript string, so nothing is escaped by
    /// hand and a quote or a newline in the stylesheet cannot break the script.
    public static func styleInjector(css: String, id: String) throws -> String {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.withoutEscapingSlashes]
        let cssLiteral = String(decoding: try encoder.encode(css), as: UTF8.self)
        let idLiteral = String(decoding: try encoder.encode(id), as: UTF8.self)
        return """
        (function () {
          'use strict';
          var style = document.createElement('style');
          style.id = \(idLiteral);
          style.textContent = \(cssLiteral);
          document.documentElement.appendChild(style);
        })();
        """
    }
}
