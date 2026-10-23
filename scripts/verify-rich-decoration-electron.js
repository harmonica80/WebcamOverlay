const {app,BrowserWindow,nativeImage}=require('electron');
const fs=require('fs'),path=require('path'),assert=require('assert/strict'),{pathToFileURL}=require('url');
const D=require('../src/decoration'),R=require('../src/decoration-scenes');
const root=path.resolve(__dirname,'..'),out=path.join(root,'release','rich-decoration-qa-'+Date.now());
fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'profile'));
const pause=ms=>new Promise(r=>setTimeout(r,ms)),passed=[],base=pathToFileURL(path.join(root,'src')+path.sep).href;
const css=fs.readFileSync(path.join(root,'src/decoration.css'),'utf8');
const person='<svg class="person" viewBox="0 0 640 360"><circle cx="320" cy="134" r="52" fill="#a5b4c8"/><path d="M196 360V287Q196 222 320 222Q444 222 444 287V360" fill="#a5b4c8"/></svg>';
const imageReady=`Promise.all([...document.querySelectorAll('image')].map(e=>new Promise((resolve,reject)=>{const i=new Image();i.onload=()=>resolve(true);i.onerror=()=>reject(Error('Missing artwork: '+e.getAttribute('href')));i.src=e.getAttribute('href');})))`;
const timeout=setTimeout(()=>{console.error('Rich QA timeout');app.exit(1);},120000);
app.whenReady().then(async()=>{try{
  for(const id of R.themes){
    const img=nativeImage.createFromPath(path.join(root,'src',R.assetPath(id)));assert.equal(img.isEmpty(),false);
    assert.deepEqual(img.getSize(),{width:1536,height:1024});
    const pixels=img.toBitmap();let clear=0;for(let i=3;i<pixels.length;i+=4)if(pixels[i]===0)clear++;
    assert.ok(clear/(1536*1024)>.4,'transparent background');assert.equal(pixels[3],0);
  }
  passed.push('three packaged atlases decode, contain real alpha and transparent corners');
  const win=new BrowserWindow({width:640,height:360,useContentSize:true,show:false,webPreferences:{backgroundThrottling:false}});
  const run=js=>win.webContents.executeJavaScript(js,true);
  for(const id of R.themes){
    const html=`<!doctype html><base href="${base}"><style>${css}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#dae3eb}.person{width:100%;height:100%}</style>${person}<div id="layer"></div><script src="decoration-scenes.js"></script><script src="decoration.js"></script><script>window.renderer=Decorations.createRenderer(document.getElementById('layer'),()=>{});renderer.update({enabled:true,preset:'${id}',animated:false});</script>`;
    const file=path.join(out,id+'.html');fs.writeFileSync(file,html);await win.loadURL(pathToFileURL(file).href);await run(imageReady);await pause(200);
    await run("document.getElementById('layer').style.visibility='hidden'");await pause(100);
    const face={x:245,y:95,width:150,height:140};const clearFace=(await win.webContents.capturePage(face)).toPNG();
    await run("document.getElementById('layer').style.visibility='visible'");await pause(100);
    fs.writeFileSync(path.join(out,id+'-static.png'),(await win.webContents.capturePage()).toPNG());
    const actualFace=(await win.webContents.capturePage(face)).toPNG();
    if(!actualFace.equals(clearFace)){fs.writeFileSync(path.join(out,id+'-face.png'),actualFace);fs.writeFileSync(path.join(out,id+'-face-clear.png'),clearFace);console.log('DIAG '+out);}
    const ap=nativeImage.createFromBuffer(actualFace).toBitmap(),bp=nativeImage.createFromBuffer(clearFace).toBitmap();
    let count=0,max=0;for(let i=0;i<ap.length;i++){const d=Math.abs(ap[i]-bp[i]);if(d){count++;max=Math.max(max,d);}}
    console.log(id+' face difference '+JSON.stringify({count,max,bytes:ap.length}));
    assert.ok(max<=1,id+' keeps face region open');
    const still=(await win.webContents.capturePage()).toPNG();await pause(300);assert.deepEqual((await win.webContents.capturePage()).toPNG(),still);
    fs.writeFileSync(path.join(out,id+'-static.png'),still);
    await run(`renderer.update({enabled:true,preset:'${id}',animated:true})`);await pause(300);
    assert.ok(await run("document.getElementById('layer').getAnimations({subtree:true}).length>10"));
    const before=(await win.webContents.capturePage()).toPNG();await pause(450);const after=(await win.webContents.capturePage()).toPNG();assert.notDeepEqual(after,before,id+' has moving pixels');
    const animatedFace=(await win.webContents.capturePage(face)).toBitmap();let delta=0;for(let i=0;i<animatedFace.length;i++)delta=Math.max(delta,Math.abs(animatedFace[i]-bp[i]));assert.ok(delta<=1,id+' animation keeps face region open');
    fs.writeFileSync(path.join(out,id+'-animated.png'),after);
    await run(`window.oldSvg=document.querySelector('#layer>div>svg');renderer.update({enabled:true,preset:'${id}',sceneScale:150})`);
    assert.equal(await run("oldSvg===document.querySelector('#layer>div>svg')"),true,'scale does not reload artwork');
    await run(`renderer.update({enabled:true,preset:'${id}'},'rounded',false)`);assert.equal(await run("document.getElementById('layer').getAnimations({subtree:true}).length"),0);
    await run(`renderer.update({enabled:true,preset:'${id}',mode:'sticker',size:90,animated:false})`);await run(imageReady);
    assert.equal(await run("document.querySelectorAll('#layer .rich-sprite').length>=3"),true);
    passed.push(id+': real artwork load, static stop, moving pixels, face clearance, no-reload scale, hide cleanup, sticker mode');
  }
  const cards=R.themes.map(id=>`<article><h2>${D.presets.find(p=>p.id===id).name}</h2><div class="row"><div class="stage">${person}<div class="decoration-layer frame animated"><div class="decoration-content">${D.svg(id,'frame')}</div></div></div><div class="circle"><div class="decoration-layer frame animated"><div class="decoration-content">${D.svg(id,'frame','circle')}</div></div></div><div class="sticker"><div class="decoration-layer animated"><div class="decoration-content">${D.svg(id,'sticker')}</div></div></div></div></article>`).join('');
  const gallery=`<!doctype html><meta charset="UTF-8"><base href="${base}"><style>${css}body{margin:20px;background:#eef2f7;color:#233c58;font-family:'Microsoft JhengHei'}h1{font-size:24px}h2{font-size:18px}p{font-size:13px}.row{display:flex;align-items:center;gap:18px}.stage,.circle,.sticker{position:relative;overflow:hidden;background:#dae3eb;border-radius:12px}.stage{width:640px;height:360px}.circle{width:190px;height:190px;border-radius:50%}.sticker{width:160px;height:160px;background:repeating-conic-gradient(#eee 0% 25%,white 0% 50%) 0/16px 16px}.person{width:100%;height:100%}article{background:white;border-radius:14px;padding:16px;margin:14px 0}button,input{vertical-align:middle}</style><h1>Webcam Overlay v0.2.41｜三款插畫場景</h1><p>程式實際渲染：全畫面場景、圓形場景、自由貼圖。中央人像僅供示意。</p><button onclick="document.querySelectorAll('.decoration-layer').forEach(e=>e.classList.toggle('animated'))">播放／停止動畫</button> 圖案大小 <input type="range" min="50" max="180" value="100" oninput="document.body.style.setProperty('--deco-scene-scale',this.value/100)">${cards}`;
  fs.writeFileSync(path.join(out,'gallery.html'),gallery);await win.loadURL(pathToFileURL(path.join(out,'gallery.html')).href);await run(imageReady);
  win.webContents.debugger.attach('1.3');await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1120,height:1500,deviceScaleFactor:1,mobile:false});await pause(400);
  const shot=await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',captureBeyondViewport:true});fs.writeFileSync(path.join(out,'gallery.png'),Buffer.from(shot.data,'base64'));
  fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({passed},null,2));console.log('PASS '+out+'\n'+passed.join('\n'));clearTimeout(timeout);app.exit(0);
}catch(e){console.error(e);clearTimeout(timeout);app.exit(1);}});
