# Undo

Instagram without the distractions. Open source, no backend, runs on your phone.

Undo opens Instagram in an embedded web view and removes the parts built to keep
you scrolling: the Reels feed, Explore, suggested posts, adverts and the "open in
app" banners. Stories, search, DMs, notifications, profile and photo posting all
work as they do on instagram.com.

One deliberate difference: Undo opens your **Following** feed, in time order, rather
than the "For you" feed Instagram shows by default. The default feed injects
suggested accounts by design, and asking for Following removes them at the source
instead of filtering them out afterwards. You can still switch feeds from the
control at the top of the screen.

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
- **The filter is plain text you can read.** Every rule about *what gets removed*
  lives in `engine/` as JavaScript and JSON: which paths never load, which elements
  are hidden, which posts are filtered, which data is dropped. Those files ship into
  the app bundle unchanged, so you can extract an installed copy of Undo and diff
  `Undo.app/engine/` against this repo. Which page Undo opens, and which hosts its
  web view may reach, are in `ios/Undo/Platform.swift` — thirty lines, and the only
  behaviour not in `engine/`.
- **The filter stays off the login pages.** `SECURITY.md` describes the guard and
  how to watch it work in Safari's Web Inspector.
- **Each commit is built in public.** GitHub Actions runs both test suites and an
  unsigned device build on every commit, on every branch. Tagging each App Store
  version to its commit is the intention once there is something to release; there
  are no releases and no tags yet, so treat that as a promise rather than a fact.

## Building it

Requires Xcode 26 or newer and an iOS platform install
(`xcodebuild -downloadPlatform iOS`).

```bash
node --test 'tests/**/*.test.js'       # filter rules and logic
swift test --package-path ios/UndoKit  # policy logic
```

Neither needs Xcode signing or an Apple account. To run the app on a phone, open
`ios/Undo.xcodeproj`, and under the Undo target's Signing & Capabilities set Team to
your own Apple ID — a free one works, at the cost of a build that stops launching
after seven days. The project carries the maintainer's team, so Xcode will refuse to
sign until you change it to yours; that is one dropdown.

## Licence

MIT. See `LICENSE`.
