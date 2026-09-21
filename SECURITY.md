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

## What Undo sends where

Nothing. Undo has no backend, no analytics, no telemetry and no remote code. It
loads no JavaScript it did not ship with. Every filter rule is a file in
`engine/` inside the app bundle.

## Reporting an issue

Email `security@3pencils.co` with what you found and how to reproduce it. Please
give us a chance to ship a fix before publishing.
