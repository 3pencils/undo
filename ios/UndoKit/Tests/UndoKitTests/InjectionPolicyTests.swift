import Foundation
import Testing
@testable import UndoKit

/// The shipped list, so the tests judge what the app actually uses.
private func policy() throws -> InjectionPolicy {
    try InjectionPolicy(rules: EngineConfig.decodePathRules(engineData("instagram/paths.json")))
}

@Test func keepsTheScriptOffEveryLoginPage() throws {
    #expect(try policy().allowsInjection(path: "/accounts/login/") == false)
    #expect(try policy().allowsInjection(path: "/accounts/login") == false)
    #expect(try policy().allowsInjection(path: "/accounts/signup/") == false)
    #expect(try policy().allowsInjection(path: "/accounts/password/reset/") == false)
    #expect(try policy().allowsInjection(path: "/accounts/") == false)
    #expect(try policy().allowsInjection(path: "/accounts") == false)
}

@Test func injectsOnThePagesUndoFilters() throws {
    #expect(try policy().allowsInjection(path: "/"))
    #expect(try policy().allowsInjection(path: "/direct/inbox/"))
    #expect(try policy().allowsInjection(path: "/reel/ABC123/"))
    #expect(try policy().allowsInjection(path: "/someone/"))
}

@Test func readsThePathOutOfAURL() throws {
    #expect(try policy().allowsInjection(url: URL(string: "https://www.instagram.com/")!))
    #expect(try policy().allowsInjection(url: URL(string: "https://www.instagram.com/accounts/login/")!) == false)
    #expect(try policy().allowsInjection(url: URL(string: "https://www.instagram.com/accounts/login/?next=%2F")!) == false)
}

@Test func failsClosedWhenThereIsNoPathToRead() throws {
    #expect(try policy().allowsInjection(url: nil) == false)
    #expect(try policy().allowsInjection(url: URL(string: "about:blank")!) == false)
}

@Test func guardsEverySpellingOfALoginPageAServerMightAnswerTo() throws {
    // A guard that compares raw bytes says "inject" for all of these.
    let spellings = [
        "https://www.instagram.com/accounts/login/",
        "https://www.instagram.com//accounts/login/",
        "https://www.instagram.com/ACCOUNTS/login/",
        "https://www.instagram.com/Accounts/Login/",
        "https://www.instagram.com/x/../accounts/login/",
        "https://www.instagram.com/%2e%2e/accounts/login/",
        "https://www.instagram.com/./accounts/login/",
        "https://www.instagram.com/accounts//login/",
    ]
    for spelling in spellings {
        #expect(
            try policy().allowsInjection(url: URL(string: spelling)!) == false,
            "\(spelling) is a login page and must not be injected into"
        )
    }
}

@Test func stillInjectsOnPagesThatMerelyResembleTheGuardedOne() throws {
    #expect(try policy().allowsInjection(path: "/accountsomething/"))
    #expect(try policy().allowsInjection(path: "/my/accounts/"))
    #expect(try policy().allowsInjection(url: URL(string: "https://www.instagram.com/accountancy/")!))
}


@Test func guardsEveryPathInstagramAsksForCredentialsOn() throws {
    let guarded = try policy()
    for path in ["/accounts/login/", "/challenge/", "/two_factor/", "/emailsignup/", "/recover/", "/oauth/authorize/"] {
        #expect(guarded.allowsInjection(path: path) == false, "\(path) must be guarded")
    }
}
