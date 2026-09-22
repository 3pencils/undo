import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

function enginePath(relativePath) {
  return fileURLToPath(new URL('../engine/' + relativePath, import.meta.url));
}

/* Values the script returns are built inside the sandbox, so their prototypes
   are not this realm's. `assert.deepEqual` on an array it returned fails with
   "same structure but not reference-equal" — wrap it in `Array.from` first. */

/* Runs a shipped script in a sandbox and hands back the namespace it defines.
   The file is read exactly as it ships, so these tests run the same bytes the app
   injects into the page. */
export function loadEngineScript(relativePath, globalName) {
  const sandbox = {};
  createContext(sandbox);
  runInContext(readFileSync(enginePath(relativePath), 'utf8'), sandbox, {
    filename: relativePath,
  });
  return sandbox[globalName];
}

export function readEngineJSON(relativePath) {
  return JSON.parse(readFileSync(enginePath(relativePath), 'utf8'));
}

/* A document with only the surface filter.js touches. Small enough to read, which
   is the point: the parts of the filter that need a real browser are verified on
   the phone instead. */
export function fakeDocument({ path = '/', articles = [], links = [] } = {}) {
  /* filter.js reads a post through a TreeWalker over its text nodes, so the
     stub hands back one text node per line. */
  function walkerOver(lines) {
    let index = -1;
    return {
      currentNode: null,
      nextNode() {
        index += 1;
        if (index >= lines.length) {
          return null;
        }
        this.currentNode = { nodeValue: lines[index] };
        return this.currentNode;
      },
    };
  }

  const ownerDocument = { createTreeWalker: (root) => walkerOver(root.lines) };

  const nodes = articles.map((article) => ({
    style: article.hiddenAlready
      ? { visibility: 'hidden', height: '1px', overflow: 'hidden' }
      : { visibility: '', height: '', overflow: '' },
    lines: (article.labels || []).concat(article.text ? [article.text] : []),
    ownerDocument,
    querySelectorAll: () =>
      (article.hrefs || []).map((href) => ({ getAttribute: () => href })),
  }));

  const head = {
    children: [],
    appendChild(node) {
      this.children.push(node);
    },
  };

  const doc = {
    location: { pathname: path },
    head,
    body: null,
    articles: nodes,
    querySelector: () => ({ querySelectorAll: () => nodes }),
    links: (links || []).map((href) => ({
      href,
      getAttribute: function () { return this.href; },
      setAttribute: function (_, value) { this.href = value; },
    })),
    getElementById(id) {
      return head.children.find((node) => node.id === id) || null;
    },
    createElement() {
      return {
        id: '',
        textContent: '',
        remove() {
          head.children = head.children.filter((node) => node !== this);
        },
      };
    },
  };
  /* Honours the one selector filter.js asks the document for. A stub that
     returns everything regardless of selector would let a bug through that the
     real DOM would have caught. */
  doc.querySelectorAll = (selector) => {
    if (selector === 'a[href="/"], a[href^="/?"]') {
      return doc.links.filter((a) => a.href === '/' || a.href.startsWith('/?'));
    }
    return doc.links;
  };
  return doc;
}
