const fs=require('fs'),path=require('path'),{spawn,execFileSync}=require('child_process'),assert=require('assert/strict');
const out=path.resolve(__dirname,'../release/settings-qa');fs.mkdirSync(out,{recursive:true});
const exe=path.join(out,'WebcamOverlay-Portable-0.2.35.exe');
fs.copyFileSync(path.resolve(__dirname,'../release/WebcamOverlay-Portable-0.2.35.exe'),exe);
const pause=ms=>new Promise(r=>setTimeout(r,ms));let child,socket;
async function start(){
 child=spawn(exe,['--remote-debugging-port=9337',`--user-data-dir=${path.join(out,'profile')}`],{windowsHide:true,stdio:'ignore'});
 let target;for(let i=0;i<120;i++){await pause(500);try{target=(await(await fetch('http://127.0.0.1:9337/json')).json()).find(t=>t.url.endsWith('/settings.html'));if(target)break;}catch{}}
 assert.ok(target,'settings target ready');socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);await pause(1500);
}
let serial=0;async function call(method,params={}){const id=++serial;return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('CDP timeout '+method)),15000);const listener=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;clearTimeout(timeout);socket.removeEventListener('message',listener);m.error?reject(Error(m.error.message)):resolve(m.result);};socket.addEventListener('message',listener);socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function stop(){socket?.close();if(child){try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}child=null;}await pause(1200);}
(async()=>{try{
 await start();assert.equal(await evaluate('document.getElementById("rememberSettings").checked'),false);
 await evaluate('document.getElementById("rememberSettings").click()');await pause(400);
 await evaluate("window.desktop.saveOptions({target:'all',appearance:{shape:'circle'}})");await pause(500);
 assert.equal(JSON.parse(fs.readFileSync(path.join(out,'Data/settings.json'))).rememberSettings,true);
 await stop();await start();let state=await evaluate('window.desktop.getState()');assert.equal(state.rememberSettings,true);assert.equal(state.appearance.shape,'circle');
 await evaluate('document.getElementById("rememberSettings").click()');await pause(400);state=await evaluate('window.desktop.getState()');assert.equal(state.appearance.shape,'circle');assert.equal(state.rememberSettings,false);
 await stop();await start();state=await evaluate('window.desktop.getState()');assert.equal(state.rememberSettings,false);assert.equal(state.appearance.shape,'rounded');
 await evaluate('document.querySelector(".resetArea").scrollIntoView({block:"center"})');await pause(200);
 const screenshot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'settings-footer.png'),Buffer.from(screenshot.data,'base64'));
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({version:state.appVersion,portableExe:exe,passed:['default unchecked','opt in saves','portable restart restores circle','opt out retains session','portable restart resets defaults'],settingsPath:path.join(out,'Data/settings.json')},null,2));console.log('PASS: portable restart persistence; screenshot saved');
 }finally{await stop();}})().catch(e=>{console.error(e);process.exitCode=1});
