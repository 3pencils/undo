# Security

Undo embeds Instagram in a web view, which means Undo's own code runs on the same
pages where you type your password. That is exactly the position people are asked
to trust with apps of this kind, so Undo is built so you do not have to.

## The login-page guard

Undo's filter script is installed only when the URL path is outside `/accounts/`.
Instagram serves login, two-factor and password recovery from `/accounts/`, so a
page load that lands on one of them carries no Undo code.

The guard runs in the navigation delegate, before each page load begins:
`InjectionPolicy.allowsInjection(url:)` in `ios/UndoKit` decides, all installed
user scripts are removed, and they are re-installed only when the answer is yes.
It compares a canonical form of the path, because a server can answer to more than
one spelling of the same page: `/ACCOUNTS/login/`, `//accounts/login/` and
`/x/../accounts/login/` are all guarded. Anything that is not an ordinary web page
with a path is guarded too, so the failure mode is no injection. Every one of those
spellings is unit-tested in
`ios/UndoKit/Tests/UndoKitTests/InjectionPolicyTests.swift`, and those tests run in
CI on every commit.

One limit, stated plainly because this page is the reason to trust the app.
Instagram is a single-page app, so it can move between pages without a page load.
If it routes from a page Undo has filtered into one under `/accounts/` that way,
the script installed for the earlier page is still running in that document —
the guard governs what gets installed at a page load, and cannot remove code from
a document already open. What that code does there is nothing: the feed filter
returns immediately for any path that is not the home feed, and the app has no
message handler, no `evaluateJavaScript` call and no network code of its own, so
nothing a script could observe has anywhere to go. If you would rather not rely on
that reasoning, reach a login page by launching Undo fresh or by signing out, which
are page loads, and the guard applies in full.

## Watching the guard work

`engine/marker.js` sets `window.__undoFilterPresent` and does nothing else. Debug
builds turn on `isInspectable`, so you can check the guard yourself:

1. Build Undo onto your iPhone from Xcode and connect it to your Mac.
2. In Safari on the Mac, enable Develop > Show features for web developers.
3. Open Undo on the phone, go to the home feed, and in Safari choose
   Develop > [your iPhone] > the Instagram page.
4. In the console, type `window.__undoFilterPresent`. On the feed it is `true`.
5. Sign out, land on `/accounts/login/`, reopen the inspector, and type it again.
   It is `undefined`.
6. For a second, independent signal, type
   `document.getElementById('undo-static-hides')`. That is the stylesheet Undo
   installs: an element on the feed, `null` on the login page.

Do not look for Undo in `document.querySelectorAll('script')`. Injected user
scripts are evaluated directly and never become `<script>` elements, so that list
looks identical on a filtered page and a guarded one and would tell you nothing
either way.

## What the data filter can see

Undo removes adverts before Instagram draws them, by wrapping the page's own
`JSON.parse` at document start. That is the honest cost of the approach, so here
it is stated plainly rather than left for you to find:

**Wrapping `JSON.parse` means Undo's code is handed the text of every JSON payload
the page parses** — not only the ones carrying adverts. On an ordinary feed load
that includes Instagram's own API responses. One of them is literally named
`xdt_api__v1__web__accounts__get_encrypted_credentials`.

What Undo does with that text is deliberately almost nothing, and you can read all
of it in `engine/instagram/prune.js`:

- It tests the text for the short substring each filter rule declares — today
  `injected` and `clips__discover`. If none is present the payload is returned
  untouched and nothing else is ever done with it. That is every payload except the
  two kinds that carry adverts and the suggested-reel queue.
- It runs one regular expression over at most the first 8 KB, which matches field
  *names* of the form `"xdt_…"` and captures nothing else. Values cannot be
  extracted by it. The names are counted so a debug build can notice when
  Instagram renames a field and a filter silently stops working.
- Only a payload that passed that test is walked, and the only change it makes is
  shortening one array: to nothing for adverts, and to its first item for the reel
  queue, which leaves the reel someone sent you and drops the queue behind it.

It never copies a value, never stores a payload, and there is nowhere for anything
to go: see the section below. And it never runs at all on a guarded path, because
the scripts are not installed there.

If you would rather Undo did not hold that position, the filter still works without
it: remove `prune.json` and `prune.js` from `loadUserScripts` in
`ios/Undo/WebCoordinator.swift`. You lose the removal of story adverts, and feed
adverts go back to being hidden after they are drawn rather than never drawn.

## What Undo sends where

Nothing. Undo has no backend, no analytics, no telemetry and no remote code. It
loads no JavaScript it did not ship with. Every filter rule is a file in
`engine/` inside the app bundle.

## Reporting an issue

Email `security@3pencils.co` with what you found and how to reproduce it. Please
give us a chance to ship a fix before publishing.
