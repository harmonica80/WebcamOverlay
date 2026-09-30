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
  const elements = {}, requests = [], timers = [], events = {}, models = [], advanced = [];
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
      onOptionsChanged: fn => events.options = fn, getState: () => new Promise(() => {})
    } },
    clearTimeout: id => { if (timers[id]) timers[id].cancelled = true; },
    setTimeout: fn => { timers.push({ fn }); return timers.length - 1; },
    requestAnimationFrame() {},
    console: { warn() {} },
    PPMatting: class {
      constructor(){this.jobs=[];advanced.push(this);}
      send(){const job=deferred();this.jobs.push(job);return job.promise;}
      async close(){this.closed=true;}
    },
    SelfieSegmentation: class {
      constructor(){this.jobs=[];this.selected=[];models.push(this);}
      onResults(fn){this.result=fn;}
      setOptions(opts){this.selected.push(opts.modelSelection);}
      send(){const job=deferred();this.jobs.push(job);return job.promise;}
    }
  };
  vm.runInNewContext(code, sandbox);
  const select = id => events.source({ deviceId: id, name: id });
  select('old'); events.visible(true);
  return { elements, requests, timers, events, select, models, advanced, sandbox };
}

test('advanced result cannot draw after source replacement', async () => {
  const h=setup();let draws=0;h.sandbox.capture=()=>draws++;
  vm.runInNewContext('drawResult = capture',h.sandbox);
  h.requests[0].resolve(camera());await flush();
  h.events.options({video:{background:'remove',matteQuality:'advanced'}});await flush();
  h.select('new');h.requests[1].resolve(camera());await flush();
  h.advanced[0].jobs[0].resolve({advanced:true});await flush();
  assert.equal(draws,0);
  assert.equal(h.advanced.length,1);
  h.timers.filter(t=>!t.cancelled).at(-1).fn();await flush();
  h.advanced[0].jobs[1].resolve({advanced:true});await flush();
  assert.equal(draws,1);
});

test('advanced failure falls back once and mode change permits retry', async () => {
  const h=setup();h.requests[0].resolve(camera());await flush();
  h.events.options({video:{background:'remove',matteQuality:'advanced'}});await flush();
  h.advanced[0].jobs[0].reject(Error('GPU lost'));await flush();
  assert.equal(h.advanced[0].closed,true);
  assert.equal(h.models[0].jobs.length,1);
  assert.equal(vm.runInNewContext('advancedFailed',h.sandbox),true);
  h.models[0].jobs[0].resolve();await flush();
  h.events.options({video:{background:'original',matteQuality:'advanced'}});
  h.events.options({video:{background:'remove',matteQuality:'advanced'}});await flush();
  assert.equal(h.advanced.length,2);
});
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
test('model changes wait for in-flight inference and discard its obsolete result', async()=>{
  const h=setup();h.requests[0].resolve(camera());await flush();
  vm.runInNewContext('drawResult = () => { globalThis.drawCount = (globalThis.drawCount || 0) + 1; };',h.sandbox);
  h.events.options({video:{background:'remove',matteQuality:'fast'}});await flush();
  const model=h.models[0];assert.equal(model.jobs.length,1);
  h.events.options({video:{background:'remove',matteQuality:'quality'}});
  model.result({});assert.equal(h.sandbox.drawCount,undefined);
  assert.equal(model.jobs.length,1);
  model.jobs[0].resolve();await flush();h.timers.at(-1).fn();await flush();
  assert.deepEqual(model.selected,[1,0]);model.result({});assert.equal(h.sandbox.drawCount,1);
  h.events.visible(false);model.jobs[1].resolve();await flush();
});
test('hide/reopen during inference never starts concurrent model sends',async()=>{
  const h=setup();h.requests[0].resolve(camera());await flush();
  h.events.options({video:{background:'remove',matteQuality:'quality'}});await flush();
  const model=h.models[0];h.events.visible(false);h.events.visible(true);
  h.requests[1].resolve(camera());await flush();assert.equal(model.jobs.length,1);
  model.jobs[0].resolve();await flush();h.timers.at(-1).fn();await flush();assert.equal(model.jobs.length,2);
  h.events.visible(false);model.jobs[1].resolve();await flush();
});
test('original background recovers from segmentation failure without covering the video',async()=>{
  const h=setup();h.requests[0].resolve(camera());await flush();
  h.events.options({video:{background:'remove',matteQuality:'quality'}});await flush();
  h.models[0].jobs[0].reject(Error('model failed'));await flush();
  assert.equal(h.elements.message.style.display,'grid');
  h.events.options({video:{background:'original'}});
  assert.equal(h.elements.message.style.display,'none');assert.equal(h.elements.video.style.display,'block');
});

test('image adjustments apply to video and segmented canvas without changing frame styling',()=>{
 const h=setup();
 for(const background of ['original','blur','remove']){
  h.events.options({appearance:{borderColor:'#123456'},video:{background,brightness:135,contrast:120,saturation:80,hue:-20}});
  assert.equal(h.elements.video.style.filter,'brightness(135%) contrast(120%) saturate(80%) hue-rotate(-20deg)');
  assert.equal(h.elements.canvas.style.filter,h.elements.video.style.filter);
  assert.equal(h.elements.frame.style.borderColor,'#123456');
 }
 h.events.options({video:{background:'original'}});
 assert.equal(h.elements.video.style.filter,'brightness(100%) contrast(100%) saturate(100%) hue-rotate(0deg)');
});
