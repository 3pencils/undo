/* Undo's Instagram filter.

   Injected at document end on every page whose path is outside /accounts/.
   Everything above `start` is a pure function with no DOM in it, and those are
   what the tests in engine/test cover. The DOM pass is kept thin on purpose.

   Selectors and phrases arrive in window.UndoConfig, which the app fills from
   engine/instagram/feed.json before this file runs. */
(function (global) {
  'use strict';

  var api = {};

  api.normalizePath = function (path) {
    var p = path ? path : '/';
    return p.charAt(p.length - 1) === '/' ? p : p + '/';
  };

  api.singleReelId = function (path) {
    var match = api.normalizePath(path).match(/^\/reel\/([^/]+)\//);
    return match ? match[1] : null;
  };

  /* The feed rules apply to the home feed alone. A reel link in a DM, on a
     profile or on a reel page is one the person asked to see. */
  api.shouldFilterFeed = function (path) {
    return api.normalizePath(path) === '/';
  };

  /* The app withholds these scripts from a page load under a guarded path, but
     Instagram can route into one without loading a page, and on that hop the
     navigation delegate never runs. So the filter carries the same list and does
     nothing at all on a guarded path: it reads no node and touches no input. */
  api.isGuardedPath = function (path, config) {
    var prefixes = (config && config.guardedPrefixes) || [];
    var candidate = api.normalizePath(path).toLowerCase();
    for (var i = 0; i < prefixes.length; i += 1) {
      if (candidate.indexOf(prefixes[i]) === 0) {
        return true;
      }
    }
    return false;
  };

  api.LABEL_MAX_LENGTH = 24;

  /* How many text nodes to read from the top of a post. Instagram puts the
     account name and the "Ad" label first, so the labels that decide a post are
     always in the first handful of lines. Reading only those costs the same on a
     photo and on a thousand-comment thread; reading the whole post, once per
     animation frame, starves the page and the feed never renders. */
  api.LABEL_SCAN_LIMIT = 40;

  api.describeArticle = function (element) {
    /* One walk collects both: the joined lines for phrase matching, and the
       short lines on their own for whole-label matching. "Ad" is far too short
       to look for inside a post's text, which would hide anything mentioning
       Adam or advice. */
    var labels = [];
    var lines = [];
    var walker = element.ownerDocument.createTreeWalker(element, 4 /* TEXT_NODE */);
    var read = 0;
    while (read < api.LABEL_SCAN_LIMIT && walker.nextNode()) {
      read += 1;
      var value = (walker.currentNode.nodeValue || '').trim();
      if (!value) {
        continue;
      }
      lines.push(value);
      if (value.length <= api.LABEL_MAX_LENGTH) {
        labels.push(value);
      }
    }

    return { text: lines.join('\n'), labels: labels };
  };

  /* Judged by what a post says, not by the links it carries. Instagram puts an
     "Original audio" link under /reels/ on every video post, so matching links in
     the reels namespace hid every video from every account you follow. */
  api.shouldHideArticle = function (descriptor, config) {
    var i;
    for (i = 0; i < config.hideIfTextContains.length; i += 1) {
      if (descriptor.text.indexOf(config.hideIfTextContains[i]) !== -1) {
        return true;
      }
    }
    var labels = descriptor.labels || [];
    for (i = 0; i < config.hideIfExactText.length; i += 1) {
      if (labels.indexOf(config.hideIfExactText[i]) !== -1) {
        return true;
      }
    }
    return false;
  };

  /* A hidden post keeps a one-pixel box rather than being removed from layout.
     Instagram decides when to load more posts with an IntersectionObserver, and a
     post with no box is never intersected, so display:none stops the feed from
     ever loading again. Both major filter lists avoid display:none on Instagram
     for this reason. */
  api.conceal = function (element) {
    element.style.visibility = 'hidden';
    element.style.height = '1px';
    element.style.overflow = 'hidden';
  };

  api.reveal = function (element) {
    element.style.visibility = '';
    element.style.height = '';
    element.style.overflow = '';
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
        api.conceal(article);
        hidden += 1;
      } else if (article.style.visibility === 'hidden') {
        api.reveal(article);
      }
    }
    return hidden;
  };

  api.LOCK_ID = 'undo-reel-lock';

  /* On a single reel page, the one reel in the URL plays and the page stops
     scrolling, so there is no next one. Every other page keeps its scrolling. */
  api.releaseReelLock = function (doc) {
    var existing = doc.getElementById(api.LOCK_ID);
    if (existing) {
      existing.remove();
    }
  };

  api.applyReelLock = function (doc) {
    var existing = doc.getElementById(api.LOCK_ID);
    if (!api.singleReelId(doc.location.pathname)) {
      api.releaseReelLock(doc);
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

  /* The feed mutates constantly while it loads, and hiding a post mutates it
     again, so an unthrottled observer runs the filter against itself. */
  api.PASS_INTERVAL_MS = 250;

  api.start = function (doc, config) {
    var win = doc.defaultView;
    var timer = null;

    function run() {
      timer = null;
      if (api.isGuardedPath(doc.location.pathname, config)) {
        api.releaseReelLock(doc);
        return;
      }
      api.filterFeed(doc, config);
      api.applyReelLock(doc);
    }

    function schedule() {
      if (timer !== null) {
        return;
      }
      timer = win.setTimeout(run, api.PASS_INTERVAL_MS);
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
