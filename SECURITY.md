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
