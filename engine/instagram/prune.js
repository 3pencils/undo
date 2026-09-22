/* Undo's data filter for Instagram.

   Installed at document start, before any of Instagram's own code runs, on every
   page whose path is outside the guarded list. It wraps the page's JSON.parse and
   empties the arrays that carry injected adverts and the suggested-reel queue, so
   Instagram's own renderer draws a screen that never contained them.

   This is the cheapest layer in the app. An item that never reaches the renderer is
   never drawn, never recycled, and never has to be re-decided on every mutation.

   Two properties this file is built around, both of them promises SECURITY.md makes
   to the reader:

   It looks at as little as possible. A payload is tested against each rule's gate,
   and a payload that matches none is returned without anything else being done with
   it — no scan, no walk, no counting.

   It stops on a guarded path. The app withholds these scripts from a page load
   under a guarded path, but Instagram can route into one without loading a page, and
   the wrapper installed for the previous page would otherwise still be the
   document's JSON.parse. So the path is re-checked on every call.

   Rules arrive in window.UndoPruneConfig, which the app fills from prune.json. */
(function (global) {
  'use strict';

  var api = {};

  api.normalizePath = function (path) {
    var p = path ? path : '/';
    return p.charAt(p.length - 1) === '/' ? p : p + '/';
  };

  api.isGuardedPath = function (path, guardedPrefixes) {
    var prefixes = guardedPrefixes || [];
    var candidate = api.normalizePath(path).toLowerCase();
    for (var i = 0; i < prefixes.length; i += 1) {
      if (candidate.indexOf(prefixes[i]) === 0) {
        return true;
      }
    }
    return false;
  };

  /* A rule matches a payload only when its gate appears inside a quoted field name
     beginning `xdt_`. Testing for the bare word would match a payload that merely
     contains it — a message reading "the dentist injected something" would be walked
     — which is both wasteful and more than the reader was promised. The name around
     the gate stays loose, because Meta renames the envelope more often than the
     field. */
  api.gatePattern = function (gate) {
    return new RegExp('"xdt_[A-Za-z0-9_]*' + gate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  };

  api.compileRules = function (rules) {
    var compiled = [];
    for (var i = 0; i < rules.length; i += 1) {
      if (rules[i] && rules[i].container && rules[i].array && rules[i].gate) {
        compiled.push({
          container: rules[i].container,
          array: rules[i].array,
          keep: rules[i].keep || 0,
          pattern: api.gatePattern(rules[i].gate),
        });
      }
    }
    return compiled;
  };

  api.matchingRules = function (text, compiled) {
    if (typeof text !== 'string') {
      return [];
    }
    var matched = [];
    for (var i = 0; i < compiled.length; i += 1) {
      if (compiled[i].pattern.test(text)) {
        matched.push(compiled[i]);
      }
    }
    return matched;
  };

  /* Fields are found by key name at any depth, never by a fixed path: Meta rotates
     the envelope around a field while the field itself stays put, so a path match is
     a rule with an expiry date.

     This mutates the parsed object it is handed. That is the mechanism — the object
     is the one Instagram is about to render. */
  api.pruneArrays = function (value, rules, depthLimit, hits) {
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
        if (!Object.prototype.hasOwnProperty.call(node, rule.container)) {
          continue;
        }
        var container = node[rule.container];
        if (container === null || typeof container !== 'object') {
          continue;
        }
        var array = container[rule.array];
        if (Array.isArray(array) && array.length > rule.keep) {
          container[rule.array] = array.slice(0, rule.keep);
          pruned += 1;
          if (hits) {
            hits[rule.container] = (hits[rule.container] || 0) + 1;
          }
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

  api.install = function (scope, config) {
    var original = scope.JSON.parse;
    var compiled = api.compileRules(config.rules || []);
    var guardedPrefixes = config.guardedPrefixes || [];
    var depthLimit = config.depthLimit || 8;

    /* Counts, and nothing lifted out of a payload. A rule that stops firing is a
       rule Instagram has renamed, and these are how that becomes visible rather
       than silent. */
    var counts = { matched: 0, pruned: 0, hits: {} };

    scope.JSON.parse = function (text) {
      var parsed = original.apply(this, arguments);
      /* A throw inside JSON.parse breaks Instagram outright, on every page, so
         every failure here leaves the parsed value exactly as it arrived. */
      try {
        var location = scope.location;
        if (location && api.isGuardedPath(location.pathname, guardedPrefixes)) {
          return parsed;
        }
        var rules = api.matchingRules(text, compiled);
        if (rules.length === 0) {
          return parsed;
        }
        counts.matched += 1;
        counts.pruned += api.pruneArrays(parsed, rules, depthLimit, counts.hits);
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
