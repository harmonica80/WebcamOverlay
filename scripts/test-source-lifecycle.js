const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { test } = require('node:test');
const code = fs.readFileSync(require('node:path').join(__dirname, '../src/overlay.js'), 'utf8');
const flush = () => new Promise(setImmediate);
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function camera() {
  const track = { readyState: 'live', stop() { this.readyState = 'ended'; },
    addEventListener(_name, callback) { this.ended = callback; } };
  return { active: true, getTracks: () => [track], getVideoTracks: () => [track], track };
}
function setup() {
  const elements = {}, requests = [], timers = [], events = {};
  const sandbox = {
    URLSearchParams, location: { search: '' }, addEventListener() {},
    document: { getElementById: id => elements[id] ??= { style: {}, getContext: () => ({}), play: async () => {} } },
    navigator: { mediaDevices: { getUserMedia: constraints => {
      const request = { ...deferred(), id: constraints.video.deviceId.exact };
      requests.push(request); return request.promise;
    } } },
    window: { desktop: {
      onSourceChanged: fn => events.source = fn,
      onVisibilityChanged: fn => events.visible = fn,
      onOptionsChanged() {}, getState: () => new Promise(() => {})
    } },
    clearTimeout: id => { if (timers[id]) timers[id].cancelled = true; },
    setTimeout: fn => { timers.push({ fn }); return timers.length - 1; },
    requestAnimationFrame() {}
  };
  vm.runInNewContext(code, sandbox);
  const select = id => events.source({ deviceId: id, name: id });
  select('old'); events.visible(true);
  return { elements, requests, timers, events, select };
}
test('late failure from removed device cannot stop replacement or retry old device', async () => {
  const h = setup(); h.select('new'); const current = camera();
  h.requests[1].resolve(current); await flush();
  h.requests[0].reject(new Error('removed')); await flush();
  assert.equal(h.timers.length, 0);
  assert.equal(current.track.readyState, 'live');
  assert.equal(h.elements.video.srcObject, current);
  assert.equal(h.elements.message.style.display, 'none');
});
test('late successful old request releases only its own stream', async () => {
  const h = setup(); h.select('new'); const current = camera(), old = camera();
  h.requests[1].resolve(current); await flush();
  h.requests[0].resolve(old); await flush();
  assert.equal(old.track.readyState, 'ended');
  assert.equal(current.track.readyState, 'live');
  assert.equal(h.elements.video.srcObject, current);
});
test('hiding while connection is pending releases late stream and can reopen', async () => {
  const h = setup(); h.events.visible(false); const old = camera();
  h.requests[0].resolve(old); await flush();
  assert.equal(old.track.readyState, 'ended');
  assert.equal(h.elements.video.srcObject, null);
  h.select('new'); h.events.visible(true);
  assert.equal(h.requests[1].id, 'new');
});
test('even an already queued retry cannot restore superseded source', async () => {
  const h = setup(); h.requests[0].reject(new Error('removed')); await flush();
  assert.equal(h.timers.length, 1);
  h.select('new'); h.timers[0].fn();
  assert.deepEqual(h.requests.map(r => r.id), ['old', 'new']);
});
test('late play rejection cannot clear replacement stream', async () => {
  const h = setup(), playback = deferred();
  h.elements.video.play = () => playback.promise;
  h.requests[0].resolve(camera()); await flush();
  h.select('new'); h.elements.video.play = async () => {};
  const current = camera(); h.requests[1].resolve(current); await flush();
  playback.reject(new Error('interrupted')); await flush();
  assert.equal(h.elements.video.srcObject, current);
  assert.equal(h.timers.length, 0);
});
test('unplugged live camera reconnects and current failures still retry', async () => {
  const h = setup(), old = camera(); h.requests[0].resolve(old); await flush();
  old.track.readyState = 'ended'; old.track.ended();
  assert.equal(h.requests[1].id, 'old');
  h.requests[1].reject(new Error('unplugged')); await flush();
  assert.equal(h.elements.message.style.display, 'grid');
  h.timers[0].fn(); assert.equal(h.requests[2].id, 'old');
  const reconnected = camera(); h.requests[2].resolve(reconnected); await flush();
  assert.equal(h.elements.video.srcObject, reconnected);
  assert.equal(h.elements.message.style.display, 'none');
});
