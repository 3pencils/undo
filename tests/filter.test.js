import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngineScript, readEngineJSON, fakeDocument } from './harness.js';

const filter = loadEngineScript('instagram/filter.js', 'UndoInstagram');
const config = readEngineJSON('instagram/feed.json');

test('normalizePath gives every path a trailing slash', () => {
  assert.equal(filter.normalizePath('/reel/ABC'), '/reel/ABC/');
  assert.equal(filter.normalizePath('/'), '/');
  assert.equal(filter.normalizePath(''), '/');
});

test('feed rules apply to the home feed alone', () => {
  assert.equal(filter.shouldFilterFeed('/'), true);
  assert.equal(filter.shouldFilterFeed('/direct/inbox/'), false);
  assert.equal(filter.shouldFilterFeed('/reel/ABC123/'), false);
  assert.equal(filter.shouldFilterFeed('/someone/'), false);
});

test('hides a feed item that links to a reel', () => {
  const descriptor = { hrefs: ['/someone/', '/reel/ABC123/'], text: 'a caption' };
  assert.equal(filter.shouldHideArticle(descriptor, config), true);
});

test('hides suggested and sponsored posts', () => {
  assert.equal(
    filter.shouldHideArticle({ hrefs: ['/p/XYZ/'], text: 'Suggested for you' }, config),
    true
  );
  assert.equal(
    filter.shouldHideArticle({ hrefs: ['/p/XYZ/'], text: 'Sponsored' }, config),
    true
  );
});

test('keeps an ordinary post from a followed account', () => {
  const descriptor = { hrefs: ['/someone/', '/p/XYZ789/'], text: 'nice photo' };
  assert.equal(filter.shouldHideArticle(descriptor, config), false);
});

test('filterFeed hides the right articles and counts them', () => {
  const doc = fakeDocument({
    path: '/',
    articles: [
      { hrefs: ['/p/AAA/'], text: 'a photo' },
      { hrefs: ['/reel/BBB/'], text: 'a reel' },
      { hrefs: ['/p/CCC/'], text: 'Sponsored' },
    ],
  });
  assert.equal(filter.filterFeed(doc, config), 2);
  assert.equal(doc.articles[0].style.display, '');
  assert.equal(doc.articles[1].style.display, 'none');
  assert.equal(doc.articles[2].style.display, 'none');
});

test('filterFeed leaves every other page alone', () => {
  const doc = fakeDocument({
    path: '/direct/inbox/',
    articles: [{ hrefs: ['/reel/BBB/'], text: 'a reel someone sent' }],
  });
  assert.equal(filter.filterFeed(doc, config), 0);
  assert.equal(doc.articles[0].style.display, '');
});

test('filterFeed shows an article again when a recycled node stops matching', () => {
  const doc = fakeDocument({
    path: '/',
    articles: [{ hrefs: ['/p/AAA/'], text: 'a photo', display: 'none' }],
  });
  assert.equal(filter.filterFeed(doc, config), 0);
  assert.equal(doc.articles[0].style.display, '');
});

test('singleReelId reads the id out of a reel path', () => {
  assert.equal(filter.singleReelId('/reel/ABC123/'), 'ABC123');
  assert.equal(filter.singleReelId('/reel/ABC123'), 'ABC123');
  assert.equal(filter.singleReelId('/reels/'), null);
  assert.equal(filter.singleReelId('/'), null);
  assert.equal(filter.singleReelId('/direct/inbox/'), null);
});

test('applyReelLock adds the lock on a reel page, once', () => {
  const doc = fakeDocument({ path: '/reel/ABC123/' });
  assert.equal(filter.applyReelLock(doc), true);
  assert.equal(doc.head.children.length, 1);
  assert.match(doc.head.children[0].textContent, /overflow:hidden/);
  assert.equal(filter.applyReelLock(doc), true);
  assert.equal(doc.head.children.length, 1);
});

test('applyReelLock leaves other pages scrolling', () => {
  const doc = fakeDocument({ path: '/' });
  assert.equal(filter.applyReelLock(doc), false);
  assert.equal(doc.head.children.length, 0);
});

test('applyReelLock removes the lock when the page changes', () => {
  const doc = fakeDocument({ path: '/reel/ABC123/' });
  filter.applyReelLock(doc);
  doc.location.pathname = '/';
  assert.equal(filter.applyReelLock(doc), false);
  assert.equal(doc.head.children.length, 0);
});
