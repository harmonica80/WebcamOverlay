// Source swapping must keep each device's resolution with the device.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const {test}=require('node:test');
const source=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8');
function load(displayMode){
  const c={config:{sources:['cam-a','cam-b'],sourceNames:['A','B'],sourceResolutions:['1920x1080','auto']},displayMode,activeSingleSource:0,refreshed:0};
  vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('function swapSources()'),source.indexOf('function sendToOverlays(')),c);
  vm.runInContext('refreshOverlays=()=>refreshed++',c);
  return c;
}
test('dual view swaps device, name and resolution together',()=>{
  const c=load(2);vm.runInContext('swapSources()',c);
  assert.deepEqual(c.config.sources,['cam-b','cam-a']);assert.deepEqual(c.config.sourceNames,['B','A']);
  assert.deepEqual(c.config.sourceResolutions,['auto','1920x1080']);assert.equal(c.refreshed,1);
});
test('single view toggles the visible source without touching saved slots',()=>{
  const c=load(1);vm.runInContext('swapSources()',c);
  assert.equal(c.activeSingleSource,1);assert.deepEqual(c.config.sources,['cam-a','cam-b']);
});
test('hidden mode does not reorder sources',()=>{
  const c=load(0);vm.runInContext('swapSources()',c);assert.deepEqual(c.config.sources,['cam-a','cam-b']);
});
test('settings are written through a temporary file',()=>{
  const writes=[],renames=[];const c={fs:{writeFileSync:(p,t)=>writes.push(p),renameSync:(a,b)=>renames.push([a,b])}};vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf('function writeFileAtomic('),source.indexOf('function loadConfig(')),c);
  vm.runInContext("writeFileAtomic('/d/settings.json','{}')",c);
  assert.deepEqual(writes,['/d/settings.json.tmp']);assert.deepEqual(renames,[['/d/settings.json.tmp','/d/settings.json']]);
});
test('model output check detects invalid values that would blank the matte',()=>{
  const c={window:{},document:{baseURI:'file:///app/'},URL,Float32Array,Uint16Array,Uint32Array,Math,Number};vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../src/matte-engines.js'),'utf8'),c);
  const {outputStats}=c.window.Matting;
  const good=new Float32Array(1300).fill(.5);const ok=outputStats(good,good);assert.equal(ok.nonFinite,0);assert.equal(ok.alphaMean,.5);
  const bad=new Float32Array(1300).fill(NaN);assert.ok(outputStats(good,bad).nonFinite>0);assert.ok(outputStats(bad).nonFinite>0);
});
