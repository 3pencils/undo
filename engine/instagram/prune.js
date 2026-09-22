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
     match is a rule with an expiry date. */
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

  api.emptyInjectedArrays = function (value, rules, depthLimit) {
    var emptied = 0;

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
        if (Array.isArray(container[rule.emptyArray]) && container[rule.emptyArray].length > 0) {
          container[rule.emptyArray] = [];
          emptied += 1;
        }
      }
      var keys = Object.keys(node);
      for (var k = 0; k < keys.length; k += 1) {
        walk(node[keys[k]], depth + 1);
      }
    }

    walk(value, 0);
    return emptied;
  };

  /* A payload that cannot contain an injected advert is not worth walking. Gating
     on a substring keeps every other parse in the page to one indexOf, and gating
     on the substring rather than the whole field name survives a rename. */
  api.isWorthWalking = function (text, gate) {
    return typeof text === 'string' && text.indexOf(gate) !== -1;
  };

  api.install = function (scope, config) {
    var original = scope.JSON.parse;
    var rules = config.rules || [];
    var gate = config.textGate;
    var depthLimit = config.depthLimit || 8;
    var counts = { seen: 0, emptied: 0, fields: {} };

    scope.JSON.parse = function (text) {
      var parsed = original.apply(this, arguments);
      /* A throw inside JSON.parse breaks Instagram outright, on every page, so
         every failure here leaves the parsed value exactly as it arrived. */
      try {
        api.tallyFields(text, counts.fields);
        if (!api.isWorthWalking(text, gate)) {
          return parsed;
        }
        counts.seen += 1;
        counts.emptied += api.emptyInjectedArrays(parsed, rules, depthLimit);
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
