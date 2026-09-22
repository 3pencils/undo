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
  const emptied = prune.pruneArrays(payload, prune.compileRules(config.rules), config.depthLimit);
  assert.equal(emptied, 1);
  assert.deepEqual(Array.from(injectedUnits(payload).ad_media_items), []);
});

test('leaves the real stories connection completely alone', () => {
  const payload = storyPayload();
  prune.pruneArrays(payload, prune.compileRules(config.rules), config.depthLimit);
  assert.equal(realStories(payload).edges.length, 2);
  assert.equal(realStories(payload).edges[0].node.id, 'real-story-1');
});

test('keeps the container, so a missing field is not a missing object', () => {
  const payload = storyPayload();
  prune.pruneArrays(payload, prune.compileRules(config.rules), config.depthLimit);
  assert.equal(typeof injectedUnits(payload), 'object');
  assert.ok(Array.isArray(injectedUnits(payload).ad_media_items));
});

test('reports nothing pruned when there is nothing to prune', () => {
  const payload = { data: { xdt_injected_story_units: { ad_media_items: [] } } };
  assert.equal(prune.pruneArrays(payload, prune.compileRules(config.rules), config.depthLimit), 0);
});

test('finds the field by name, not by the path it arrived on', () => {
  const moved = { a: { b: { c: { xdt_injected_story_units: { ad_media_items: [{ x: 1 }] } } } } };
  assert.equal(prune.pruneArrays(moved, prune.compileRules(config.rules), config.depthLimit), 1);
  assert.deepEqual(Array.from(moved.a.b.c.xdt_injected_story_units.ad_media_items), []);
});

test('stops at the depth limit rather than walking a huge payload forever', () => {
  let deep = { xdt_injected_story_units: { ad_media_items: [{ x: 1 }] } };
  for (let i = 0; i < 40; i += 1) {
    deep = { nest: deep };
  }
  assert.equal(prune.pruneArrays(deep, prune.compileRules(config.rules), config.depthLimit), 0);
});

test('survives the shapes a real page throws at JSON.parse', () => {
  for (const value of [null, 42, 'a string', [], {}, [null, [undefined]], { a: null }]) {
    assert.equal(prune.pruneArrays(value, prune.compileRules(config.rules), config.depthLimit), 0);
  }
});

test('matches only the payloads a rule is actually about', () => {
  const compiled = prune.compileRules(config.rules);
  const matches = (text) => prune.matchingRules(text, compiled).length;

  assert.equal(matches('{"xdt_injected_story_units":{}}'), 1);
  assert.equal(matches('{"xdt_api__v1__clips__discover__connection_v2":{}}'), 1);

  // Everything else is returned untouched and never looked at again.
  assert.equal(matches('{"comments":[{"text":"hello"}]}'), 0);
  assert.equal(matches('{"xdt_api__v1__web__accounts__get_encrypted_credentials":{}}'), 0);
  assert.equal(matches(undefined), 0);
  assert.equal(matches(null), 0);

  // A gate is only a gate inside a field name. Someone writing the word in a
  // message must not get their conversation walked.
  assert.equal(matches('{"items":[{"text":"the dentist injected something"}]}'), 0);
  assert.equal(matches('{"items":[{"text":"look at this clips__discover thing"}]}'), 0);
});

test('never touches a payload parsed on a guarded path', () => {
  const scope = {
    JSON: { parse: JSON.parse },
    location: { pathname: '/accounts/login/' },
  };
  const counts = prune.install(scope, { ...config, guardedPrefixes: ['/accounts/'] });
  const payload = scope.JSON.parse(JSON.stringify(storyPayload()));
  assert.equal(injectedUnits(payload).ad_media_items.length, 2, 'left exactly as it arrived');
  assert.equal(counts.matched, 0, 'and not even tested against the rules');
});

test('resumes when the page routes back off a guarded path', () => {
  const scope = {
    JSON: { parse: JSON.parse },
    location: { pathname: '/accounts/login/' },
  };
  prune.install(scope, { ...config, guardedPrefixes: ['/accounts/'] });
  scope.JSON.parse(JSON.stringify(storyPayload()));
  scope.location.pathname = '/';
  const payload = scope.JSON.parse(JSON.stringify(storyPayload()));
  assert.equal(injectedUnits(payload).ad_media_items.length, 0, 'filtering again');
});

test('counts which rule fired, so a rename shows up as a rule that stopped', () => {
  const scope = { JSON: { parse: JSON.parse }, location: { pathname: '/' } };
  const counts = prune.install(scope, { ...config, guardedPrefixes: [] });
  scope.JSON.parse(JSON.stringify(storyPayload()));
  assert.equal(counts.hits.xdt_injected_story_units, 1);
  assert.equal(counts.pruned, 1);
});

test('install returns every parsed value unchanged in shape and counts its work', () => {
  const scope = { JSON: { parse: JSON.parse }, location: { pathname: '/' } };
  const counts = prune.install(scope, config);

  const untouched = scope.JSON.parse('{"comments":[{"text":"hello"}]}');
  assert.equal(untouched.comments[0].text, 'hello');
  assert.equal(counts.matched, 0, 'a payload no rule is about is not walked');

  const filtered = scope.JSON.parse(JSON.stringify(storyPayload()));
  assert.deepEqual(Array.from(injectedUnits(filtered).ad_media_items), []);
  assert.equal(realStories(filtered).edges.length, 2);
  assert.equal(counts.matched, 1);
  assert.equal(counts.pruned, 1);
});

test('install keeps JSON.parse throwing on invalid JSON, as callers expect', () => {
  const scope = { JSON: { parse: JSON.parse }, location: { pathname: '/' } };
  prune.install(scope, config);
  assert.throws(() => scope.JSON.parse('{not json'), SyntaxError);
});

test('install never lets its own failure break the page', () => {
  const scope = { JSON: { parse: JSON.parse }, location: { pathname: '/' } };
  // A rule shaped wrongly must not turn every parse on the page into a throw.
  prune.install(scope, { depthLimit: 8, rules: [null] });
  const value = scope.JSON.parse('{"xdt_injected_story_units":{"ad_media_items":[{"x":1}]}}');
  assert.equal(typeof value, 'object');
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
  assert.equal(prune.pruneArrays(payload, prune.compileRules(config.rules), config.depthLimit), 1);
  const edges = payload.data.xdt_api__v1__clips__discover__connection_v2.edges;
  // Every swipe fetches another page of this connection, so leaving even one edge
  // per page hands over one fresh reel per swipe: the queue, delivered slowly.
  assert.equal(edges.length, 0, 'nothing left to swipe to, on any page');
});

test('an already empty queue needs no work', () => {
  const payload = {
    data: { xdt_api__v1__clips__discover__connection_v2: { edges: [] } },
  };
  assert.equal(prune.pruneArrays(payload, prune.compileRules(config.rules), config.depthLimit), 0);
});

