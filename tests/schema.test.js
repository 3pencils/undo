import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readText(relativePath) {
  return readFileSync(fileURLToPath(new URL('../engine/' + relativePath, import.meta.url)), 'utf8');
}

function readJSON(relativePath) {
  return JSON.parse(readText(relativePath));
}

function assertPathPrefix(value, label) {
  assert.equal(typeof value, 'string', `${label} is a string`);
  assert.ok(value.startsWith('/'), `${label} starts with a slash: ${value}`);
  assert.ok(value.endsWith('/'), `${label} ends with a slash: ${value}`);
}

test('paths.json lists blocked and allowed prefixes', () => {
  const paths = readJSON('instagram/paths.json');
  assert.ok(Array.isArray(paths.blocked) && paths.blocked.length > 0);
  assert.ok(Array.isArray(paths.allowed));
  assert.ok(Array.isArray(paths.guarded) && paths.guarded.length > 0);
  paths.blocked.forEach((p, i) => assertPathPrefix(p, `blocked[${i}]`));
  paths.allowed.forEach((p, i) => assertPathPrefix(p, `allowed[${i}]`));
  paths.guarded.forEach((p, i) => assertPathPrefix(p, `guarded[${i}]`));
  assert.ok(paths.guarded.includes('/accounts/'), 'login lives under /accounts/');
  assert.ok(paths.guarded.includes('/challenge/'), 'a suspicious-login checkpoint asks for credentials too');
  assert.ok(paths.blocked.includes('/reels/'));
  assert.ok(paths.blocked.includes('/explore/'));
  assert.ok(paths.allowed.includes('/reel/'));
  assert.ok(paths.allowed.includes('/explore/search/'));
});

test('paths.json never blocks a path it also guards', () => {
  const paths = readJSON('instagram/paths.json');
  for (const guarded of paths.guarded) {
    assert.ok(
      !paths.blocked.some((b) => guarded.startsWith(b)),
      `${guarded} must stay reachable: you cannot sign in to a page that will not load`
    );
  }
});

function readStylesheet(relativePath) {
  // Comments carry prose that mentions paths; the rules are what these tests judge.
  return readText(relativePath).replace(/\/\*[\s\S]*?\*\//g, '');
}

test('hide.css hides the reels entry and leaves search alone', () => {
  const rules = readStylesheet('instagram/hide.css');
  assert.ok(rules.includes('a[href="/reels/"]'), 'hides the reels link');
  assert.ok(
    !/a\[href\^="\/reels\/"\]/.test(rules),
    'a bare /reels/ prefix reaches the Original audio credit on every video post'
  );
  assert.ok(rules.includes('display: none'), 'actually hides something');
  assert.ok(
    !rules.includes('/explore/'),
    'the magnifier points at /explore/ and is the only way to reach search, so it stays visible'
  );
});

test('hide.css matches on attributes, never on class names', () => {
  const withoutAttributes = readStylesheet('instagram/hide.css').replace(/\[[^\]]*\]/g, '');
  assert.equal(
    /\.[A-Za-z_][\w-]*/.test(withoutAttributes),
    false,
    'class names on instagram.com are generated and change every few weeks'
  );
});

test('feed.json lists the feed heuristics', () => {
  const feed = readJSON('instagram/feed.json');
  for (const key of ['hideIfTextContains', 'hideIfExactText']) {
    assert.ok(Array.isArray(feed[key]) && feed[key].length > 0, `${key} is a non-empty array`);
    feed[key].forEach((v) => assert.ok(typeof v === 'string' && v.length > 0));
  }
  assert.equal(typeof feed.articleSelector, 'string');
  assert.equal(typeof feed.feedRootSelector, 'string');
  // A label is matched whole, so a short one is safe here and unsafe in the
  // substring list. Guard the distinction that keeps "Ad" from hiding "Adam".
  feed.hideIfTextContains.forEach((phrase) =>
    assert.ok(phrase.length > 8, `"${phrase}" is too short to match as a substring`)
  );
});
