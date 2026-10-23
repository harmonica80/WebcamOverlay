const fs=require('fs'),path=require('path'),{spawn,execFileSync}=require('child_process'),assert=require('assert/strict');
const out=path.resolve(__dirname,'../release/recovery-portable-qa');fs.mkdirSync(out,{recursive:true});
const exe=path.join(out,'WebcamOverlay-Portable-0.2.38.exe');
fs.copyFileSync(path.resolve(__dirname,'../release/WebcamOverlay-Portable-0.2.38.exe'),exe);
const pause=ms=>new Promise(r=>setTimeout(r,ms));let child,socket;
async function start(){
 child=spawn(exe,['--remote-debugging-port=9345',`--user-data-dir=${path.join(out,'profile')}`],{windowsHide:true,stdio:'inherit'});
 let target;for(let i=0;i<120;i++){await pause(2500);try{target=(await(await fetch('http://127.0.0.1:9345/json')).json()).find(t=>t.url.endsWith('/settings.html'));if(target)break;}catch{}}
 assert.ok(target,'settings target ready');socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>socket.onopen=r);await pause(1500);
}
let serial=0;async function call(method,params={}){const id=++serial;return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>reject(Error('CDP timeout '+method)),15000);const listener=e=>{const m=JSON.parse(e.data);if(m.id!==id)return;clearTimeout(timeout);socket.removeEventListener('message',listener);m.error?reject(Error(m.error.message)):resolve(m.result);};socket.addEventListener('message',listener);socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const r=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
async function stop(){socket?.close();if(child){try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'inherit'});}catch{}child=null;}await pause(1200);}
(async()=>{try{await start();
 await evaluate("window.desktop.setMode(2);window.desktop.saveOptions({target:'0',video:{brightness:137}})");await pause(1500);
 const before=(await(await fetch('http://127.0.0.1:9345/json')).json()).filter(t=>t.url.includes('overlay.html')).map(t=>t.id);
 await evaluate("document.getElementById('restartOverlays').click()");await pause(3500);
 const after=(await(await fetch('http://127.0.0.1:9345/json')).json()).filter(t=>t.url.includes('overlay.html')).map(t=>t.id);
 assert.equal(after.length,2);assert.ok(after.every(id=>!before.includes(id)));
 const state=await evaluate('window.desktop.getState()');assert.equal(state.sourceOptions[0].video.brightness,137);assert.equal(state.displayMode,2);assert.equal(state.appVersion,'0.2.38');
 const screenshot=await call('Page.captureScreenshot',{format:'png'});fs.writeFileSync(path.join(out,'recovery-controls.png'),Buffer.from(screenshot.data,'base64'));
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({version:state.appVersion,passed:['portable manual dual window recreation','image settings preserved','display mode preserved','settings remains responsive']},null,2));console.log('PASS portable recovery');
 }finally{await stop();}})().catch(e=>{console.error(e);process.exitCode=1});