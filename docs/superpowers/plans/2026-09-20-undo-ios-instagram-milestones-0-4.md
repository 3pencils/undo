# Undo iOS: Instagram Filter Implementation Plan (Milestones 0–4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an iOS app that opens Instagram in an embedded web view with the Reels feed, Explore, suggested posts, sponsored posts and install banners removed, and with the filter script kept off every login page.

**Architecture:** Three filters, cheapest and most robust first: a navigation policy that cancels `/reels/` and the explore grid before anything loads, a stylesheet injected at document start that hides the Reels entry and install banners before the page paints, and a script injected at document end that removes suggested and sponsored posts as the feed loads. The last two share one delivery mechanism — user scripts — so the same files work unchanged in an Android WebView later, which has no equivalent of `WKContentRuleList`. All filter data and logic live in `engine/` as plain JavaScript and JSON. All decision logic lives in two places that run under test on a Mac: `engine/` (tested with `node --test`) and `ios/UndoKit/`, a local Swift package of pure functions (tested with `swift test`). The app target holds only WebKit glue.

**Tech Stack:** Swift 6, SwiftUI, WebKit, iOS 17+, Xcode 26. Swift Testing for Swift, `node:test` and `node:vm` for JavaScript. Zero third-party dependencies anywhere.

**Spec:** `HANDOFF.md` at the repo root (git-ignored, local to the owner's machine). Sections 4, 5 and 6 are the source for this plan.

---

## Global Constraints

Every task's requirements implicitly include this section.

- **Zero third-party dependencies.** Apple frameworks, Node built-ins, and our own code only. No SwiftPM remote packages, no npm packages, no CocoaPods, no Carthage.
- **No backend, no analytics, no remote code, no telemetry.** Every filter rule ships inside the app bundle.
- **The filter script is injected only when the URL path is outside `/accounts/`.** This is a security invariant and it is unit-tested in Task 2.
- **The app makes network requests only to the platforms it embeds.**
- **Language and platform:** Swift 6, SwiftUI, `IPHONEOS_DEPLOYMENT_TARGET = 17.0`.
- **Bundle identifier:** `com.3pencils.undo`. Xcode organization identifier `com.3pencils`.
  Apple accepts a segment that starts with a digit; Android does not, so the
  Android shell will carry a different application ID. Nothing reads the
  identifier across platforms, because there is no backend, no push and no
  shared services, so the two are free to differ. Do not "fix" this later.
- **App name:** `Undo`. Studio: `3 Pencils`. Licence: MIT.
- **Engine location:** `engine/`, plain JavaScript and JSON, shared by every platform shell. The injected script is a classic script (no `import`/`export`) so the file in the app bundle is byte-identical to the file in the repo.
- **Selector strategy:** match on `href`, `aria-label`, and visible text. Never on class names.
- **Documentation voice:** write in the positive — describe what is there and what happens. Keep a negative only where it is the useful point.
- **Git:** the owner commits. Every task ends with a step that *proposes* a commit and waits for the owner's explicit go-ahead. Never run `git commit`, `git commit --amend` or `git push` before they say so.
- **Release tags:** `ios-v0.1.0` style, prefixed per platform.

---

## One decision this plan makes for the spec

`HANDOFF.md` §4 keeps search and §5 cancels `/explore/`. On Instagram's mobile
web those are the same button: the magnifier in the bottom bar points at
`/explore/`, which serves a search field on top of a grid of suggested posts.
Cancelling `/explore/` outright removes search along with the grid.

This plan resolves it by making the magnifier a search button:

| Path | What happens |
|---|---|
| `/explore/` | Cancelled, and the web view loads `/explore/search/` instead |
| `/explore/search/...` | Allowed — this is search, including its results |
| `/reels/`, `/explore/tags/...` | Cancelled |

So the explore grid never appears, search still works, and the magnifier stays
in the bottom bar rather than being hidden by the stylesheet. If the owner would
rather lose search entirely, the change is one line: drop `/explore/search/` from
`allowed` in `engine/instagram/paths.json` and drop the redirect in
`WebCoordinator`. Step 3 of Task 4 verifies which behaviour Instagram actually
gives for a bare `/explore/search/` URL.

---

## Prerequisite: install the iOS platform

**This machine has Xcode 26.2 and the iOS 26.2 SDK, but the iOS platform support files are not installed, so no iOS build can run yet.** Confirmed by `xcodebuild`:

```
error:iOS 26.2 is not installed. Please download and install the platform from Xcode > Settings > Components.
```

- [ ] **Step 1: Download the iOS platform**

The owner runs one of these. It is several gigabytes and takes a while.

```bash
xcodebuild -downloadPlatform iOS
```

Or: Xcode > Settings > Components > iOS 26.2 > Get.

- [ ] **Step 2: Verify it landed**

Run: `xcodebuild -showdestinations -project ios/Undo.xcodeproj -scheme Undo`
Expected: an `Available destinations` list that includes `{ platform:iOS, ... name:Any iOS Device }`.

Until this is done, Tasks 1, 2, 6 and 7 still run in full — they are pure JavaScript and pure Swift, and their tests run on the Mac. Tasks 3, 4 and 5 need the platform installed.

The owner's iPhone (`iPhone15,4`) is already known to `devicectl` but shows `unavailable`, meaning it is not plugged in and paired right now. Connect it before the on-device verification steps.

---

## File Structure

| File | Responsibility |
|---|---|
| `engine/marker.js` | One line that sets `window.__undoFilterPresent`. Makes the login-page guard observable in Safari Web Inspector. |
| `engine/instagram/paths.json` | Layer 1 data: blocked and allowed path prefixes. |
| `engine/instagram/hide.css` | Layer 2: the stylesheet injected before the page paints. |
| `engine/instagram/feed.json` | Layer 3 data: which feed items to hide. |
| `engine/instagram/filter.js` | Layer 3 logic: pure predicates plus a thin DOM pass. Classic script, injected at document end. |
| `tests/harness.js` | Loads a classic script into a `node:vm` sandbox; builds fake documents for tests. Never ships. |
| `tests/schema.test.js` | Validates the three JSON files. |
| `tests/filter.test.js` | Tests `filter.js` predicates and DOM pass. |
| `ios/UndoKit/Sources/UndoKit/PathPolicy.swift` | Pure: is this path blocked? |
| `ios/UndoKit/Sources/UndoKit/InjectionPolicy.swift` | Pure: may the filter script be injected on this URL? |
| `ios/UndoKit/Sources/UndoKit/EngineConfig.swift` | Pure: decode the engine JSON into Swift values. |
| `ios/UndoKit/Sources/UndoKit/ScriptBuilder.swift` | Pure: wraps a stylesheet in the script that installs it. |
| `ios/UndoKit/Tests/UndoKitTests/*.swift` | Swift Testing suites for the four files above. |
| `ios/Undo.xcodeproj/project.pbxproj` | Hand-written project. One synchronized group, one folder reference, one local package. |
| `ios/Undo/UndoApp.swift` | App entry point. |
| `ios/Undo/Platform.swift` | Describes one embedded platform: title, icon, home URL, engine folder. |
| `ios/Undo/RootView.swift` | Tab container. |
| `ios/Undo/WebTab.swift` | `UIViewRepresentable` that builds the `WKWebView`. |
| `ios/Undo/WebCoordinator.swift` | `WKNavigationDelegate`: navigation policy, injection guard, script installation. |
| `ios/Undo/EngineBundle.swift` | Reads engine files out of the app bundle. |
| `.github/workflows/ci.yml` | Runs the JavaScript tests, the Swift tests, and an unsigned app build. |
| `README.md` | What Undo is and how to check its claims. |
| `SECURITY.md` | The login-page guard, how to verify it, how to report issues. |

Two rules keep this structure honest:

1. **Data in JSON, logic in code.** Path prefixes, CSS selectors and feed heuristics are data. Swift and JavaScript read the same files, so a rule change is a one-file change.
2. **Pure functions in testable homes.** Anything that decides something lives in `UndoKit` or in the predicate half of `filter.js`. Anything that touches WebKit or the DOM stays thin enough to verify by hand on the phone.

---

### Task 1: Engine data files, schema tests, and CI

Milestone 0. Creates the repo skeleton and the three data files every later task reads, with a test that fails on a typo.

**Files:**
- Create: `engine/instagram/paths.json`
- Create: `engine/instagram/hide.css`
- Create: `engine/instagram/feed.json`
- Create: `engine/marker.js`
- Create: `.github/workflows/ci.yml`
- Create: `SECURITY.md`
- Modify: `README.md` (replace both lines)
- Test: `tests/schema.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `engine/instagram/paths.json` with keys `blocked: string[]` and `allowed: string[]`. `engine/instagram/feed.json` with keys `hideIfLinkPrefix: string[]`, `hideIfTextContains: string[]`, `articleSelector: string`, `feedRootSelector: string`. `engine/instagram/hide.css` as a plain stylesheet. `engine/marker.js` as a classic script.

- [ ] **Step 1: Write the failing schema test**

Create `tests/schema.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readText(relativePath) {
  return readFileSync(fileURLToPath(new URL('../engine/' + relativePath, import.meta.url)), 'utf8');
}

function readJSON(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assertPathPrefix(value, label) {
  assert.equal(typeof value, 'string', `${label} is a string`);
  assert.ok(value.startsWith('/'), `${label} starts with a slash: ${value}`);
  assert.ok(value.endsWith('/'), `${label} ends with a slash: ${value}`);
}

test('paths.json lists blocked and allowed prefixes', () => {
  const paths = readJSON('instagram/paths.json');
  assert.ok(Array.isArray(paths.blocked) && paths.blocked.length > 0);
  assert.ok(Array.isArray(paths.allowed));
  paths.blocked.forEach((p, i) => assertPathPrefix(p, `blocked[${i}]`));
  paths.allowed.forEach((p, i) => assertPathPrefix(p, `allowed[${i}]`));
  assert.ok(paths.blocked.includes('/reels/'));
  assert.ok(paths.blocked.includes('/explore/'));
  assert.ok(paths.allowed.includes('/reel/'));
  assert.ok(paths.allowed.includes('/explore/search/'));
});

test('paths.json leaves the login path alone', () => {
  const paths = readJSON('instagram/paths.json');
  assert.ok(!paths.blocked.some((p) => '/accounts/'.startsWith(p)));
});

function readStylesheet(relativePath) {
  // Comments carry prose that mentions paths; the rules are what these tests judge.
  return readText(relativePath).replace(/\/\*[\s\S]*?\*\//g, '');
}

test('hide.css hides the reels entry and leaves search alone', () => {
  const rules = readStylesheet('instagram/hide.css');
  assert.ok(rules.includes('a[href="/reels/"]'), 'hides the reels link');
  assert.ok(rules.includes('display: none'), 'actually hides something');
  assert.ok(
    !rules.includes('/explore/'),
    'the magnifier points at /explore/ and is the only way to reach search, so it stays visible'
  );
});

test('hide.css matches on attributes, never on class names', () => {
  const withoutAttributes = readStylesheet('instagram/hide.css').replace(/\[[^\]]*\]/g, '');
  assert.equal(
    /\.[A-Za-z_][\w-]*/.test(withoutAttributes),
    false,
    'class names on instagram.com are generated and change every few weeks'
  );
});

test('feed.json lists the feed heuristics', () => {
  const feed = readJSON('instagram/feed.json');
  for (const key of ['hideIfLinkPrefix', 'hideIfTextContains']) {
    assert.ok(Array.isArray(feed[key]) && feed[key].length > 0, `${key} is a non-empty array`);
    feed[key].forEach((v) => assert.ok(typeof v === 'string' && v.length > 0));
  }
  assert.equal(typeof feed.articleSelector, 'string');
  assert.equal(typeof feed.feedRootSelector, 'string');
  feed.hideIfLinkPrefix.forEach((p, i) => assertPathPrefix(p, `hideIfLinkPrefix[${i}]`));
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test 'tests/**/*.test.js'`
Expected: FAIL with `ENOENT` — the JSON files do not exist yet.

- [ ] **Step 3: Create the three data files**

`engine/instagram/paths.json`:

```json
{
  "blocked": ["/reels/", "/explore/"],
  "allowed": ["/reel/", "/explore/search/"]
}
```

`engine/instagram/hide.css`:

```css
/* Undo's static hides for Instagram.

   Installed at document start, before the page body is parsed, so these elements
   are never painted. Matching is by href and aria-label: class names on
   instagram.com are generated and change every few weeks.

   The explore link is deliberately absent. The magnifier in the bottom bar points
   at /explore/ and is the only way to reach search, so it stays visible and the
   navigation policy sends it to search instead. */

/* The Reels entry in the navigation bar. */
a[href="/reels/"],
a[href^="/reels/"],
[aria-label="Reels"] {
  display: none !important;
}

/* "Open in app" banners and App Store interstitials. */
a[href^="https://apps.apple.com"],
a[href^="itms-apps:"],
a[href^="instagram:"] {
  display: none !important;
}
```

`engine/instagram/feed.json`:

```json
{
  "hideIfLinkPrefix": ["/reel/", "/reels/"],
  "hideIfTextContains": ["Suggested for you", "Suggested posts", "Suggested Reels", "Sponsored"],
  "articleSelector": "article",
  "feedRootSelector": "main"
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test 'tests/**/*.test.js'`
Expected: PASS, 5 tests.

Note the quoting: `node --test tests/` fails on Node 25 with `MODULE_NOT_FOUND`. The quoted glob is the form that works, and it is the form CI uses.

- [ ] **Step 5: Create the injection marker**

`engine/marker.js`:

```js
/* Undo injection marker.
   Setting this flag is its whole effect. Anyone can open Safari's Web Inspector
   against the running app and read window.__undoFilterPresent to see where Undo's
   scripts are installed: true on the pages Undo filters, undefined on every page
   under /accounts/. */
(function (global) {
  'use strict';
  global.__undoFilterPresent = true;
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

- [ ] **Step 6: Write the CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  engine:
    name: Engine (JavaScript)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '22'
      - run: node --test 'tests/**/*.test.js'

  kit:
    name: UndoKit (Swift)
    runs-on: macos-15
    steps:
      - uses: actions/checkout@v4
      - run: swift test --package-path ios/UndoKit

  app:
    name: App build (unsigned)
    runs-on: macos-15
    steps:
      - uses: actions/checkout@v4
      - run: |
          xcodebuild build \
            -project ios/Undo.xcodeproj \
            -scheme Undo \
            -destination 'generic/platform=iOS' \
            CODE_SIGNING_ALLOWED=NO
```

The `kit` and `app` jobs start passing in Tasks 2 and 3. If the runner's default Xcode is older than 16, the `app` job needs a `sudo xcode-select -s /Applications/Xcode_16.4.app` step before `xcodebuild`, because the project file uses object version 77.

- [ ] **Step 7: Write README.md**

Replace the whole file:

````markdown
# Undo

Instagram without the distractions. Open source, no backend, runs on your phone.

Undo opens Instagram in an embedded web view and removes the parts built to keep
you scrolling: the Reels feed, Explore, suggested posts, sponsored posts and the
"open in app" banners. Your home feed, stories, search, DMs, notifications,
profile and photo posting all work as they do on instagram.com.

A reel someone sends you in a DM opens and plays. Swiping to the next one does
not, which is the point.

## Checking the claims

Undo is built so a stranger can verify it rather than trust it.

- **It talks to Instagram and nothing else.** Undo has no backend and no
  analytics, so it sends nothing anywhere. The embedded web view loads
  instagram.com and the Meta content delivery domains instagram.com itself asks
  for, such as cdninstagram.com and fbcdn.net. Confirm it on your own phone:
  Settings > Privacy & Security > App Privacy Report, turn it on, use Undo for a
  day, and read the domain list.
- **The filter is plain text you can read.** Every rule lives in `engine/` as
  JavaScript and JSON. Those files ship into the app bundle unchanged, so you can
  extract an installed copy of Undo and diff `Undo.app/engine/` against this repo.
- **The filter stays off the login pages.** `SECURITY.md` describes the guard and
  how to watch it work in Safari's Web Inspector.
- **Each release is built in public.** GitHub Actions builds every commit, and
  each App Store version is tagged to the commit it came from.

## Building it

Requires Xcode 26 or newer and an iOS platform install
(`xcodebuild -downloadPlatform iOS`).

```bash
node --test 'tests/**/*.test.js'     # filter rules and logic
swift test --package-path ios/UndoKit  # policy logic
open ios/Undo.xcodeproj                # then run on your iPhone
```

## Licence

MIT. See `LICENSE`.
````

- [ ] **Step 8: Write SECURITY.md**

````markdown
# Security

Undo embeds Instagram in a web view, which means Undo's own code runs on the same
pages where you type your password. That is exactly the position people are asked
to trust with apps of this kind, so Undo is built so you do not have to.

## The login-page guard

Undo's filter script is injected only when the URL path is outside `/accounts/`.
Instagram serves login, two-factor and password recovery from `/accounts/`, so on
every page where credentials are typed there is no Undo code on the page at all.

The guard runs in the navigation delegate, before each page load begins:
`InjectionPolicy.allowsInjection(url:)` in `ios/UndoKit` decides, all installed
user scripts are removed, and they are re-installed only when the answer is yes.
Anything that is not an ordinary web page with a path is treated as guarded, so
the failure mode is no injection. The decision is unit-tested in
`ios/UndoKit/Tests/UndoKitTests/InjectionPolicyTests.swift` and those tests run in
CI on every commit.

## Watching the guard work

`engine/marker.js` sets `window.__undoFilterPresent` and does nothing else. Debug
builds turn on `isInspectable`, so you can check the guard yourself:

1. Build Undo onto your iPhone from Xcode and connect it to your Mac.
2. In Safari on the Mac, enable Develop > Show features for web developers.
3. Open Undo on the phone, go to the home feed, and in Safari choose
   Develop > [your iPhone] > the Instagram page.
4. In the console, type `window.__undoFilterPresent`. On the feed it is `true`.
5. Sign out, land on `/accounts/login/`, reopen the inspector, and type it again.
   It is `undefined`, and `document.querySelectorAll('script').length` shows no
   Undo script.

## What Undo sends where

Nothing. Undo has no backend, no analytics, no telemetry and no remote code. It
loads no JavaScript it did not ship with. Every filter rule is a file in
`engine/` inside the app bundle.

## Reporting an issue

Email `security@3pencils.co` with what you found and how to reproduce it. Please
give us a chance to ship a fix before publishing.
````

- [ ] **Step 9: Run the whole test suite**

Run: `node --test 'tests/**/*.test.js'`
Expected: PASS, 4 tests, 0 failures.

- [ ] **Step 10: Propose the commit, then wait**

Show the owner this command and run it only after they say so:

```bash
git add engine .github README.md SECURITY.md docs
git commit -m "Add the Instagram filter rules, their schema tests, and CI

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: UndoKit — the policies that decide what is blocked and where the script runs

Carries the security invariant. Pure Swift, no WebKit, tests run on the Mac with no simulator.

**Files:**
- Create: `ios/UndoKit/Package.swift`
- Create: `ios/UndoKit/Sources/UndoKit/PathPolicy.swift`
- Create: `ios/UndoKit/Sources/UndoKit/InjectionPolicy.swift`
- Create: `ios/UndoKit/Sources/UndoKit/EngineConfig.swift`
- Test: `ios/UndoKit/Tests/UndoKitTests/PathPolicyTests.swift`
- Test: `ios/UndoKit/Tests/UndoKitTests/InjectionPolicyTests.swift`
- Test: `ios/UndoKit/Tests/UndoKitTests/EngineConfigTests.swift`

**Interfaces:**
- Consumes: `engine/instagram/paths.json` and `engine/instagram/feed.json` from Task 1.
- Produces:
  - `PathPolicy.normalize(_ path: String) -> String`
  - `PathPolicy(blocked: [String], allowed: [String])` and `.isBlocked(_ path: String) -> Bool`
  - `PathPolicy.init(rules: PathRules)`
  - `InjectionPolicy.allowsInjection(path: String) -> Bool`
  - `InjectionPolicy.allowsInjection(url: URL?) -> Bool`
  - `struct PathRules: Codable, Sendable, Equatable { let blocked: [String]; let allowed: [String] }`
  - `struct FeedRules: Codable, Sendable, Equatable { let hideIfLinkPrefix: [String]; let hideIfTextContains: [String]; let articleSelector: String; let feedRootSelector: String }`
  - `EngineConfig.decodePathRules(_ data: Data) throws -> PathRules`
  - `EngineConfig.decodeFeedRules(_ data: Data) throws -> FeedRules`
  - `EngineConfig.feedRulesJSONLiteral(_ data: Data) throws -> String`

- [ ] **Step 1: Create the package manifest**

`ios/UndoKit/Package.swift`:

```swift
// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "UndoKit",
    platforms: [.iOS(.v17), .macOS(.v14)],
    products: [.library(name: "UndoKit", targets: ["UndoKit"])],
    targets: [
        .target(name: "UndoKit"),
        .testTarget(name: "UndoKitTests", dependencies: ["UndoKit"]),
    ]
)
```

The macOS platform line is what lets `swift test` run these suites on the Mac without a simulator. Keep it.

- [ ] **Step 2: Write the failing PathPolicy tests**

`ios/UndoKit/Tests/UndoKitTests/PathPolicyTests.swift`:

```swift
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
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `swift test --package-path ios/UndoKit`
Expected: FAIL to compile with `cannot find 'PathPolicy' in scope`.

- [ ] **Step 4: Write PathPolicy**

`ios/UndoKit/Sources/UndoKit/PathPolicy.swift`:

```swift
import Foundation

/// Decides whether a URL path is one Undo refuses to open.
///
/// Prefixes are compared against a path that always ends in a slash, so `/reels`
/// and `/reels/` are the same thing and `/reel/ABC/` never matches `/reels/`.
public struct PathPolicy: Sendable, Equatable {
    public let blocked: [String]
    public let allowed: [String]

    public init(blocked: [String], allowed: [String]) {
        self.blocked = blocked
        self.allowed = allowed
    }

    public init(rules: PathRules) {
        self.init(blocked: rules.blocked, allowed: rules.allowed)
    }

    public static func normalize(_ path: String) -> String {
        let path = path.isEmpty ? "/" : path
        return path.hasSuffix("/") ? path : path + "/"
    }

    public func isBlocked(_ path: String) -> Bool {
        let path = Self.normalize(path)
        if allowed.contains(where: { path.hasPrefix($0) }) { return false }
        return blocked.contains(where: { path.hasPrefix($0) })
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `swift test --package-path ios/UndoKit`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing InjectionPolicy tests**

`ios/UndoKit/Tests/UndoKitTests/InjectionPolicyTests.swift`:

```swift
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
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `swift test --package-path ios/UndoKit`
Expected: FAIL to compile with `cannot find 'InjectionPolicy' in scope`.

- [ ] **Step 8: Write InjectionPolicy**

`ios/UndoKit/Sources/UndoKit/InjectionPolicy.swift`:

```swift
import Foundation

/// Decides whether Undo's scripts may be installed for a page.
///
/// Instagram serves login, two-factor and password recovery under `/accounts/`.
/// Undo's code stays off those pages, so the app holds no position from which it
/// could read a password. Anything that is not an ordinary web page with a path
/// is treated as guarded, so the failure mode is no injection.
public enum InjectionPolicy {
    public static let guardedPrefixes = ["/accounts/"]

    public static func allowsInjection(path: String) -> Bool {
        let path = PathPolicy.normalize(path)
        return !guardedPrefixes.contains { path.hasPrefix($0) }
    }

    public static func allowsInjection(url: URL?) -> Bool {
        // The scheme and the leading slash both matter. `about:blank` parses with
        // a path of "blank", which is not a site path and must not be treated
        // as one.
        guard let url,
              let scheme = url.scheme?.lowercased(),
              scheme == "http" || scheme == "https",
              let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              components.path.hasPrefix("/")
        else { return false }
        return allowsInjection(path: components.path)
    }
}
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `swift test --package-path ios/UndoKit`
Expected: PASS, 8 tests.

- [ ] **Step 10: Write the failing EngineConfig tests**

`ios/UndoKit/Tests/UndoKitTests/EngineConfigTests.swift`:

```swift
import Foundation
import Testing
@testable import UndoKit

/// The repo root, found by walking up from this file:
/// UndoKitTests -> Tests -> UndoKit -> ios -> repo root.
func repoRoot(file: String = #filePath) -> URL {
    URL(fileURLWithPath: file)
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
        .deletingLastPathComponent()
}

func engineData(_ relativePath: String) throws -> Data {
    try Data(contentsOf: repoRoot().appending(path: "engine/" + relativePath))
}

@Test func decodesTheShippedPathRules() throws {
    let rules = try EngineConfig.decodePathRules(engineData("instagram/paths.json"))
    #expect(rules.blocked.contains("/reels/"))
    #expect(rules.blocked.contains("/explore/"))
    #expect(rules.allowed.contains("/reel/"))
    #expect(rules.allowed.contains("/explore/search/"))
}

@Test func theShippedPathRulesBlockWhatTheySay() throws {
    let policy = try PathPolicy(rules: EngineConfig.decodePathRules(engineData("instagram/paths.json")))
    #expect(policy.isBlocked("/reels/"))
    #expect(policy.isBlocked("/explore/"))
    #expect(policy.isBlocked("/explore/search/") == false)
    #expect(policy.isBlocked("/reel/ABC123/") == false)
    #expect(policy.isBlocked("/accounts/login/") == false)
}

@Test func decodesTheShippedFeedRules() throws {
    let rules = try EngineConfig.decodeFeedRules(engineData("instagram/feed.json"))
    #expect(rules.articleSelector == "article")
    #expect(rules.feedRootSelector == "main")
    #expect(rules.hideIfLinkPrefix.contains("/reel/"))
    #expect(rules.hideIfTextContains.contains("Sponsored"))
}

@Test func buildsAOneLineJSONLiteralForInjection() throws {
    let literal = try EngineConfig.feedRulesJSONLiteral(engineData("instagram/feed.json"))
    #expect(literal.contains("\"articleSelector\":\"article\""))
    #expect(literal.contains("\n") == false)
}

@Test func rejectsMalformedEngineData() {
    #expect(throws: (any Error).self) {
        _ = try EngineConfig.decodeFeedRules(Data("{\"articleSelector\":\"article\"}".utf8))
    }
}
```

- [ ] **Step 11: Run the tests to verify they fail**

Run: `swift test --package-path ios/UndoKit`
Expected: FAIL to compile with `cannot find 'EngineConfig' in scope`.

- [ ] **Step 12: Write EngineConfig**

`ios/UndoKit/Sources/UndoKit/EngineConfig.swift`:

```swift
import Foundation

/// The blocked and allowed path prefixes, as shipped in `engine/<platform>/paths.json`.
public struct PathRules: Codable, Sendable, Equatable {
    public let blocked: [String]
    public let allowed: [String]

    public init(blocked: [String], allowed: [String]) {
        self.blocked = blocked
        self.allowed = allowed
    }
}

/// The feed heuristics, as shipped in `engine/<platform>/feed.json`.
public struct FeedRules: Codable, Sendable, Equatable {
    public let hideIfLinkPrefix: [String]
    public let hideIfTextContains: [String]
    public let articleSelector: String
    public let feedRootSelector: String

    public init(
        hideIfLinkPrefix: [String],
        hideIfTextContains: [String],
        articleSelector: String,
        feedRootSelector: String
    ) {
        self.hideIfLinkPrefix = hideIfLinkPrefix
        self.hideIfTextContains = hideIfTextContains
        self.articleSelector = articleSelector
        self.feedRootSelector = feedRootSelector
    }
}

/// Turns the bundled engine files into Swift values.
///
/// Decoding is strict on purpose: a missing key throws rather than falling back to
/// a default, so a mistake in `engine/` surfaces at launch in a debug build
/// instead of quietly turning a filter off.
public enum EngineConfig {
    public static func decodePathRules(_ data: Data) throws -> PathRules {
        try JSONDecoder().decode(PathRules.self, from: data)
    }

    public static func decodeFeedRules(_ data: Data) throws -> FeedRules {
        try JSONDecoder().decode(FeedRules.self, from: data)
    }

    /// The feed rules as compact JSON, ready to assign to a global in an injected script.
    /// Round-tripping through `FeedRules` means only known keys reach the page.
    public static func feedRulesJSONLiteral(_ data: Data) throws -> String {
        let rules = try decodeFeedRules(data)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        return String(decoding: try encoder.encode(rules), as: UTF8.self)
    }
}
```

- [ ] **Step 13: Run the tests to verify they pass**

Run: `swift test --package-path ios/UndoKit`
Expected: PASS, 13 tests.

- [ ] **Step 14: Propose the commit, then wait**

```bash
git add ios/UndoKit
git commit -m "Add UndoKit: path policy, login-page guard, and engine config

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The iOS app shell — Instagram in a web view, login that survives a restart

Milestone 1. No filtering yet: this task's deliverable is an app that is Instagram, so the next tasks have something to subtract from.

The project file is written by hand. There is no `xcodegen` or `tuist` here and adding one would break the zero-dependency rule. The file below uses object version 77 and a `PBXFileSystemSynchronizedRootGroup`, so every `.swift` file inside `ios/Undo/` is part of the target automatically and the project file never needs touching again when a file is added.

**Files:**
- Create: `ios/Undo.xcodeproj/project.pbxproj`
- Create: `ios/Undo.xcodeproj/xcshareddata/xcschemes/Undo.xcscheme`
- Create: `ios/Undo/UndoApp.swift`
- Create: `ios/Undo/Platform.swift`
- Create: `ios/Undo/RootView.swift`
- Create: `ios/Undo/WebTab.swift`
- Create: `ios/Undo/WebCoordinator.swift`
- Create: `ios/Undo/EngineBundle.swift`

**Interfaces:**
- Consumes: `UndoKit` from Task 2, via a local Swift package reference.
- Produces:
  - `struct Platform` with `id: String`, `title: String`, `systemImage: String`, `homeURL: URL`, `engineDirectory: String`, `allowedHostSuffixes: [String]`, and `static let instagram: Platform`
  - `Platform.hosts(_ url: URL) -> Bool`
  - `enum EngineBundle` with `static func data(_ relativePath: String) -> Data?` and `static func string(_ relativePath: String) -> String?`
  - `final class WebCoordinator: NSObject, WKNavigationDelegate` with `init(platform: Platform)` and `func start(_ webView: WKWebView)`
  - `struct WebTab: UIViewRepresentable`

- [ ] **Step 1: Write the project file**

`ios/Undo.xcodeproj/project.pbxproj`. The object identifiers are arbitrary but must stay consistent across the file and the scheme:

```
// !$*UTF8*$!
{
	archiveVersion = 1;
	classes = {
	};
	objectVersion = 77;
	objects = {

/* Begin PBXBuildFile section */
		0A1B2C3D0000000000000012 /* UndoKit in Frameworks */ = {isa = PBXBuildFile; productRef = 0A1B2C3D0000000000000011 /* UndoKit */; };
		0A1B2C3D0000000000000014 /* engine in Resources */ = {isa = PBXBuildFile; fileRef = 0A1B2C3D0000000000000013 /* engine */; };
/* End PBXBuildFile section */

/* Begin PBXFileReference section */
		0A1B2C3D0000000000000006 /* Undo.app */ = {isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = Undo.app; sourceTree = BUILT_PRODUCTS_DIR; };
		0A1B2C3D0000000000000013 /* engine */ = {isa = PBXFileReference; lastKnownFileType = folder; name = engine; path = ../engine; sourceTree = "<group>"; };
/* End PBXFileReference section */

/* Begin PBXFileSystemSynchronizedRootGroup section */
		0A1B2C3D0000000000000003 /* Undo */ = {isa = PBXFileSystemSynchronizedRootGroup; path = Undo; sourceTree = "<group>"; };
/* End PBXFileSystemSynchronizedRootGroup section */

/* Begin PBXFrameworksBuildPhase section */
		0A1B2C3D0000000000000008 /* Frameworks */ = {
			isa = PBXFrameworksBuildPhase;
			buildActionMask = 2147483647;
			files = (
				0A1B2C3D0000000000000012 /* UndoKit in Frameworks */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
		0A1B2C3D0000000000000004 = {
			isa = PBXGroup;
			children = (
				0A1B2C3D0000000000000013 /* engine */,
				0A1B2C3D0000000000000003 /* Undo */,
				0A1B2C3D0000000000000005 /* Products */,
			);
			sourceTree = "<group>";
		};
		0A1B2C3D0000000000000005 /* Products */ = {
			isa = PBXGroup;
			children = (
				0A1B2C3D0000000000000006 /* Undo.app */,
			);
			name = Products;
			sourceTree = "<group>";
		};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
		0A1B2C3D0000000000000002 /* Undo */ = {
			isa = PBXNativeTarget;
			buildConfigurationList = 0A1B2C3D000000000000000B /* Build configuration list for PBXNativeTarget "Undo" */;
			buildPhases = (
				0A1B2C3D0000000000000007 /* Sources */,
				0A1B2C3D0000000000000008 /* Frameworks */,
				0A1B2C3D0000000000000009 /* Resources */,
			);
			buildRules = (
			);
			dependencies = (
			);
			fileSystemSynchronizedGroups = (
				0A1B2C3D0000000000000003 /* Undo */,
			);
			name = Undo;
			packageProductDependencies = (
				0A1B2C3D0000000000000011 /* UndoKit */,
			);
			productName = Undo;
			productReference = 0A1B2C3D0000000000000006 /* Undo.app */;
			productType = "com.apple.product-type.application";
		};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
		0A1B2C3D0000000000000001 /* Project object */ = {
			isa = PBXProject;
			attributes = {
				BuildIndependentTargetsInParallel = 1;
				LastSwiftUpdateCheck = 2620;
				LastUpgradeCheck = 2620;
				TargetAttributes = {
					0A1B2C3D0000000000000002 = {
						CreatedOnToolsVersion = 26.2;
					};
				};
			};
			buildConfigurationList = 0A1B2C3D000000000000000A /* Build configuration list for PBXProject "Undo" */;
			developmentRegion = en;
			hasScannedForEncodings = 0;
			knownRegions = (
				en,
				Base,
			);
			mainGroup = 0A1B2C3D0000000000000004;
			minimizedProjectReferenceProxies = 1;
			packageReferences = (
				0A1B2C3D0000000000000010 /* XCLocalSwiftPackageReference "UndoKit" */,
			);
			preferredProjectObjectVersion = 77;
			productRefGroup = 0A1B2C3D0000000000000005 /* Products */;
			projectDirPath = "";
			projectRoot = "";
			targets = (
				0A1B2C3D0000000000000002 /* Undo */,
			);
		};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
		0A1B2C3D0000000000000009 /* Resources */ = {
			isa = PBXResourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
				0A1B2C3D0000000000000014 /* engine in Resources */,
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXResourcesBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
		0A1B2C3D0000000000000007 /* Sources */ = {
			isa = PBXSourcesBuildPhase;
			buildActionMask = 2147483647;
			files = (
			);
			runOnlyForDeploymentPostprocessing = 0;
		};
/* End PBXSourcesBuildPhase section */

/* Begin XCBuildConfiguration section */
		0A1B2C3D000000000000000C /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				ALWAYS_SEARCH_USER_PATHS = NO;
				CLANG_ENABLE_OBJC_WEAK = YES;
				ENABLE_USER_SCRIPT_SANDBOXING = YES;
				GCC_NO_COMMON_BLOCKS = YES;
				IPHONEOS_DEPLOYMENT_TARGET = 17.0;
				ONLY_ACTIVE_ARCH = YES;
				SDKROOT = iphoneos;
				SWIFT_ACTIVE_COMPILATION_CONDITIONS = "DEBUG $(inherited)";
				SWIFT_OPTIMIZATION_LEVEL = "-Onone";
				SWIFT_VERSION = 6.0;
			};
			name = Debug;
		};
		0A1B2C3D000000000000000D /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				ALWAYS_SEARCH_USER_PATHS = NO;
				CLANG_ENABLE_OBJC_WEAK = YES;
				ENABLE_USER_SCRIPT_SANDBOXING = YES;
				GCC_NO_COMMON_BLOCKS = YES;
				IPHONEOS_DEPLOYMENT_TARGET = 17.0;
				SDKROOT = iphoneos;
				SWIFT_COMPILATION_MODE = wholemodule;
				SWIFT_VERSION = 6.0;
				VALIDATE_PRODUCT = YES;
			};
			name = Release;
		};
		0A1B2C3D000000000000000E /* Debug */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				GENERATE_INFOPLIST_FILE = YES;
				INFOPLIST_KEY_CFBundleDisplayName = Undo;
				INFOPLIST_KEY_NSCameraUsageDescription = "Undo uses the camera when you choose to take a photo for a post or a message.";
				INFOPLIST_KEY_NSPhotoLibraryUsageDescription = "Undo uses your photo library when you choose a photo for a post or a message.";
				INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
				INFOPLIST_KEY_UILaunchScreen_Generation = YES;
				INFOPLIST_KEY_UISupportedInterfaceOrientations = UIInterfaceOrientationPortrait;
				MARKETING_VERSION = 0.1.0;
				PRODUCT_BUNDLE_IDENTIFIER = com.3pencils.undo;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SWIFT_EMIT_LOC_STRINGS = YES;
				TARGETED_DEVICE_FAMILY = 1;
			};
			name = Debug;
		};
		0A1B2C3D000000000000000F /* Release */ = {
			isa = XCBuildConfiguration;
			buildSettings = {
				CODE_SIGN_STYLE = Automatic;
				CURRENT_PROJECT_VERSION = 1;
				GENERATE_INFOPLIST_FILE = YES;
				INFOPLIST_KEY_CFBundleDisplayName = Undo;
				INFOPLIST_KEY_NSCameraUsageDescription = "Undo uses the camera when you choose to take a photo for a post or a message.";
				INFOPLIST_KEY_NSPhotoLibraryUsageDescription = "Undo uses your photo library when you choose a photo for a post or a message.";
				INFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
				INFOPLIST_KEY_UILaunchScreen_Generation = YES;
				INFOPLIST_KEY_UISupportedInterfaceOrientations = UIInterfaceOrientationPortrait;
				MARKETING_VERSION = 0.1.0;
				PRODUCT_BUNDLE_IDENTIFIER = com.3pencils.undo;
				PRODUCT_NAME = "$(TARGET_NAME)";
				SWIFT_EMIT_LOC_STRINGS = YES;
				TARGETED_DEVICE_FAMILY = 1;
			};
			name = Release;
		};
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
		0A1B2C3D000000000000000A /* Build configuration list for PBXProject "Undo" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				0A1B2C3D000000000000000C /* Debug */,
				0A1B2C3D000000000000000D /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		};
		0A1B2C3D000000000000000B /* Build configuration list for PBXNativeTarget "Undo" */ = {
			isa = XCConfigurationList;
			buildConfigurations = (
				0A1B2C3D000000000000000E /* Debug */,
				0A1B2C3D000000000000000F /* Release */,
			);
			defaultConfigurationIsVisible = 0;
			defaultConfigurationName = Release;
		};
/* End XCConfigurationList section */

/* Begin XCLocalSwiftPackageReference section */
		0A1B2C3D0000000000000010 /* XCLocalSwiftPackageReference "UndoKit" */ = {
			isa = XCLocalSwiftPackageReference;
			relativePath = UndoKit;
		};
/* End XCLocalSwiftPackageReference section */

/* Begin XCSwiftPackageProductDependency section */
		0A1B2C3D0000000000000011 /* UndoKit */ = {
			isa = XCSwiftPackageProductDependency;
			productName = UndoKit;
		};
/* End XCSwiftPackageProductDependency section */
	};
	rootObject = 0A1B2C3D0000000000000001 /* Project object */;
}
```

- [ ] **Step 2: Write the shared scheme**

`ios/Undo.xcodeproj/xcshareddata/xcschemes/Undo.xcscheme`. Sharing the scheme is what lets `xcodebuild -scheme Undo` work in CI and on a fresh clone:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<Scheme LastUpgradeVersion = "2620" version = "1.7">
   <BuildAction parallelizeBuildables = "YES" buildImplicitDependencies = "YES">
      <BuildActionEntries>
         <BuildActionEntry buildForTesting = "YES" buildForRunning = "YES" buildForProfiling = "YES" buildForArchiving = "YES" buildForAnalyzing = "YES">
            <BuildableReference
               BuildableIdentifier = "primary"
               BlueprintIdentifier = "0A1B2C3D0000000000000002"
               BuildableName = "Undo.app"
               BlueprintName = "Undo"
               ReferencedContainer = "container:Undo.xcodeproj">
            </BuildableReference>
         </BuildActionEntry>
      </BuildActionEntries>
   </BuildAction>
   <TestAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" shouldUseLaunchSchemeArgsEnv = "YES">
      <Testables>
      </Testables>
   </TestAction>
   <LaunchAction buildConfiguration = "Debug" selectedDebuggerIdentifier = "Xcode.DebuggerFoundation.Debugger.LLDB" selectedLauncherIdentifier = "Xcode.DebuggerFoundation.Launcher.LLDB" launchStyle = "0" useCustomWorkingDirectory = "NO" ignoresPersistentStateOnLaunch = "NO" debugDocumentVersioning = "YES" debugServiceExtension = "internal" allowLocationSimulation = "YES">
      <BuildableProductRunnable runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "0A1B2C3D0000000000000002"
            BuildableName = "Undo.app"
            BlueprintName = "Undo"
            ReferencedContainer = "container:Undo.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </LaunchAction>
   <ProfileAction buildConfiguration = "Release" shouldUseLaunchSchemeArgsEnv = "YES" savedToolIdentifier = "" useCustomWorkingDirectory = "NO" debugDocumentVersioning = "YES">
      <BuildableProductRunnable runnableDebuggingMode = "0">
         <BuildableReference
            BuildableIdentifier = "primary"
            BlueprintIdentifier = "0A1B2C3D0000000000000002"
            BuildableName = "Undo.app"
            BlueprintName = "Undo"
            ReferencedContainer = "container:Undo.xcodeproj">
         </BuildableReference>
      </BuildableProductRunnable>
   </ProfileAction>
   <AnalyzeAction buildConfiguration = "Debug"></AnalyzeAction>
   <ArchiveAction buildConfiguration = "Release" revealArchiveInOrganizer = "YES"></ArchiveAction>
</Scheme>
```

- [ ] **Step 3: Verify the project parses and the package resolves**

Run: `xcodebuild -list -project ios/Undo.xcodeproj`
Expected: `Targets: Undo`, `Build Configurations: Debug, Release`, `Schemes: Undo, UndoKit`, and a `Resolved source packages: UndoKit: ... @ local` line.

If `Schemes:` comes back empty, run the same command once more — the first run resolves the package graph before it indexes schemes.

If the project fails to open at all, fall back to creating it in Xcode: File > New > Project > iOS App, product name `Undo`, organization identifier `com.3pencils`, interface SwiftUI, language Swift, saved into `ios/`. Then add the local package (File > Add Package Dependencies > Add Local > `ios/UndoKit`) and drag `engine/` in as a folder reference with "Create folder references" selected.

- [ ] **Step 4: Write Platform**

`ios/Undo/Platform.swift`:

```swift
import Foundation

/// One embedded platform: where it lives, which engine folder filters it, and
/// which hosts belong to it.
struct Platform: Identifiable, Hashable, Sendable {
    let id: String
    let title: String
    let systemImage: String
    let homeURL: URL
    /// Where the platform's search lives, for the redirect in `WebCoordinator`.
    let searchURL: URL?
    let engineDirectory: String
    let allowedHostSuffixes: [String]

    static let instagram = Platform(
        id: "instagram",
        title: "Instagram",
        systemImage: "camera",
        homeURL: URL(string: "https://www.instagram.com/")!,
        searchURL: URL(string: "https://www.instagram.com/explore/search/"),
        engineDirectory: "instagram",
        allowedHostSuffixes: ["instagram.com", "cdninstagram.com", "fbcdn.net"]
    )

    /// True when this URL belongs to the platform, so the web view stays inside it.
    func hosts(_ url: URL) -> Bool {
        guard let host = url.host()?.lowercased() else { return false }
        return allowedHostSuffixes.contains { host == $0 || host.hasSuffix("." + $0) }
    }
}
```

- [ ] **Step 5: Write EngineBundle**

`ios/Undo/EngineBundle.swift`:

```swift
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
```

- [ ] **Step 6: Write WebCoordinator**

`ios/Undo/WebCoordinator.swift`. This task's version only starts the load; Tasks 4, 5 and 6 add the filtering:

```swift
import UIKit
import WebKit

/// Owns one platform's web view: what it loads and what it refuses to load.
@MainActor
final class WebCoordinator: NSObject {
    let platform: Platform

    init(platform: Platform) {
        self.platform = platform
    }

    /// Prepares the web view and loads the platform's home page.
    func start(_ webView: WKWebView) {
        webView.load(URLRequest(url: platform.homeURL))
    }
}

extension WebCoordinator: WKNavigationDelegate {
}
```

- [ ] **Step 7: Write WebTab**

`ios/Undo/WebTab.swift`:

```swift
import SwiftUI
import WebKit

/// One platform's web view, as a SwiftUI view.
struct WebTab: UIViewRepresentable {
    let platform: Platform

    func makeCoordinator() -> WebCoordinator {
        WebCoordinator(platform: platform)
    }

    func makeUIView(context: Context) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        // The default data store is the persistent one, which is what keeps a
        // login, and its two-factor trust, alive across restarts.
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.navigationDelegate = context.coordinator
        webView.allowsBackForwardNavigationGestures = true
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        #if DEBUG
        // Lets Safari's Develop menu open the live DOM inside the app, which is
        // how selectors get found and fixed.
        webView.isInspectable = true
        #endif

        context.coordinator.start(webView)
        return webView
    }

    func updateUIView(_ webView: WKWebView, context: Context) {}
}
```

- [ ] **Step 8: Write RootView and UndoApp**

`ios/Undo/RootView.swift`:

```swift
import SwiftUI

struct RootView: View {
    private let platforms: [Platform] = [.instagram]

    var body: some View {
        TabView {
            ForEach(platforms) { platform in
                WebTab(platform: platform)
                    .ignoresSafeArea(.container, edges: .bottom)
                    .tabItem { Label(platform.title, systemImage: platform.systemImage) }
            }
        }
    }
}
```

`ios/Undo/UndoApp.swift`:

```swift
import SwiftUI

@main
struct UndoApp: App {
    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
```

- [ ] **Step 9: Build for a generic iOS device**

Run:

```bash
xcodebuild build -project ios/Undo.xcodeproj -scheme Undo \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO
```

Expected: `** BUILD SUCCEEDED **`.

If it reports `iOS 26.2 is not installed`, the Prerequisite section at the top has not been done yet.

- [ ] **Step 10: Verify the engine files reach the bundle**

Run:

```bash
xcodebuild build -project ios/Undo.xcodeproj -scheme Undo \
  -destination 'generic/platform=iOS' -derivedDataPath /tmp/undo-dd \
  CODE_SIGNING_ALLOWED=NO
find /tmp/undo-dd/Build/Products -name '*.app' -maxdepth 3 -exec ls -R {}/engine \;
```

Expected: exactly `marker.js` and an `instagram` folder holding `feed.json`, `filter.js`, `hide.css` and `paths.json` — and nothing else. `engine/` ships verbatim as a folder reference, so anything put inside it lands in the installed app; that is why the tests live in `tests/` at the repo root instead.

- [ ] **Step 11: Run it on the iPhone and verify the login persists**

This is the milestone, and only a person can confirm it.

1. Connect the iPhone, open `ios/Undo.xcodeproj` in Xcode, select the device, set the signing team on the `Undo` target to the paid Apple Developer account, and Run. A free Apple ID also works, at the cost of a build that stops launching after seven days.
2. Trust the developer certificate on the phone if asked: Settings > General > VPN & Device Management.
3. Log in to Instagram, including the two-factor step.
4. Confirm the home feed, stories, search, DMs, notifications and profile all load.
5. Force-quit Undo from the app switcher and reopen it. Expected: still logged in, no second two-factor prompt.
6. Restart the phone, reopen Undo. Expected: still logged in.

Record the result in the task notes. A failure here means the data store is wrong, and nothing after this task will work.

- [ ] **Step 12: Propose the commit, then wait**

```bash
git add ios/Undo ios/Undo.xcodeproj
git commit -m "Add the iOS shell: Instagram in a persistent web view

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: Navigation policy and the login-page guard

Milestone 2, and the layer that does most of the work for ten lines of code. `/reels/` and the explore grid stop loading at all, `/reel/<id>/` keeps working, the magnifier becomes a search button, and the injection guard goes in before there is anything to inject.

**Files:**
- Modify: `ios/Undo/WebCoordinator.swift` (replace the whole file)

**Interfaces:**
- Consumes: `PathPolicy`, `InjectionPolicy`, `EngineConfig` from Task 2; `Platform.hosts(_:)` and `EngineBundle` from Task 3; `engine/marker.js` from Task 1.
- Produces: `WebCoordinator.start(_:)` unchanged in signature. Adds private `applyInjectionGuard(for:on:)` and the `WKNavigationDelegate` policy method.

- [ ] **Step 1: Replace WebCoordinator**

`ios/Undo/WebCoordinator.swift`:

```swift
import UIKit
import WebKit
import UndoKit

/// Owns one platform's web view: what it loads, what it refuses to load, and
/// where Undo's own scripts are allowed to run.
@MainActor
final class WebCoordinator: NSObject {
    let platform: Platform

    private let pathPolicy: PathPolicy
    private let userScripts: [WKUserScript]

    init(platform: Platform) {
        self.platform = platform
        self.pathPolicy = Self.loadPathPolicy(for: platform)
        self.userScripts = Self.loadUserScripts(for: platform)
        super.init()
    }

    func start(_ webView: WKWebView) {
        webView.load(URLRequest(url: platform.homeURL))
    }

    private static func loadPathPolicy(for platform: Platform) -> PathPolicy {
        guard let data = EngineBundle.data("\(platform.engineDirectory)/paths.json"),
              let rules = try? EngineConfig.decodePathRules(data)
        else {
            // A debug build stops here. A release build still browses, because an
            // app that blocks nothing beats an app that blocks everything.
            assertionFailure("engine/\(platform.engineDirectory)/paths.json is missing or malformed")
            return PathPolicy(blocked: [], allowed: [])
        }
        return PathPolicy(rules: rules)
    }

    private static func loadUserScripts(for platform: Platform) -> [WKUserScript] {
        guard let marker = EngineBundle.string("marker.js") else { return [] }
        return [
            WKUserScript(source: marker, injectionTime: .atDocumentStart, forMainFrameOnly: true)
        ]
    }

    /// Installs Undo's scripts for pages outside `/accounts/`, and removes them
    /// everywhere else. Called before each main-frame navigation begins, so a
    /// login page is loaded with no Undo code on it.
    private func applyInjectionGuard(for url: URL, on webView: WKWebView) {
        let controller = webView.configuration.userContentController
        controller.removeAllUserScripts()
        guard InjectionPolicy.allowsInjection(url: url) else { return }
        userScripts.forEach(controller.addUserScript)
    }
}

extension WebCoordinator: WKNavigationDelegate {
    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction
    ) async -> WKNavigationActionPolicy {
        guard let url = navigationAction.request.url else { return .cancel }

        // Sub-frames carry embeds and player chrome, and none of the rules here
        // are about them.
        let isMainFrame = navigationAction.targetFrame?.isMainFrame ?? true
        guard isMainFrame else { return .allow }

        // A link out of the platform opens in the browser, which keeps Undo's own
        // traffic to the platform it embeds.
        guard platform.hosts(url) else {
            if navigationAction.navigationType == .linkActivated {
                UIApplication.shared.open(url)
            }
            return .cancel
        }

        if pathPolicy.isBlocked(url.path) {
            // The magnifier in Instagram's bottom bar points at /explore/, so
            // cancelling that outright would take search with it. Search is what
            // people reach for that button for, so that is where it goes.
            if PathPolicy.normalize(url.path) == "/explore/", let search = platform.searchURL {
                webView.load(URLRequest(url: search))
            }
            return .cancel
        }

        applyInjectionGuard(for: url, on: webView)
        return .allow
    }
}
```

The async form of `decidePolicyFor` is used rather than the completion-handler form: under Swift 6 the completion handler carries a main-actor attribute that is easy to get subtly wrong, and this version reads as the decision it is.

- [ ] **Step 2: Build**

Run:

```bash
xcodebuild build -project ios/Undo.xcodeproj -scheme Undo \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 3: Verify the blocking on the phone**

Run on the device from Xcode, then:

1. Tap the Reels tab in Instagram's bottom bar. Expected: nothing happens, the feed stays put.
2. Tap the magnifier. Expected: the search page opens with a working search field, and no grid of suggested posts. Type a name and open a result to confirm search results load.
3. Watch for a loop on that tap: if the page flickers between search and explore, Instagram is redirecting `/explore/search/` back to `/explore/`. Record what the address bar settles on in Safari's Web Inspector, and use that path as `Platform.searchURL` instead.
4. Open a reel someone sent in a DM, or a reel from a profile grid. Expected: it opens and plays.
5. Tap a link in someone's bio. Expected: it opens in Safari, and Undo stays where it was.

- [ ] **Step 4: Verify the login-page guard on the phone**

This is the invariant, so verify it rather than assume it.

1. With the phone connected, open Safari on the Mac and enable Develop > Show features for web developers.
2. Develop > [iPhone] > the Instagram page, and in the console type `window.__undoFilterPresent`. Expected: `true`.
3. In Undo, sign out so Instagram lands on `/accounts/login/`. Reopen the inspector for that page and type `window.__undoFilterPresent` again. Expected: `undefined`.
4. Sign back in, including two-factor. Expected: login completes normally.

- [ ] **Step 5: Propose the commit, then wait**

```bash
git add ios/Undo/WebCoordinator.swift
git commit -m "Block the reels feed and explore, and guard the login pages

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The static hides

Milestone 3. The Reels entry and the install banners are gone before the page paints, so they are never seen at all.

The stylesheet is installed by a small script at document start, rather than compiled into a `WKContentRuleList`. Both apply before the first paint; this one uses machinery the app already has, and an Android WebView can install the identical file the identical way, which a content rule list cannot. If Undo ever needs to stop reel video from being fetched at all rather than merely hidden, `WKContentRuleList` is the right tool for that and comes back then.

**Files:**
- Create: `ios/UndoKit/Sources/UndoKit/ScriptBuilder.swift`
- Test: `ios/UndoKit/Tests/UndoKitTests/ScriptBuilderTests.swift`
- Modify: `ios/Undo/WebCoordinator.swift` (`loadUserScripts(for:)` only)

**Interfaces:**
- Consumes: `engine/instagram/hide.css` from Task 1; `engineData(_:)` from Task 2's test helpers.
- Produces: `ScriptBuilder.styleInjector(css:id:) throws -> String`.

- [ ] **Step 1: Write the failing ScriptBuilder tests**

`ios/UndoKit/Tests/UndoKitTests/ScriptBuilderTests.swift`:

```swift
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `swift test --package-path ios/UndoKit`
Expected: FAIL to compile with `cannot find 'ScriptBuilder' in scope`.

- [ ] **Step 3: Write ScriptBuilder**

`ios/UndoKit/Sources/UndoKit/ScriptBuilder.swift`:

```swift
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `swift test --package-path ios/UndoKit`
Expected: PASS, 17 tests.

- [ ] **Step 5: Install the stylesheet**

In `ios/Undo/WebCoordinator.swift`, replace `loadUserScripts(for:)`:

```swift
    private static func loadUserScripts(for platform: Platform) -> [WKUserScript] {
        var scripts: [WKUserScript] = []

        if let marker = EngineBundle.string("marker.js") {
            scripts.append(
                WKUserScript(source: marker, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
        }

        // At document start, so the elements it hides are never painted.
        if let css = EngineBundle.string("\(platform.engineDirectory)/hide.css"),
           let source = try? ScriptBuilder.styleInjector(css: css, id: "undo-static-hides") {
            scripts.append(
                WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
        } else {
            assertionFailure("engine/\(platform.engineDirectory)/hide.css is missing")
        }

        return scripts
    }
```

`WebCoordinator` already imports `UndoKit` from Task 4, and `start(_:)` is unchanged — the web view loads immediately, with no compile step to wait for.

- [ ] **Step 6: Build**

Run:

```bash
xcodebuild build -project ios/Undo.xcodeproj -scheme Undo \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 7: Verify on the phone, and tune the selectors**

1. Run on the device. Expected: the bottom bar shows no Reels entry, and still shows the magnifier, which opens search.
2. Watch the bar as a page loads. Expected: no flash — the Reels entry is never visible, not even for an instant. A flash means the script is running too late to matter.
3. Expected: no "open in app" banner at the top or bottom of the page.
4. For anything still visible, open Safari's Web Inspector (Develop > [iPhone] > the Instagram page), select the element, and read its `href` and `aria-label`.
5. Add a selector to `engine/instagram/hide.css` matching that `href` or `aria-label`. Class names change every few weeks, so they are not an option, and a test fails if one is used.
6. Re-run `node --test 'tests/**/*.test.js'` and `swift test --package-path ios/UndoKit` after each edit. Both read the real file, so a typo fails on the Mac.
7. Confirm the login page still works: sign out, sign in with two-factor. Expected: no hidden field, no broken button.

- [ ] **Step 8: Propose the commit, then wait**

```bash
git add engine/instagram/hide.css ios/UndoKit ios/Undo/WebCoordinator.swift
git commit -m "Hide the reels entry and install banners before the page paints

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The feed filter script

Milestone 4, first half. Inline reels, suggested posts and sponsored posts leave the home feed, and the filter follows Instagram from page to page without a reload.

The script splits in two: pure predicates that the Node tests cover completely, and a thin DOM pass under them. The file ships as a classic script with no imports, so the bytes in `Undo.app/engine/instagram/filter.js` match the bytes in the repo and the tests run those same bytes through `node:vm`.

**Files:**
- Create: `engine/instagram/filter.js`
- Create: `tests/harness.js`
- Test: `tests/filter.test.js`
- Modify: `ios/Undo/WebCoordinator.swift` (`loadUserScripts(for:)` only)

**Interfaces:**
- Consumes: `engine/instagram/feed.json` from Task 1; `EngineConfig.feedRulesJSONLiteral(_:)` from Task 2.
- Produces, on `window.UndoInstagram`:
  - `normalizePath(path) -> string`
  - `shouldFilterFeed(path) -> boolean`
  - `describeArticle(element) -> {hrefs: string[], text: string}`
  - `shouldHideArticle(descriptor, config) -> boolean`
  - `filterFeed(doc, config) -> number` (how many it hid)
  - `start(doc, config) -> {run, schedule, observer}`
- Produces, from `tests/harness.js`:
  - `loadEngineScript(relativePath, globalName)`
  - `readEngineJSON(relativePath)`
  - `fakeDocument({path, articles}) -> document stub`

- [ ] **Step 1: Write the test harness**

`tests/harness.js`:

```js
import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

function enginePath(relativePath) {
  return fileURLToPath(new URL('../engine/' + relativePath, import.meta.url));
}

/* Runs a shipped script in a sandbox and hands back the namespace it defines.
   The file is read exactly as it ships, so these tests run the same bytes the app
   injects into the page. */
export function loadEngineScript(relativePath, globalName) {
  const sandbox = {};
  createContext(sandbox);
  runInContext(readFileSync(enginePath(relativePath), 'utf8'), sandbox, {
    filename: relativePath,
  });
  return sandbox[globalName];
}

export function readEngineJSON(relativePath) {
  return JSON.parse(readFileSync(enginePath(relativePath), 'utf8'));
}

/* A document with only the surface filter.js touches. Small enough to read, which
   is the point: the parts of the filter that need a real browser are verified on
   the phone instead. */
export function fakeDocument({ path = '/', articles = [] } = {}) {
  const nodes = articles.map((article) => ({
    style: { display: article.display || '' },
    textContent: article.text || '',
    querySelectorAll: () =>
      (article.hrefs || []).map((href) => ({ getAttribute: () => href })),
  }));

  const head = {
    children: [],
    appendChild(node) {
      this.children.push(node);
    },
  };

  return {
    location: { pathname: path },
    head,
    body: null,
    articles: nodes,
    querySelector: () => ({ querySelectorAll: () => nodes }),
    getElementById(id) {
      return head.children.find((node) => node.id === id) || null;
    },
    createElement() {
      return {
        id: '',
        textContent: '',
        remove() {
          head.children = head.children.filter((node) => node !== this);
        },
      };
    },
  };
}
```

- [ ] **Step 2: Write the failing filter tests**

`tests/filter.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngineScript, readEngineJSON, fakeDocument } from './harness.js';

const filter = loadEngineScript('instagram/filter.js', 'UndoInstagram');
const config = readEngineJSON('instagram/feed.json');

test('normalizePath gives every path a trailing slash', () => {
  assert.equal(filter.normalizePath('/reel/ABC'), '/reel/ABC/');
  assert.equal(filter.normalizePath('/'), '/');
  assert.equal(filter.normalizePath(''), '/');
});

test('feed rules apply to the home feed alone', () => {
  assert.equal(filter.shouldFilterFeed('/'), true);
  assert.equal(filter.shouldFilterFeed('/direct/inbox/'), false);
  assert.equal(filter.shouldFilterFeed('/reel/ABC123/'), false);
  assert.equal(filter.shouldFilterFeed('/someone/'), false);
});

test('hides a feed item that links to a reel', () => {
  const descriptor = { hrefs: ['/someone/', '/reel/ABC123/'], text: 'a caption' };
  assert.equal(filter.shouldHideArticle(descriptor, config), true);
});

test('hides suggested and sponsored posts', () => {
  assert.equal(
    filter.shouldHideArticle({ hrefs: ['/p/XYZ/'], text: 'Suggested for you' }, config),
    true
  );
  assert.equal(
    filter.shouldHideArticle({ hrefs: ['/p/XYZ/'], text: 'Sponsored' }, config),
    true
  );
});

test('keeps an ordinary post from a followed account', () => {
  const descriptor = { hrefs: ['/someone/', '/p/XYZ789/'], text: 'nice photo' };
  assert.equal(filter.shouldHideArticle(descriptor, config), false);
});

test('filterFeed hides the right articles and counts them', () => {
  const doc = fakeDocument({
    path: '/',
    articles: [
      { hrefs: ['/p/AAA/'], text: 'a photo' },
      { hrefs: ['/reel/BBB/'], text: 'a reel' },
      { hrefs: ['/p/CCC/'], text: 'Sponsored' },
    ],
  });
  assert.equal(filter.filterFeed(doc, config), 2);
  assert.equal(doc.articles[0].style.display, '');
  assert.equal(doc.articles[1].style.display, 'none');
  assert.equal(doc.articles[2].style.display, 'none');
});

test('filterFeed leaves every other page alone', () => {
  const doc = fakeDocument({
    path: '/direct/inbox/',
    articles: [{ hrefs: ['/reel/BBB/'], text: 'a reel someone sent' }],
  });
  assert.equal(filter.filterFeed(doc, config), 0);
  assert.equal(doc.articles[0].style.display, '');
});

test('filterFeed shows an article again when a recycled node stops matching', () => {
  const doc = fakeDocument({
    path: '/',
    articles: [{ hrefs: ['/p/AAA/'], text: 'a photo', display: 'none' }],
  });
  assert.equal(filter.filterFeed(doc, config), 0);
  assert.equal(doc.articles[0].style.display, '');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `node --test 'tests/**/*.test.js'`
Expected: FAIL with `ENOENT` for `instagram/filter.js`.

- [ ] **Step 4: Write filter.js**

`engine/instagram/filter.js`:

```js
/* Undo's Instagram filter.

   Injected at document end on every page whose path is outside /accounts/.
   Everything above `start` is a pure function with no DOM in it, and those are
   what the tests in tests/ cover. The DOM pass is kept thin on purpose.

   Selectors and phrases arrive in window.UndoConfig, which the app fills from
   engine/instagram/feed.json before this file runs. */
(function (global) {
  'use strict';

  var api = {};

  api.normalizePath = function (path) {
    var p = path ? path : '/';
    return p.charAt(p.length - 1) === '/' ? p : p + '/';
  };

  /* The feed rules apply to the home feed alone. A reel link in a DM, on a
     profile or on a reel page is one the person asked to see. */
  api.shouldFilterFeed = function (path) {
    return api.normalizePath(path) === '/';
  };

  api.describeArticle = function (element) {
    var anchors = element.querySelectorAll('a[href]');
    var hrefs = [];
    for (var i = 0; i < anchors.length; i += 1) {
      hrefs.push(anchors[i].getAttribute('href') || '');
    }
    return { hrefs: hrefs, text: element.textContent || '' };
  };

  api.shouldHideArticle = function (descriptor, config) {
    var i, j;
    for (i = 0; i < descriptor.hrefs.length; i += 1) {
      for (j = 0; j < config.hideIfLinkPrefix.length; j += 1) {
        if (descriptor.hrefs[i].indexOf(config.hideIfLinkPrefix[j]) === 0) {
          return true;
        }
      }
    }
    for (i = 0; i < config.hideIfTextContains.length; i += 1) {
      if (descriptor.text.indexOf(config.hideIfTextContains[i]) !== -1) {
        return true;
      }
    }
    return false;
  };

  /* Every pass re-decides every article, because Instagram recycles feed nodes as
     you scroll and a node hidden once has to be able to come back. */
  api.filterFeed = function (doc, config) {
    if (!api.shouldFilterFeed(doc.location.pathname)) {
      return 0;
    }
    var root = doc.querySelector(config.feedRootSelector) || doc.body;
    if (!root || !root.querySelectorAll) {
      return 0;
    }
    var articles = root.querySelectorAll(config.articleSelector);
    var hidden = 0;
    for (var i = 0; i < articles.length; i += 1) {
      var article = articles[i];
      if (api.shouldHideArticle(api.describeArticle(article), config)) {
        article.style.display = 'none';
        hidden += 1;
      } else if (article.style.display === 'none') {
        article.style.display = '';
      }
    }
    return hidden;
  };

  api.start = function (doc, config) {
    var win = doc.defaultView;
    var scheduled = false;

    function run() {
      scheduled = false;
      api.filterFeed(doc, config);
    }

    function schedule() {
      if (scheduled) {
        return;
      }
      scheduled = true;
      if (win && win.requestAnimationFrame) {
        win.requestAnimationFrame(run);
      } else {
        run();
      }
    }

    run();

    var observer = new win.MutationObserver(schedule);
    observer.observe(doc.documentElement, { childList: true, subtree: true });

    /* Instagram moves between pages without reloading, so the filter follows the
       history API rather than waiting for a navigation that never comes. */
    ['pushState', 'replaceState'].forEach(function (name) {
      var original = win.history[name];
      win.history[name] = function () {
        var result = original.apply(this, arguments);
        schedule();
        return result;
      };
    });
    win.addEventListener('popstate', schedule);

    return { run: run, schedule: schedule, observer: observer };
  };

  global.UndoInstagram = api;

  if (typeof document !== 'undefined' && global.UndoConfig) {
    api.start(document, global.UndoConfig);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
```

Two choices worth keeping: the script reads `textContent` rather than `innerText`, which skips a layout pass on every article; and passes are coalesced into one per animation frame, because Instagram's feed mutates constantly while it loads.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test 'tests/**/*.test.js'`
Expected: PASS, 13 tests (5 from Task 1, 8 here).

- [ ] **Step 6: Inject the config and the filter**

In `ios/Undo/WebCoordinator.swift`, replace `loadUserScripts(for:)`:

```swift
    private static func loadUserScripts(for platform: Platform) -> [WKUserScript] {
        var scripts: [WKUserScript] = []

        if let marker = EngineBundle.string("marker.js") {
            scripts.append(
                WKUserScript(source: marker, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
        }

        // At document start, so the elements it hides are never painted.
        if let css = EngineBundle.string("\(platform.engineDirectory)/hide.css"),
           let source = try? ScriptBuilder.styleInjector(css: css, id: "undo-static-hides") {
            scripts.append(
                WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true)
            )
        } else {
            assertionFailure("engine/\(platform.engineDirectory)/hide.css is missing")
        }

        // The filter's selectors and phrases, handed over as a global. Round-tripping
        // through FeedRules means only known keys reach the page.
        if let data = EngineBundle.data("\(platform.engineDirectory)/feed.json"),
           let literal = try? EngineConfig.feedRulesJSONLiteral(data) {
            scripts.append(
                WKUserScript(
                    source: "window.UndoConfig = \(literal);",
                    injectionTime: .atDocumentStart,
                    forMainFrameOnly: true
                )
            )
        } else {
            assertionFailure("engine/\(platform.engineDirectory)/feed.json is missing or malformed")
        }

        if let filter = EngineBundle.string("\(platform.engineDirectory)/filter.js") {
            scripts.append(
                WKUserScript(source: filter, injectionTime: .atDocumentEnd, forMainFrameOnly: true)
            )
        }

        return scripts
    }
```

The config goes in at document start so `window.UndoConfig` exists by the time the filter runs at document end.

- [ ] **Step 7: Build**

Run:

```bash
xcodebuild build -project ios/Undo.xcodeproj -scheme Undo \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 8: Verify on the phone, and tune the phrases**

1. Run on the device and scroll the home feed for a minute.
2. Expected: every post is from an account you follow. No inline reels, no "Suggested for you" block, no "Sponsored" post.
3. Expected: scrolling stays smooth, and posts do not flicker in and out.
4. For anything that slips through, open Safari's Web Inspector, select the post's `article` element, and read `element.textContent` and the `href`s inside it. Add the phrase or prefix to `engine/instagram/feed.json`.
5. For a post that disappears and should not have, run `window.UndoInstagram.describeArticle(element)` in the console against it to see which rule caught it.
6. Re-run `node --test 'tests/**/*.test.js'` and `swift test --package-path ios/UndoKit` after each edit to `feed.json`.
7. Check DMs: open a thread where someone sent a reel. Expected: the thread and the reel link are untouched.

- [ ] **Step 9: Propose the commit, then wait**

```bash
git add engine ios/Undo/WebCoordinator.swift
git commit -m "Filter inline reels, suggested posts and sponsored posts from the feed

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: The single-reel scroll lock

Milestone 4, second half. A reel someone sends you opens and plays. The next one never arrives.

**Files:**
- Modify: `engine/instagram/filter.js` (add three functions, add one line to `run`)
- Modify: `tests/filter.test.js` (add four tests)

**Interfaces:**
- Consumes: `normalizePath` from Task 6.
- Produces, on `window.UndoInstagram`: `singleReelId(path) -> string | null`, `LOCK_ID`, `applyReelLock(doc) -> boolean`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/filter.test.js`:

```js
test('singleReelId reads the id out of a reel path', () => {
  assert.equal(filter.singleReelId('/reel/ABC123/'), 'ABC123');
  assert.equal(filter.singleReelId('/reel/ABC123'), 'ABC123');
  assert.equal(filter.singleReelId('/reels/'), null);
  assert.equal(filter.singleReelId('/'), null);
  assert.equal(filter.singleReelId('/direct/inbox/'), null);
});

test('applyReelLock adds the lock on a reel page, once', () => {
  const doc = fakeDocument({ path: '/reel/ABC123/' });
  assert.equal(filter.applyReelLock(doc), true);
  assert.equal(doc.head.children.length, 1);
  assert.match(doc.head.children[0].textContent, /overflow:hidden/);
  assert.equal(filter.applyReelLock(doc), true);
  assert.equal(doc.head.children.length, 1);
});

test('applyReelLock leaves other pages scrolling', () => {
  const doc = fakeDocument({ path: '/' });
  assert.equal(filter.applyReelLock(doc), false);
  assert.equal(doc.head.children.length, 0);
});

test('applyReelLock removes the lock when the page changes', () => {
  const doc = fakeDocument({ path: '/reel/ABC123/' });
  filter.applyReelLock(doc);
  doc.location.pathname = '/';
  assert.equal(filter.applyReelLock(doc), false);
  assert.equal(doc.head.children.length, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test 'tests/**/*.test.js'`
Expected: FAIL with `filter.singleReelId is not a function`.

- [ ] **Step 3: Add singleReelId**

In `engine/instagram/filter.js`, directly after `api.normalizePath`:

```js
  api.singleReelId = function (path) {
    var match = api.normalizePath(path).match(/^\/reel\/([^/]+)\//);
    return match ? match[1] : null;
  };
```

- [ ] **Step 4: Add the lock**

In `engine/instagram/filter.js`, directly after `api.filterFeed`:

```js
  api.LOCK_ID = 'undo-reel-lock';

  /* On a single reel page, the one reel in the URL plays and the page stops
     scrolling, so there is no next one. Every other page keeps its scrolling. */
  api.applyReelLock = function (doc) {
    var existing = doc.getElementById(api.LOCK_ID);
    if (!api.singleReelId(doc.location.pathname)) {
      if (existing) {
        existing.remove();
      }
      return false;
    }
    if (existing) {
      return true;
    }
    var style = doc.createElement('style');
    style.id = api.LOCK_ID;
    style.textContent =
      'html,body{overflow:hidden!important;overscroll-behavior:none!important;' +
      'touch-action:pan-x!important}';
    doc.head.appendChild(style);
    return true;
  };
```

`touch-action: pan-x` is what stops the vertical swipe that advances to the next reel; `overflow: hidden` stops the scroll; `overscroll-behavior: none` stops the pull that would load more. The lock is removed again when the path changes, because Instagram leaves a reel page without reloading.

- [ ] **Step 5: Run the lock on every pass**

In `api.start`, add the lock call to `run`:

```js
    function run() {
      scheduled = false;
      api.filterFeed(doc, config);
      api.applyReelLock(doc);
    }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test 'tests/**/*.test.js'`
Expected: PASS, 17 tests.

- [ ] **Step 7: Build**

Run:

```bash
xcodebuild build -project ios/Undo.xcodeproj -scheme Undo \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO
```

Expected: `** BUILD SUCCEEDED **`.

- [ ] **Step 8: Verify on the phone**

1. Run on the device, open a reel from a DM.
2. Expected: it plays, with sound, and the controls work.
3. Swipe up. Expected: the page does not move and no second reel appears.
4. Swipe down, and pull down hard. Expected: the same.
5. Tap back. Expected: you return to the thread, and the feed scrolls normally again.
6. Go to the home feed and scroll. Expected: scrolling works exactly as before, with no leftover lock.
7. If a swipe still advances, open the reel page in Safari's Web Inspector, find the element that scrolls (`document.scrollingElement`, or the ancestor with `overflow: scroll`), and extend the lock's CSS to name it.

- [ ] **Step 9: Run everything**

Run:

```bash
node --test 'tests/**/*.test.js'
swift test --package-path ios/UndoKit
xcodebuild build -project ios/Undo.xcodeproj -scheme Undo \
  -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO
```

Expected: 17 JavaScript tests pass, 17 Swift tests pass, `** BUILD SUCCEEDED **`.

- [ ] **Step 10: Propose the commit, then wait**

```bash
git add engine
git commit -m "Lock a single reel page to the one reel in the URL

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## When this plan is done

Milestones 0 through 4 are complete: an app on the owner's iPhone that is Instagram with the Reels feed, Explore, inline reels, suggested posts, sponsored posts and install banners gone, a reel from a DM that plays exactly once, and a filter that is provably absent from every login page.

Milestone 5 is the next plan: settings with a toggle per filter, pull to refresh, external links in `SFSafariViewController` rather than Safari, and the "what's blocked" screen.

Two things carry forward as known work rather than defects:

- **Selectors and phrases need upkeep.** `hide.css` and `feed.json` are matched against a site that changes. When something slips through, the fix is one line in one file, and both test suites read the real files so a typo fails on the Mac.
- **The explore redirect rests on one URL.** `Platform.searchURL` points at
  `https://www.instagram.com/explore/search/`. If Instagram moves search, the
  magnifier stops working and the fix is that one line.
- **The text phrases are English.** `hideIfTextContains` holds English strings, so an Instagram account set to another language hides less. Adding that language's phrases to `feed.json` is the fix, and it needs no code change.
