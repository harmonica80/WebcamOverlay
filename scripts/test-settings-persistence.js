const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const {test}=require('node:test');
const source=fs.readFileSync(require('node:path').join(__dirname,'../src/main.js'),'utf8');
function setup(saved){
 let disk=saved===undefined?undefined:JSON.stringify(saved);
 const context=vm.createContext({require:n=>n==='electron'?{dialog:{},app:{commandLine:{appendSwitch(){}},isPackaged:true,getPath:()=>'/fallback'}}:n==='fs'?{constants:{W_OK:2},mkdirSync(){},accessSync(){},readFileSync(){if(disk===undefined)throw Error('missing');return disk;},writeFileSync(_p,value){disk=value;}}:require(n),process:{env:{PORTABLE_EXECUTABLE_DIR:'/portable'},execPath:'/temporary/app.exe'},__dirname:'/src',structuredClone,setTimeout,clearTimeout});
 vm.runInContext(source.slice(0,source.indexOf('function createOverlay(')),context);
 const run=code=>vm.runInContext(code,context);
 run('config=loadConfig(); displayMode=config.displayMode; activeSingleSource=config.activeSingleSource;');
 return {run,disk:()=>JSON.parse(disk)};
}
test('fresh launch and legacy settings default to no recording',()=>{
 for(const saved of [undefined,{schemaVersion:2,sources:['old-camera',''],displayMode:2}]){
  const h=setup(saved);assert.equal(h.run('config.rememberSettings'),false);assert.equal(h.run('config.sources[0]'),'');assert.equal(h.run('displayMode'),0);
 }
});
test('disabled recording excludes settings and restarts with defaults',()=>{
 const h=setup();h.run("config.sources[0]='private-camera';config.appearance.shape='circle';saveConfig()");
 assert.deepEqual(h.disk(),{rememberSettings:false});const next=setup(h.disk());assert.equal(next.run('config.appearance.shape'),'rounded');
});
test('opt in saves current options and restores them at next launch',()=>{
 const h=setup();h.run("config.rememberSettings=true;config.sources[0]='camera';config.appearance.shape='circle';displayMode=1;saveConfig()");
 const next=setup(h.disk());assert.equal(next.run('config.rememberSettings'),true);assert.equal(next.run('config.sources[0]'),'camera');assert.equal(next.run('config.appearance.shape'),'circle');assert.equal(next.run('displayMode'),1);
});
test('opt out retains current session but removes persisted settings',()=>{
 const h=setup({rememberSettings:true,sources:['camera','']});h.run('config.rememberSettings=false;saveConfig()');assert.equal(h.run('config.sources[0]'),'camera');assert.deepEqual(h.disk(),{rememberSettings:false});assert.equal(setup(h.disk()).run('config.sources[0]'),'');
});
test('malformed preferences never enable recording',()=>{
 for(const rememberSettings of ['true',1,null,false])assert.equal(setup({rememberSettings}).run('config.rememberSettings'),false);
});

test('reset cancellation preserves preferences; confirmed reset disables recording',async()=>{
 const h=setup({rememberSettings:true,sources:['camera','']});
 h.run(`var response=1;dialog.showMessageBox=async()=>({response});
 registerHotkeys=()=>{};resetOverlayBounds=()=>{};resetQuickPositionWindow=()=>{};refreshOverlays=()=>{};currentState=()=>config;`);
 h.run(source.slice(source.indexOf('async function resetSettingsToDefaults()'),source.indexOf('function currentState()')));
 assert.equal((await h.run('resetSettingsToDefaults()')).cancelled,true);
 assert.equal(h.run('config.rememberSettings'),true);
 h.run('response=0');assert.equal((await h.run('resetSettingsToDefaults()')).ok,true);
 assert.equal(h.run('config.rememberSettings'),false);assert.equal(h.run('config.sources[0]'),'');assert.deepEqual(h.disk(),{rememberSettings:false});
});
