import Foundation
import Testing
@testable import UndoKit

@Test func buildsAScriptThatInstallsTheStylesheet() throws {
    let script = try ScriptBuilder.styleInjector(
        css: "a[href=\"/reels/\"]{display:none}",
        id: "undo-static-hides"
    )
    #expect(script.contains("document.createElement('style')"))
    #expect(script.contains("document.documentElement.appendChild"))
    #expect(script.contains("undo-static-hides"))
}

@Test func escapesTheStylesheetRatherThanBreakingTheScript() throws {
    let script = try ScriptBuilder.styleInjector(
        css: "a[title=\"x\"]{}\n/* a \\ backslash */",
        id: "x"
    )
    #expect(script.contains("\\\""))
    #expect(script.contains("\\n"))
    #expect(script.contains("\\\\"))
}

@Test func keepsTheStylesheetOnOneLineHoweverLongItIs() throws {
    let css = try String(decoding: engineData("instagram/hide.css"), as: UTF8.self)
    #expect(css.contains("\n"))
    let script = try ScriptBuilder.styleInjector(css: css, id: "undo-static-hides")
    let carriers = script.split(separator: "\n").filter { $0.contains("style.textContent") }
    #expect(carriers.count == 1)
}

@Test func carriesTheShippedRulesIntoTheScript() throws {
    let css = try String(decoding: engineData("instagram/hide.css"), as: UTF8.self)
    let script = try ScriptBuilder.styleInjector(css: css, id: "undo-static-hides")
    #expect(script.contains("/reels/"))
}
