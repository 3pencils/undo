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

test('keeps a video posted by someone you follow', () => {
  // Instagram puts an "Original audio" link under /reels/ on every video post,
  // so judging a post by its links hid every video in the feed.
  const descriptor = {
    text: 'livelylyrics_\nOriginal audio\na caption',
    labels: ['livelylyrics_', 'Original audio', 'Audio is muted'],
  };
  assert.equal(filter.shouldHideArticle(descriptor, config), false);
});

test('hides suggested posts by phrase and adverts by label', () => {
  assert.equal(
    filter.shouldHideArticle({ text: 'Suggested for you' }, config),
    true
  );
  assert.equal(
    filter.shouldHideArticle({ text: 'x', labels: ['Sponsored'] }, config),
    true
  );
});

test('keeps an ordinary post from a followed account', () => {
  const descriptor = { text: 'nice photo' };
  assert.equal(filter.shouldHideArticle(descriptor, config), false);
});

test('filterFeed hides the right articles and counts them', () => {
  const doc = fakeDocument({
    path: '/',
    articles: [
      { text: 'a photo from a friend', labels: ['friend'] },
      { text: 'a video from a friend', labels: ['friend', 'Original audio'] },
      { text: 'a caption', labels: ['brand', 'Ad'] },
      { text: 'Suggested for you', labels: ['stranger'] },
    ],
  });
  assert.equal(filter.filterFeed(doc, config), 2);
  assert.equal(doc.articles[0].style.visibility, '', 'a photo stays');
  assert.equal(doc.articles[1].style.visibility, '', 'a video from a followed account stays');
  assert.equal(doc.articles[2].style.visibility, 'hidden', 'an advert goes');
  assert.equal(doc.articles[3].style.visibility, 'hidden', 'a suggested post goes');
});

test('filterFeed leaves every other page alone', () => {
  const doc = fakeDocument({
    path: '/direct/inbox/',
    articles: [{ text: 'a reel someone sent' }],
  });
  assert.equal(filter.filterFeed(doc, config), 0);
  assert.equal(doc.articles[0].style.visibility, '');
});

test('filterFeed shows an article again when a recycled node stops matching', () => {
  const doc = fakeDocument({
    path: '/',
    articles: [{ text: 'a photo', hiddenAlready: true }],
  });
  assert.equal(filter.filterFeed(doc, config), 0);
  assert.equal(doc.articles[0].style.visibility, '');
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

test('hides an advert by its label, which Instagram writes as "Ad"', () => {
  const descriptor = {
    text: 'capitalone Ad Earn $250 with 360 Checking',
    labels: ['capitalone', 'Ad', '617'],
  };
  assert.equal(filter.shouldHideArticle(descriptor, config), true);
});

test('does not hide a post merely for containing the letters of a label', () => {
  // "Ad" is matched whole, so none of these are adverts.
  const captions = ['Adam at the beach', 'some advice', 'Adidas haul', 'a radio show'];
  for (const caption of captions) {
    const descriptor = {
      text: caption,
      labels: ['friend', caption, '42'],
    };
    assert.equal(
      filter.shouldHideArticle(descriptor, config),
      false,
      `"${caption}" is not an advert`
    );
  }
});

test('reads short lines as labels and leaves long ones out', () => {
  const caption = 'a caption far too long to be a label beside an account name';
  const doc = fakeDocument({
    path: '/',
    articles: [{ labels: ['Ad', 'capitalone'], text: caption }],
  });
  const described = filter.describeArticle(doc.articles[0]);
  assert.ok(described.labels.includes('Ad'), 'the advert label is a label');
  assert.ok(described.labels.includes('capitalone'), 'the account name is a label');
  assert.ok(!described.labels.includes(caption), 'a caption is not a label');
  assert.ok(described.text.includes(caption), 'but it is part of the text');
});

test('stops reading after the scan limit, however long the post is', () => {
  const lines = [];
  for (let i = 0; i < filter.LABEL_SCAN_LIMIT * 4; i += 1) {
    lines.push('line' + i);
  }
  lines.push('Ad');
  const doc = fakeDocument({ path: '/', articles: [{ labels: lines }] });
  const described = filter.describeArticle(doc.articles[0]);
  assert.equal(described.labels.length, filter.LABEL_SCAN_LIMIT);
  assert.ok(
    !described.labels.includes('Ad'),
    'a label past the limit is not read, which is the cost of a bounded scan'
  );
});

test('filterFeed hides an advert in a real-shaped feed', () => {
  const doc = fakeDocument({
    path: '/',
    articles: [
      { text: 'Adam at the beach', labels: ['friend', 'Adam at the beach'] },
      { text: 'capitalone Ad', labels: ['capitalone', 'Ad'] },
    ],
  });
  assert.equal(filter.filterFeed(doc, config), 1);
  assert.equal(doc.articles[0].style.visibility, '');
  assert.equal(doc.articles[1].style.visibility, 'hidden');
});

test('treats every guarded path as off limits, however it is spelled', () => {
  const guarded = { guardedPrefixes: ['/accounts/', '/challenge/', '/two_factor/'] };
  const offLimits = [
    '/accounts/login/',
    '/accounts/login',
    '/ACCOUNTS/login/',
    '/challenge/',
    '/two_factor/',
  ];
  for (const path of offLimits) {
    assert.equal(filter.isGuardedPath(path, guarded), true, `${path} is guarded`);
  }
  for (const path of ['/', '/direct/inbox/', '/reel/ABC123/', '/accountancy/']) {
    assert.equal(filter.isGuardedPath(path, guarded), false, `${path} is not guarded`);
  }
});

test('a missing guarded list does not accidentally guard everything', () => {
  assert.equal(filter.isGuardedPath('/', {}), false);
  assert.equal(filter.isGuardedPath('/', undefined), false);
});

test('releaseReelLock removes the lock whatever the path', () => {
  const doc = fakeDocument({ path: '/reel/ABC123/' });
  filter.applyReelLock(doc);
  assert.equal(doc.head.children.length, 1);
  doc.location.pathname = '/accounts/login/';
  filter.releaseReelLock(doc);
  assert.equal(doc.head.children.length, 0);
});

