import Foundation
import Testing
@testable import UndoKit

@Test func keepsTheScriptOffEveryLoginPage() {
    #expect(InjectionPolicy.allowsInjection(path: "/accounts/login/") == false)
    #expect(InjectionPolicy.allowsInjection(path: "/accounts/login") == false)
    #expect(InjectionPolicy.allowsInjection(path: "/accounts/signup/") == false)
    #expect(InjectionPolicy.allowsInjection(path: "/accounts/password/reset/") == false)
    #expect(InjectionPolicy.allowsInjection(path: "/accounts/") == false)
    #expect(InjectionPolicy.allowsInjection(path: "/accounts") == false)
}

@Test func injectsOnThePagesUndoFilters() {
    #expect(InjectionPolicy.allowsInjection(path: "/"))
    #expect(InjectionPolicy.allowsInjection(path: "/direct/inbox/"))
    #expect(InjectionPolicy.allowsInjection(path: "/reel/ABC123/"))
    #expect(InjectionPolicy.allowsInjection(path: "/someone/"))
}

@Test func readsThePathOutOfAURL() {
    #expect(InjectionPolicy.allowsInjection(url: URL(string: "https://www.instagram.com/")!))
    #expect(InjectionPolicy.allowsInjection(url: URL(string: "https://www.instagram.com/accounts/login/")!) == false)
    #expect(InjectionPolicy.allowsInjection(url: URL(string: "https://www.instagram.com/accounts/login/?next=%2F")!) == false)
}

@Test func failsClosedWhenThereIsNoPathToRead() {
    #expect(InjectionPolicy.allowsInjection(url: nil) == false)
    #expect(InjectionPolicy.allowsInjection(url: URL(string: "about:blank")!) == false)
}
