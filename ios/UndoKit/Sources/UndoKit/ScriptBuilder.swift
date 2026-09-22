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

    /// The page's configuration, as one assignment to a global.
    ///
    /// The guarded prefixes travel with it because the app cannot withhold a script
    /// from a page it never loads: Instagram routes into `/accounts/` without a page
    /// load, and on that hop the navigation delegate never runs. The filter checks
    /// the same list itself and does nothing on a guarded path.
    public static func configScript(feedRules: FeedRules, guardedPrefixes: [String]) throws -> String {
        struct PageConfig: Encodable {
            let hideIfTextContains: [String]
            let hideIfExactText: [String]
            let articleSelector: String
            let feedRootSelector: String
            let homeFeedHref: String
            let guardedPrefixes: [String]
        }
        let config = PageConfig(
            hideIfTextContains: feedRules.hideIfTextContains,
            hideIfExactText: feedRules.hideIfExactText,
            articleSelector: feedRules.articleSelector,
            feedRootSelector: feedRules.feedRootSelector,
            homeFeedHref: feedRules.homeFeedHref,
            guardedPrefixes: guardedPrefixes
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let literal = String(decoding: try encoder.encode(config), as: UTF8.self)
        return "window.UndoConfig = \(literal);"
    }

    /// The data filter's rules and the guarded paths, as one assignment to a global.
    ///
    /// The guarded prefixes travel with the rules for the same reason the page filter
    /// gets them: the app cannot withhold a script from a page it never loads, and a
    /// wrapper installed for an earlier page is still the document's `JSON.parse`
    /// after Instagram routes into `/accounts/` without a page load.
    public static func pruneConfigScript(rules: PruneRules, guardedPrefixes: [String]) throws -> String {
        struct PageConfig: Encodable {
            let depthLimit: Int
            let rules: [PruneRules.Rule]
            let guardedPrefixes: [String]
        }
        let config = PageConfig(
            depthLimit: rules.depthLimit,
            rules: rules.rules,
            guardedPrefixes: guardedPrefixes
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        let literal = String(decoding: try encoder.encode(config), as: UTF8.self)
        return "window.UndoPruneConfig = \(literal);"
    }
}
