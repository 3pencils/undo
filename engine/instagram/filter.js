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

  api.start = function (doc, config) {
    var win = doc.defaultView;
    var scheduled = false;

    function run() {
      scheduled = false;
      api.filterFeed(doc, config);
      api.applyReelLock(doc);
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
