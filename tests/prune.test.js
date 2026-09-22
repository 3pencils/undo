import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadEngineScript, readEngineJSON } from './harness.js';

const prune = loadEngineScript('instagram/prune.js', 'UndoPrune');
const config = readEngineJSON('instagram/prune.json');

/* The shape Instagram delivers: the payload is wrapped in its own envelope, and
   the injected adverts sit in a field beside the real stories connection. */
function storyPayload() {
  return {
    require: [
      ['ScheduledServerJS', 'handle', null, [
        {
          __bbox: {
            result: {
              data: {
                xdt_injected_story_units: {
                  ad_media_items: [
                    { media: { id: '1', ad_id: 'aaa' } },
                    { media: { id: '2', ad_id: 'bbb' } },
                  ],
                },
                xdt_api__v1__feed__reels_media__connection: {
                  edges: [{ node: { id: 'real-story-1' } }, { node: { id: 'real-story-2' } }],
                },
              },
            },
          },
        },
      ]],
    ],
  };
}

function injectedUnits(payload) {
  return payload.require[0][3][0].__bbox.result.data.xdt_injected_story_units;
}

function realStories(payload) {
  return payload.require[0][3][0].__bbox.result.data.xdt_api__v1__feed__reels_media__connection;
}

test('empties the injected advert array wherever it is nested', () => {
  const payload = storyPayload();
  const emptied = prune.pruneArrays(payload, config.rules, config.depthLimit);
  assert.equal(emptied, 1);
  assert.deepEqual(Array.from(injectedUnits(payload).ad_media_items), []);
});

test('leaves the real stories connection completely alone', () => {
  const payload = storyPayload();
  prune.pruneArrays(payload, config.rules, config.depthLimit);
  assert.equal(realStories(payload).edges.length, 2);
  assert.equal(realStories(payload).edges[0].node.id, 'real-story-1');
});

test('keeps the container, so a missing field is not a missing object', () => {
  const payload = storyPayload();
  prune.pruneArrays(payload, config.rules, config.depthLimit);
  assert.equal(typeof injectedUnits(payload), 'object');
  assert.ok(Array.isArray(injectedUnits(payload).ad_media_items));
});

test('reports nothing pruned when there is nothing to prune', () => {
  const payload = { data: { xdt_injected_story_units: { ad_media_items: [] } } };
  assert.equal(prune.pruneArrays(payload, config.rules, config.depthLimit), 0);
});

test('finds the field by name, not by the path it arrived on', () => {
  const moved = { a: { b: { c: { xdt_injected_story_units: { ad_media_items: [{ x: 1 }] } } } } };
  assert.equal(prune.pruneArrays(moved, config.rules, config.depthLimit), 1);
  assert.deepEqual(Array.from(moved.a.b.c.xdt_injected_story_units.ad_media_items), []);
});

test('stops at the depth limit rather than walking a huge payload forever', () => {
  let deep = { xdt_injected_story_units: { ad_media_items: [{ x: 1 }] } };
  for (let i = 0; i < 40; i += 1) {
    deep = { nest: deep };
  }
  assert.equal(prune.pruneArrays(deep, config.rules, config.depthLimit), 0);
});

test('survives the shapes a real page throws at JSON.parse', () => {
  for (const value of [null, 42, 'a string', [], {}, [null, [undefined]], { a: null }]) {
    assert.equal(prune.pruneArrays(value, config.rules, config.depthLimit), 0);
  }
});

test('only walks a payload that one of the rules could match', () => {
  assert.equal(prune.isWorthWalking('{"xdt_injected_story_units":{}}', config.rules), true);
  assert.equal(
    prune.isWorthWalking('{"xdt_api__v1__clips__discover__connection_v2":{}}', config.rules),
    true
  );
  // Everything else is returned untouched and never looked at again.
  assert.equal(prune.isWorthWalking('{"comments":[{"text":"hello"}]}', config.rules), false);
  assert.equal(
    prune.isWorthWalking('{"xdt_api__v1__web__accounts__get_encrypted_credentials":{}}', config.rules),
    false
  );
  assert.equal(prune.isWorthWalking(undefined, config.rules), false);
  assert.equal(prune.isWorthWalking(null, config.rules), false);
});

test('install returns every parsed value unchanged in shape and counts its work', () => {
  const scope = { JSON: { parse: JSON.parse } };
  const counts = prune.install(scope, config);

  const untouched = scope.JSON.parse('{"comments":[{"text":"hello"}]}');
  assert.equal(untouched.comments[0].text, 'hello');
  assert.equal(counts.seen, 0, 'a payload with no injected field is not walked');

  const filtered = scope.JSON.parse(JSON.stringify(storyPayload()));
  assert.deepEqual(Array.from(injectedUnits(filtered).ad_media_items), []);
  assert.equal(realStories(filtered).edges.length, 2);
  assert.equal(counts.seen, 1);
  assert.equal(counts.pruned, 1);
});

test('install keeps JSON.parse throwing on invalid JSON, as callers expect', () => {
  const scope = { JSON: { parse: JSON.parse } };
  prune.install(scope, config);
  assert.throws(() => scope.JSON.parse('{not json'), SyntaxError);
});

test('install never lets its own failure break the page', () => {
  const scope = { JSON: { parse: JSON.parse } };
  // A rule shaped wrongly must not turn every parse on the page into a throw.
  prune.install(scope, { depthLimit: 8, rules: [null] });
  const value = scope.JSON.parse('{"xdt_injected_story_units":{"ad_media_items":[{"x":1}]}}');
  assert.equal(typeof value, 'object');
});

test('tallies every field name it sees, so a rename is visible not silent', () => {
  const seen = {};
  prune.tallyFields(
    '{"data":{"xdt_api__v1__clips__home__connection_v2":{"edges":[]},"xdt_injected_story_units":{}}}',
    seen
  );
  assert.ok(Object.keys(seen).includes('xdt_api__v1__clips__home__connection_v2'));
  assert.ok(Object.keys(seen).includes('xdt_injected_story_units'));
});

test('tallying skips a payload with no Instagram field in it', () => {
  const seen = {};
  prune.tallyFields('{"comments":[{"text":"hello"}]}', seen);
  prune.tallyFields(null, seen);
  assert.deepEqual(Object.keys(seen), []);
});

test('the tally is capped, so a hostile payload cannot grow it forever', () => {
  const seen = {};
  for (let i = 0; i < prune.FIELD_TALLY_LIMIT * 3; i += 1) {
    prune.tallyFields(`{"xdt_field_${i}":1}`, seen);
  }
  assert.equal(Object.keys(seen).length, prune.FIELD_TALLY_LIMIT);
});

test('install tallies field names even when there is nothing to prune', () => {
  const scope = { JSON: { parse: JSON.parse } };
  const counts = prune.install(scope, config);
  scope.JSON.parse('{"data":{"xdt_api__v1__feed__timeline__connection":{"edges":[]}}}');
  assert.equal(counts.pruned, 0);
  assert.ok(Object.keys(counts.fields).includes('xdt_api__v1__feed__timeline__connection'));
});

test('empties the suggested-reel queue, page by page', () => {
  const payload = {
    data: {
      xdt_api__v1__clips__discover__connection_v2: {
        edges: [
          { node: { media: { code: 'the-one-sent-to-me' } } },
          { node: { media: { code: 'suggested-1' } } },
          { node: { media: { code: 'suggested-2' } } },
          { node: { media: { code: 'suggested-3' } } },
        ],
      },
    },
  };
  assert.equal(prune.pruneArrays(payload, config.rules, config.depthLimit), 1);
  const edges = payload.data.xdt_api__v1__clips__discover__connection_v2.edges;
  // Every swipe fetches another page of this connection, so leaving even one edge
  // per page hands over one fresh reel per swipe: the queue, delivered slowly.
  assert.equal(edges.length, 0, 'nothing left to swipe to, on any page');
});

test('an already empty queue needs no work', () => {
  const payload = {
    data: { xdt_api__v1__clips__discover__connection_v2: { edges: [] } },
  };
  assert.equal(prune.pruneArrays(payload, config.rules, config.depthLimit), 0);
});

