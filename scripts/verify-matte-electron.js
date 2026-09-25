// Runs the real renderer/model using an isolated, synthetic camera stream.
// Input: release/matte-qa/portrait.jpg (MediaPipe public test image, not shipped).
const {app,BrowserWindow}=require('electron');
const fs=require('fs'),path=require('path'),{pathToFileURL}=require('url');
const root=path.resolve(__dirname,'..'),out=path.join(root,'release/matte-qa');
app.setPath('userData',path.join(out,'electron-profile'));
app.commandLine.appendSwitch('autoplay-policy','no-user-gesture-required');
const timeout=setTimeout(()=>{console.error('QA timeout');app.exit(1);},120000);
app.whenReady().then(async()=>{
 try {
  const original=fs.readFileSync(path.join(root,'src/overlay.html'),'utf8');
  const setup=`<base href="${pathToFileURL(path.join(root,'src/')).href}"><script>
  const handlers={};window.qa={frames:0,times:[],captures:{}};
  const input=document.createElement('canvas');input.width=640;input.height=360;
  const ictx=input.getContext('2d'),portrait=new Image();
  const ready=new Promise((resolve,reject)=>{portrait.onload=resolve;portrait.onerror=reject});
  portrait.src=${JSON.stringify(pathToFileURL(path.join(out,'portrait.jpg')).href)};
  function paint(n){ictx.fillStyle='#b4c4d4';ictx.fillRect(0,0,640,360);const h=360,w=portrait.width/portrait.height*h;ictx.drawImage(portrait,Math.round((640-w)/2+Math.sin(n/8)*16),0,w,h);}
  window.desktop={onSourceChanged:f=>handlers.source=f,onVisibilityChanged:f=>handlers.visible=f,onOptionsChanged:f=>handlers.options=f,
   getState:async()=>{await ready;paint(0);return {sources:['fixture',''],sourceNames:['fixture',''],displayMode:1,activeSingleSource:0,video:{background:'remove',matteQuality:'fast'}};}};
  navigator.mediaDevices.getUserMedia=async()=>{await ready;return input.captureStream(30)};
  window.qa.run=async(mode)=>{
   await ready;window.qa.frames=0;window.qa.times=[];
   handlers.options({appearance:{borderWidth:0,shadow:false},video:{background:'remove',matteQuality:mode,matteEdge:15,matteFeather:25,matteStability:40}});
   return new Promise((resolve,reject)=>{const deadline=Date.now()+45000;const tick=()=>{
    if(window.qa.frames>=35){resolve({mode,frames:window.qa.frames,meanMs:window.qa.times.slice(5).reduce((a,b)=>a+b,0)/window.qa.times.slice(5).length,image:document.getElementById('canvas').toDataURL()});return;}
    if(Date.now()>deadline){reject(Error(document.getElementById('message').textContent));return;}setTimeout(tick,100);};tick();});
  };
  </script>`;
  const instrument=`<script>
  const realDraw=drawResult;drawResult=function(result){const now=performance.now();realDraw(result);if(window.qa.last)window.qa.times.push(now-window.qa.last);window.qa.last=now;paint(++window.qa.frames);};
  </script>`;
  const html=original.replace('<head>','<head>'+setup).replace('</body>',instrument+'</body>');
  const htmlPath=path.join(out,'fixture.html');fs.writeFileSync(htmlPath,html);
  const win=new BrowserWindow({show:false,width:680,height:420,webPreferences:{backgroundThrottling:false}});
  win.webContents.on('console-message',(_e,_level,msg)=>{if(/error|failed/i.test(msg))console.log(msg);});
  await win.loadFile(htmlPath);
  const results=[];
  for(const mode of ['fast','quality','fast']){
   const r=await win.webContents.executeJavaScript(`window.qa.run('${mode}')`);
   fs.writeFileSync(path.join(out,mode+'.png'),Buffer.from(r.image.split(',')[1],'base64'));delete r.image;results.push(r);
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
  const settings=fs.readFileSync(path.join(root,'src/settings.html'),'utf8');
  const settingsSetup=`<base href="${pathToFileURL(path.join(root,'src/')).href}"><script>
   const sample={appVersion:'0.2.33',displayMode:0,sources:['',''],video:{background:'remove',matteQuality:'quality',matteEdge:15,matteFeather:25,matteStability:40},appearance:{},sourceOptions:[{video:{background:'remove',matteQuality:'fast',matteEdge:80}},{video:{background:'remove',matteQuality:'quality',matteEdge:20}}]};
   navigator.mediaDevices.enumerateDevices=async()=>[];navigator.mediaDevices.getUserMedia=async()=>{throw Error('Test has no physical camera')};
   window.desktop=new Proxy({getState:async()=>sample,checkForUpdates:async()=>({ok:true,currentVersion:'0.2.33'}),saveOptions:data=>window.lastSaved=data},{get:(t,k)=>t[k]||(()=>{})});
  </script>`;
  const settingsPath=path.join(out,'settings-fixture.html');fs.writeFileSync(settingsPath,settings.replace('<head>','<head>'+settingsSetup));
  win.setSize(1000,1000);await win.loadFile(settingsPath);
  const ui=await win.webContents.executeJavaScript(`(async()=>{
    const q=id=>document.getElementById(id);
    document.querySelectorAll('.accordionToggle')[1].click();
    if(q('matteQuality').value!=='quality'||q('matteEdge').disabled)throw Error('quality controls missing');
    document.querySelector('[data-appearance-target="0"]').click();
    if(q('matteEdge').value!=='80'||!q('matteEdge').disabled)throw Error('per-camera fast settings not restored');
    document.querySelector('[data-appearance-target="1"]').click();
    if(q('matteEdge').value!=='20'||q('matteEdge').disabled)throw Error('per-camera quality settings not restored');
    q('matteStability').value='65';q('matteStability').dispatchEvent(new Event('input'));
    await new Promise(r=>setTimeout(r,80));
    if(window.lastSaved.target!=='1'||window.lastSaved.video.matteStability!==65)throw Error('settings not saved');
    return {controls:true,perCamera:true,saved:true,horizontalOverflow:document.documentElement.scrollWidth>innerWidth};
  })()`);
  fs.writeFileSync(path.join(out,'settings.png'),(await win.webContents.capturePage()).toPNG());
  fs.writeFileSync(path.join(out,'ui-results.json'),JSON.stringify(ui,null,2));console.log(JSON.stringify(ui));
  clearTimeout(timeout);app.exit(0);
 }catch(e){console.error(e);app.exit(1);}
});
