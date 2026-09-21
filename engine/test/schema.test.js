import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

function readText(relativePath) {
  return readFileSync(fileURLToPath(new URL('../' + relativePath, import.meta.url)), 'utf8');
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
  paths.blocked.forEach((p, i) => assertPathPrefix(p, `blocked[${i}]`));
  paths.allowed.forEach((p, i) => assertPathPrefix(p, `allowed[${i}]`));
  assert.ok(paths.blocked.includes('/reels/'));
  assert.ok(paths.blocked.includes('/explore/'));
  assert.ok(paths.allowed.includes('/reel/'));
  assert.ok(paths.allowed.includes('/explore/search/'));
});

test('paths.json leaves the login path alone', () => {
  const paths = readJSON('instagram/paths.json');
  assert.ok(!paths.blocked.some((p) => '/accounts/'.startsWith(p)));
});

function readStylesheet(relativePath) {
  // Comments carry prose that mentions paths; the rules are what these tests judge.
  return readText(relativePath).replace(/\/\*[\s\S]*?\*\//g, '');
}

test('hide.css hides the reels entry and leaves search alone', () => {
  const rules = readStylesheet('instagram/hide.css');
  assert.ok(rules.includes('a[href="/reels/"]'), 'hides the reels link');
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
  for (const key of ['hideIfLinkPrefix', 'hideIfTextContains']) {
    assert.ok(Array.isArray(feed[key]) && feed[key].length > 0, `${key} is a non-empty array`);
    feed[key].forEach((v) => assert.ok(typeof v === 'string' && v.length > 0));
  }
  assert.equal(typeof feed.articleSelector, 'string');
  assert.equal(typeof feed.feedRootSelector, 'string');
  feed.hideIfLinkPrefix.forEach((p, i) => assertPathPrefix(p, `hideIfLinkPrefix[${i}]`));
});
