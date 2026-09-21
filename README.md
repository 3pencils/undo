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
node --test 'engine/**/*.test.js'     # filter rules and logic
swift test --package-path ios/UndoKit  # policy logic
open ios/Undo.xcodeproj                # then run on your iPhone
```

## Licence

MIT. See `LICENSE`.
