/* Undo's data filter for Instagram.

   Installed at document start, before any of Instagram's own code runs, on every
   page whose path is outside the guarded list. It wraps the page's JSON.parse and
   empties the fields that carry injected adverts, so Instagram's own renderer
   draws a screen that never contained one.

   This is the cheapest layer in the app. A post that never reaches the renderer is
   never drawn, never recycled, and never has to be re-decided on every mutation —
   which is the entire class of problem the DOM pass in filter.js has to live with.

   Everything above `install` is a pure function over parsed data, and those are
   what the tests cover. Rules arrive in window.UndoPrune, which the app fills from
   engine/instagram/prune.json. */
(function (global) {
  'use strict';

  var api = {};

  /* Fields are found by key name at any depth, never by a fixed path. Meta rotates
     the envelope around these fields while the field itself stays put, so a path
     match is a rule with an expiry date.
​
     A rule truncates an array to its first `keep` items. `keep: 0` empties it,
     which is what an advert field wants. `keep: 1` leaves the item that was asked
     for and drops the queue behind it, which is what a reel shared in a DM wants:
     it plays, and there is nothing to swipe to. */
  api.FIELD_TALLY_LIMIT = 40;

  /* How much of a payload to read when tallying field names. A connection name
     appears in the envelope, near the front, so a window costs the same on a
     small response and on a feed page. */
  api.FIELD_SCAN_WINDOW = 8192;

  /* Which of Instagram's own field names went past, read off the raw text rather
     than by walking. Every rule in this file fails silently when Meta renames a
     field, and a tally is the only way to tell a rule that found nothing from a
     rule that can no longer match anything. It also names the connection behind a
     surface we have not filtered yet. Local counters, read by debug builds;
     nothing is sent anywhere. */
  api.tallyFields = function (text, seen) {
    if (typeof text !== 'string' || text.indexOf('xdt_') === -1) {
      return;
    }
    var window = text.length > api.FIELD_SCAN_WINDOW
      ? text.slice(0, api.FIELD_SCAN_WINDOW)
      : text;
    var pattern = /"(xdt_[A-Za-z0-9_]+)"/g;
    var match = pattern.exec(window);
    while (match !== null) {
      var name = match[1];
      if (seen[name] !== undefined || Object.keys(seen).length < api.FIELD_TALLY_LIMIT) {
        seen[name] = (seen[name] || 0) + 1;
      }
      match = pattern.exec(window);
    }
  };

  api.pruneArrays = function (value, rules, depthLimit) {
    var pruned = 0;

    function walk(node, depth) {
      if (depth > depthLimit || node === null || typeof node !== 'object') {
        return;
      }
      if (Array.isArray(node)) {
        for (var i = 0; i < node.length; i += 1) {
          walk(node[i], depth + 1);
        }
        return;
      }
      for (var r = 0; r < rules.length; r += 1) {
        var rule = rules[r];
        if (!rule || !Object.prototype.hasOwnProperty.call(node, rule.container)) {
          continue;
        }
        var container = node[rule.container];
        if (container === null || typeof container !== 'object') {
          continue;
        }
        var keep = rule.keep || 0;
        var array = container[rule.array];
        if (Array.isArray(array) && array.length > keep) {
          container[rule.array] = array.slice(0, keep);
          pruned += 1;
        }
      }
      var keys = Object.keys(node);
      for (var k = 0; k < keys.length; k += 1) {
        walk(node[keys[k]], depth + 1);
      }
    }

    walk(value, 0);
    return pruned;
  };

  /* A payload that cannot match any rule is never walked, and never looked at
     beyond this test. Each rule declares the substring worth looking for, which
     keeps every other parse in the page to a handful of indexOf calls, and keeps
     the set of payloads this file inspects as small as the rules require.

     The gate is a substring rather than a whole field name on purpose: Meta
     renames the envelope around a field more often than the field, so
     "clips__discover" survives a rename that "xdt_api__v1__clips__discover…"
     would not. */
  api.isWorthWalking = function (text, rules) {
    if (typeof text !== 'string') {
      return false;
    }
    for (var i = 0; i < rules.length; i += 1) {
      if (rules[i] && text.indexOf(rules[i].gate) !== -1) {
        return true;
      }
    }
    return false;
  };

  api.install = function (scope, config) {
    var original = scope.JSON.parse;
    var rules = config.rules || [];
    var depthLimit = config.depthLimit || 8;
    var counts = { seen: 0, pruned: 0, fields: {} };

    scope.JSON.parse = function (text) {
      var parsed = original.apply(this, arguments);
      /* A throw inside JSON.parse breaks Instagram outright, on every page, so
         every failure here leaves the parsed value exactly as it arrived. */
      try {
        api.tallyFields(text, counts.fields);
        if (!api.isWorthWalking(text, rules)) {
          return parsed;
        }
        counts.seen += 1;
        counts.pruned += api.pruneArrays(parsed, rules, depthLimit);
      } catch (error) {
        return parsed;
      }
      return parsed;
    };

    return counts;
  };

  global.UndoPrune = api;

  if (typeof document !== 'undefined' && global.UndoPruneConfig) {
    global.__undoPruned = api.install(global, global.UndoPruneConfig);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
