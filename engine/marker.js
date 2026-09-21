/* Undo injection marker.
   Setting this flag is its whole effect. Anyone can open Safari's Web Inspector
   against the running app and read window.__undoFilterPresent to see where Undo's
   scripts are installed: true on the pages Undo filters, undefined on every page
   under /accounts/. */
(function (global) {
  'use strict';
  global.__undoFilterPresent = true;
})(typeof globalThis !== 'undefined' ? globalThis : this);
