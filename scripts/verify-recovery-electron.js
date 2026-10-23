// Exercise the actual main process and renderer lifecycle in isolated Electron.
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),Module=require('module'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'release/recovery-qa-'+Date.now());
fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'profile'));
const filename=path.join(root,'src/main.js');
const source=fs.readFileSync(filename,'utf8').replace(": path.join(__dirname, '..');",': '+JSON.stringify(out)+';');
const mod=new Module(filename,module);mod.filename=filename;mod.paths=Module._nodeModulePaths(path.dirname(filename));mod._compile(source,filename);
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<120;i++){if(await fn())return;await pause(250);}throw Error('Timeout: '+label);}
const overlays=()=>BrowserWindow.getAllWindows().filter(w=>w.webContents.getURL().includes('overlay.html'));
let settings;
const run=js=>settings.webContents.executeJavaScript(js,true);
const timeout=setTimeout(()=>{console.error('Timeout');app.exit(1);},120000);
app.whenReady().then(async()=>{try{
 await until(()=>BrowserWindow.getAllWindows().some(w=>w.webContents.getURL().includes('settings.html')),'settings');
 settings=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('settings.html'));
 await until(()=>overlays().length===2,'overlays');await pause(1500);
 await run("window.desktop.setMode(2);window.desktop.saveOptions({target:'0',video:{brightness:137},appearance:{borderColor:'#123456'}})");await pause(500);
 const settingsId=settings.id;let old=overlays().map(w=>w.id);
 overlays()[0].webContents.forcefullyCrashRenderer();
 await until(()=>overlays().length===2&&overlays().some(w=>!old.includes(w.id)),'crash recovery');await pause(1500);
 assert.equal(settings.isDestroyed(),false);assert.equal(settings.id,settingsId);
 let state=await run('window.desktop.getState()');assert.equal(state.displayMode,2);assert.equal(state.sourceOptions[0].video.brightness,137);
 old=overlays().map(w=>w.id);overlays()[0].destroy();
 await until(()=>overlays().length===2&&overlays().some(w=>!old.includes(w.id)),'closed recovery');await pause(1000);
 old=overlays().map(w=>w.id);await run('window.desktop.restartOverlays()');
 await until(()=>overlays().length===2&&overlays().every(w=>!old.includes(w.id)),'manual recovery');await pause(1500);
 state=await run('window.desktop.getState()');assert.equal(state.sourceOptions[0].video.brightness,137);assert.equal(state.sourceOptions[0].appearance.borderColor,'#123456');
 await run('window.desktop.setMode(0)');await pause(500);await run('window.desktop.restartOverlays()');await pause(1800);assert.ok(overlays().every(w=>!w.isVisible()));
 const log=fs.readFileSync(path.join(out,'Data/diagnostics.log'),'utf8');assert.ok(log.includes('renderer-gone'));assert.ok(log.includes('overlay-recreated'));assert.ok(log.includes('video-state'));
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed:['renderer crash recovery','unexpected close recovery','manual dual recovery','settings renderer survives','appearance preserved','hidden mode preserved','diagnostics written']},null,2));
 console.log('PASS '+out);clearTimeout(timeout);app.quit();
}catch(e){console.error(e);clearTimeout(timeout);app.exit(1);}});
