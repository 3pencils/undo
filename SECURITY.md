# Security

Undo embeds Instagram in a web view, which means Undo's own code runs on the same
pages where you type your password. That is exactly the position people are asked
to trust with apps of this kind, so Undo is built so you do not have to.

## The login-page guard

Undo installs three things into a page: a stylesheet, a page filter, and a data
filter. None of them is installed on a page whose path Undo guards. Instagram asks
for credentials on more than one path, so the guarded list covers `/accounts/`,
`/challenge/`, `/two_factor/`, `/emailsignup/`, `/recover/` and `/oauth/`. The list
lives in `engine/instagram/paths.json` and the app and the page scripts read the
same one.

The guard runs in two places, because one is not enough.

**At a page load**, in the navigation delegate, before the load begins:
`InjectionPolicy.allowsInjection(url:)` in `ios/UndoKit` decides, every installed
user script is removed, and they are re-installed only when the answer is yes. It
compares a canonical form of the path, because a server can answer to more than one
spelling of the same page: `/ACCOUNTS/login/`, `//accounts/login/` and
`/x/../accounts/login/` are all guarded. Anything that is not an ordinary web page
with a path is guarded too, so the failure mode is no injection.

**While a page is open**, inside the scripts themselves. Instagram is a
single-page app: it can route from the feed into `/accounts/` without loading a
page, and on that hop the navigation delegate never runs, so a script installed for
the earlier page is still in that document. The app cannot remove it. So both
scripts carry the same guarded list and check it themselves — the page filter does
nothing on a guarded path, and the data filter returns every payload untouched
without testing it against anything. That check is re-made on every call, so
routing back out of `/accounts/` resumes filtering.

What remains true on such a page, and what does not: Undo's code is present in the
document and will not act. It is not absent. If you want absence rather than
inaction, reach a login page by launching Undo fresh or by signing out — both are
page loads, and then nothing is installed at all.

Every spelling named above is unit-tested in
`ios/UndoKit/Tests/UndoKitTests/InjectionPolicyTests.swift`, the page filter's
guard in `tests/filter.test.js`, and the data filter's in `tests/prune.test.js`.
CI runs both suites on every commit, on every branch.

## Watching the guard work

`engine/marker.js` sets `window.__undoFilterPresent` and does nothing else. Debug
builds turn on `isInspectable`, so you can check the guard yourself:

1. Build Undo onto your iPhone from Xcode and connect it to your Mac.
2. On the Mac, open Safari > Settings > Advanced and tick **Show features for web
   developers**. That is what makes the Develop menu appear; it is not inside it.
3. On the iPhone, open Settings > Apps > Safari > Advanced and turn on **Web
   Inspector**. An app's web view is not inspectable without it.
4. Open Undo on the phone, go to the home feed, and in Safari choose
   Develop > [your iPhone] > the Instagram page.
5. In the console, type `window.__undoFilterPresent`. On the feed it is `true`.
6. Sign out, land on `/accounts/login/`, reopen the inspector, and type it again.
   It is `undefined`, because that page load installed nothing.
7. For a second, independent signal, type
   `document.getElementById('undo-static-hides')`. That is the stylesheet Undo
   installs: an element on the feed, `null` on the login page.
8. To see the other half of the guard, the half that matters on a single-page app:
   from the feed, open Settings from the profile menu, which routes to
   `/accounts/edit/` without a page load. `window.__undoFilterPresent` is still
   `true`, because the script is still in the document — and `window.__undoPruned`
   stops counting, because the data filter checks the path on every call.

Do not look for Undo in `document.querySelectorAll('script')`. Injected user
scripts are evaluated directly and never become `<script>` elements, so that list
looks identical on a filtered page and a guarded one and would tell you nothing
either way.

## What the data filter can see

Undo removes two things before Instagram draws them, by wrapping the page's own
`JSON.parse` at document start: the adverts injected into stories, and the queue of
suggested reels that opening a reel from a DM would otherwise seed. Both rules are
in `engine/instagram/prune.json` and there are only those two.

Adverts **in the feed** are not removed this way. No rule targets the timeline, so
a feed advert is drawn and then given a one-pixel hidden box by the page filter.
That is deliberate: Instagram decides when to load more posts with an
`IntersectionObserver`, and a post removed from layout is never intersected, which
stops the feed loading at all.

Wrapping `JSON.parse` is a large position to hold, so here is exactly what is done
with it, and you can read all of it in `engine/instagram/prune.js`:

- If the path is guarded, the payload is returned immediately. Nothing else happens.
- Otherwise the text is tested against each rule. A rule matches only when its
  short gate — today `injected` and `clips__discover` — appears **inside a quoted
  field name beginning `xdt_`**. A message that merely contains the word does not
  match, and is returned untouched.
- Only a payload that matched a rule is walked, and the only change made is
  shortening the array that rule names. Both rules shorten to nothing. A payload
  carrying several of those fields has each of them shortened.
- Nothing else is read, copied or kept. `window.__undoPruned` holds three numbers:
  how many payloads matched, how many arrays were shortened, and a count per rule.
  No text from any payload is stored anywhere. The per-rule count is there so a
  rule Instagram has renamed shows up as a rule that stopped firing, rather than as
  adverts quietly coming back.

The honest residue: a wrapped `JSON.parse` is *handed* the text of every payload the
page parses on an unguarded path, including Instagram's own API responses. What Undo
does with that text is the four bullets above, and there is nowhere for any of it to
go — see the next section.

If you would rather Undo did not hold that position, delete the block that installs
`prune.json` and `prune.js` in `loadUserScripts` in `ios/Undo/WebCoordinator.swift`.
The app still works. You lose the removal of story adverts and of the suggested-reel
queue — so a reel opened from a DM will scroll to the next one again, which is the
behaviour the README calls the point. Feed adverts are unaffected either way.

## What Undo sends where

Nothing. Undo has no backend, no analytics, no telemetry and no remote code. It
loads no JavaScript it did not ship with. Every filter rule is a file in
`engine/` inside the app bundle.

## Reporting an issue

Open a private report on GitHub: go to the repository, choose Security, then
**Report a vulnerability**. That reaches the maintainer without the finding becoming
public, and it needs no email address to stay working.

Tell us what you found and how to reproduce it. Please give us a chance to ship a
fix before publishing.

A `security@` address on the project's own domain will be listed here once that
domain is registered. Until then this is the only channel, because a published
address that bounces — or that reaches whoever happens to own a similar domain — is
worse than none.
