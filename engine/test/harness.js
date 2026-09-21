import { readFileSync } from 'node:fs';
import { createContext, runInContext } from 'node:vm';
import { fileURLToPath } from 'node:url';

function enginePath(relativePath) {
  return fileURLToPath(new URL('../' + relativePath, import.meta.url));
}

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
export function fakeDocument({ path = '/', articles = [] } = {}) {
  const nodes = articles.map((article) => ({
    style: { display: article.display || '' },
    textContent: article.text || '',
    querySelectorAll: () =>
      (article.hrefs || []).map((href) => ({ getAttribute: () => href })),
  }));

  const head = {
    children: [],
    appendChild(node) {
      this.children.push(node);
    },
  };

  return {
    location: { pathname: path },
    head,
    body: null,
    articles: nodes,
    querySelector: () => ({ querySelectorAll: () => nodes }),
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
}
