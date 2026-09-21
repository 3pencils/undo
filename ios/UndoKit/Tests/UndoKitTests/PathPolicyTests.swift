import Testing
@testable import UndoKit

@Test func normalizeGivesEveryPathATrailingSlash() {
    #expect(PathPolicy.normalize("/reels") == "/reels/")
    #expect(PathPolicy.normalize("/reels/") == "/reels/")
    #expect(PathPolicy.normalize("") == "/")
    #expect(PathPolicy.normalize("/") == "/")
}

@Test func blocksTheReelsFeedAndExplore() {
    let policy = PathPolicy(blocked: ["/reels/", "/explore/"], allowed: ["/reel/", "/explore/search/"])
    #expect(policy.isBlocked("/reels/"))
    #expect(policy.isBlocked("/reels"))
    #expect(policy.isBlocked("/reels/audio/123/"))
    #expect(policy.isBlocked("/explore/"))
    #expect(policy.isBlocked("/explore/tags/cats/"))
}

@Test func allowsASingleReelAndEverythingElse() {
    let policy = PathPolicy(blocked: ["/reels/", "/explore/"], allowed: ["/reel/", "/explore/search/"])
    #expect(policy.isBlocked("/reel/ABC123/") == false)
    #expect(policy.isBlocked("/explore/search/") == false)
    #expect(policy.isBlocked("/explore/search/keyword/") == false)
    #expect(policy.isBlocked("/") == false)
    #expect(policy.isBlocked("/direct/inbox/") == false)
    #expect(policy.isBlocked("/accounts/login/") == false)
    #expect(policy.isBlocked("/p/XYZ789/") == false)
    #expect(policy.isBlocked("/someone/") == false)
}

@Test func anAllowedPrefixWinsOverABlockedOne() {
    let policy = PathPolicy(blocked: ["/reel/"], allowed: ["/reel/keepthis/"])
    #expect(policy.isBlocked("/reel/other/"))
    #expect(policy.isBlocked("/reel/keepthis/") == false)
}
