const fs=require('fs'),path=require('path'),crypto=require('crypto'),net=require('net');
const {spawn,execFileSync}=require('child_process'),assert=require('assert/strict'),{png}=require('./decoration-fixtures');
const version=require('../package.json').version,root=path.resolve(__dirname,'..');
const out=path.join(root,'release','decoration-qa-portable-'+Date.now());fs.mkdirSync(out,{recursive:true});
const exe=path.join(out,`WebcamOverlay-Portable-${version}.exe`);fs.copyFileSync(path.join(root,'release',path.basename(exe)),exe);
const buffer=png(true),asset=crypto.createHash('sha256').update(buffer).digest('hex')+'.png';
fs.mkdirSync(path.join(out,'Data','decorations'),{recursive:true});fs.writeFileSync(path.join(out,'Data','decorations',asset),buffer);
let child,socket,serial=0,port;const pause=ms=>new Promise(r=>setTimeout(r,ms));const passed=[];
function availablePort(){return new Promise((resolve,reject)=>{const s=net.createServer();s.once('error',reject);s.listen(0,'127.0.0.1',()=>{const p=s.address().port;s.close(()=>resolve(p));});});}
async function start(){
  port=await availablePort();
  child=spawn(exe,[`--remote-debugging-port=${port}`,`--user-data-dir=${path.join(out,'profile')}`,'--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'],{windowsHide:true,stdio:'ignore'});
  let target;for(let i=0;i<100;i++){await pause(500);try{target=(await(await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t=>t.url.endsWith('/settings.html'));if(target)break;}catch{}}
  assert.ok(target,'portable settings target ready');socket=new WebSocket(target.webSocketDebuggerUrl);await new Promise((resolve,reject)=>{socket.onopen=resolve;socket.onerror=reject;});
  for(let i=0;i<40;i++){if(await evaluate('!!document.querySelector(".decoration-settings .accordionToggle")'))return;await pause(100);}throw Error('settings not initialized');
}
async function call(method,params={}){const id=++serial;return new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{socket.removeEventListener('message',listener);reject(Error('CDP timeout '+method));},15000);const listener=e=>{const msg=JSON.parse(e.data);if(msg.id!==id)return;clearTimeout(timeout);socket.removeEventListener('message',listener);msg.error?reject(Error(msg.error.message)):resolve(msg.result);};socket.addEventListener('message',listener);socket.send(JSON.stringify({id,method,params}));});}
async function evaluate(expression){const result=await call('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;}
async function stop(){socket?.close();if(child){try{execFileSync('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});}catch{}child=null;}await pause(900);}
async function screenshot(name){const r=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});assert.ok(r.data.length>100);fs.writeFileSync(path.join(out,name),Buffer.from(r.data,'base64'));}
(async()=>{try{
  console.log('Portable QA directory: '+out);await start();
  let state=await evaluate('window.desktop.getState()');assert.equal(state.appVersion,version);assert.equal(state.rememberSettings,false);assert.ok(state.decorations.every(d=>!d.enabled));assert.equal(await evaluate('document.querySelectorAll("[data-preset]").length'),10);passed.push('portable version, 10 themes, decorations disabled by default');
  await evaluate('document.querySelector(".decoration-settings .accordionToggle").click()');
  await evaluate('window.desktop.saveDecoration({target:"0",patch:{enabled:true,preset:"newyear",mode:"frame",animated:true,sceneScale:100,showBorder:false}})');
  await evaluate('window.desktop.saveDecoration({target:"1",patch:{enabled:true,preset:"moon",mode:"sticker",position:"0-2",size:85,animated:false,sceneScale:65,showBorder:false}})');
  await call('Emulation.setDeviceMetricsOverride',{width:780,height:1000,deviceScaleFactor:1,mobile:false});
  await evaluate('document.querySelector(".decoration-settings").scrollIntoView({block:"start"})');await pause(300);await screenshot('settings.png');
  for(const id of ['newyear','moon','graduation']){
    await evaluate(`window.desktop.saveDecoration({target:'0',patch:{preset:'${id}',mode:'frame',enabled:true}})`);
    assert.equal(await evaluate(`(async()=>{const i=new Image();i.src='assets/decorations/${id}-v041.png';await i.decode();return i.naturalWidth;})()`),1536);
    assert.ok(await evaluate('document.querySelectorAll("#decoPreviewLayer .rich-sprite").length>10'));
    assert.equal(await evaluate('document.querySelector("#decoPreviewLayer .rich-scene").dataset.theme'),id);
    await pause(150);await screenshot(id+'-settings.png');
  }
  passed.push('all three illustrated scene atlases decode from the packaged EXE');
  await evaluate('document.getElementById("decoHelpButton").click()');await pause(500);assert.equal(await evaluate('document.getElementById("decoHelp").open'),true);await screenshot('file-guide.png');passed.push('settings UI and clickable file-specification guide');
  const result=await evaluate(`window.desktop.loadDecoration('${asset}')`);assert.equal(result.ok,true);assert.ok(result.url.startsWith('data:image/png;base64,'));
  await evaluate(`window.desktop.saveDecoration({target:'0',patch:{asset:'${asset}',assetName:'portable-animation.apng',mode:'sticker',enabled:true}})`);
  await evaluate('window.desktop.setRememberSettings(true)');
  const before=await evaluate('window.desktop.getState()');assert.equal(JSON.parse(fs.readFileSync(path.join(out,'Data/settings.json'))).decorations[0].asset,asset);
  await stop();console.log('Restarting with remembered decorations…');await start();state=await evaluate('window.desktop.getState()');assert.deepEqual(state.decorations,before.decorations);assert.equal(state.rememberSettings,true);
  assert.equal((await evaluate(`window.desktop.loadDecoration('${asset}')`)).ok,true);passed.push('EXE restart restores per-camera settings and copied APNG');
  assert.equal((await evaluate("window.desktop.loadDecoration('../settings.json')")).ok,false);
  assert.equal((await evaluate(`window.desktop.loadDecoration('${'0'.repeat(64)}.png')`)).ok,false);passed.push('missing and invalid assets fail gracefully');
  await evaluate('window.desktop.setRememberSettings(false)');state=await evaluate('window.desktop.getState()');assert.equal(state.decorations[0].asset,asset);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(out,'Data/settings.json'))),{rememberSettings:false});
  await stop();console.log('Restarting without recording settings…');await start();state=await evaluate('window.desktop.getState()');assert.equal(state.rememberSettings,false);assert.ok(state.decorations.every(d=>!d.enabled));passed.push('opt-out retains session then resets on portable restart');
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({version,exe,passed},null,2));console.log('PASS portable decoration QA\n'+passed.join('\n'));
}finally{await stop();}})().catch(error=>{console.error(error);process.exitCode=1;});
