// Runs the real overlay renderer and every matting mode against a synthetic camera stream.
// Usage: npx electron scripts/verify-matting-electron.js
// Env:   WEBCAM_QA_FIXTURES  folder with PNG frames (defaults to release/matte-qa/frames)
//        WEBCAM_QA_CPU=1     allow CPU (WASM) inference when WebGPU is unavailable (CI / VMs)
// Output: release/matte-qa/<mode>.png and results.json
const { app, BrowserWindow } = require('electron');
const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url');
const root = path.resolve(__dirname, '..'), source = path.join(root, 'src');
const out = path.join(root, 'release/matte-qa');
const fixtures = process.env.WEBCAM_QA_FIXTURES || path.join(out, 'frames');
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', path.join(out, 'electron-profile'));
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.commandLine.appendSwitch('enable-unsafe-webgpu');
// Software WebGPU (SwiftShader/Vulkan) lets machines without a GPU exercise the WebGPU path.
if (process.env.WEBCAM_QA_SOFTWARE_WEBGPU === '1') for (const [k, v] of [['enable-features', 'Vulkan'], ['use-vulkan', 'swiftshader'], ['use-webgpu-adapter', 'swiftshader'], ['enable-unsafe-swiftshader'], ['ignore-gpu-blocklist']]) app.commandLine.appendSwitch(k, v);
const timeout = setTimeout(() => { console.error('QA timeout'); app.exit(1); }, 600000);

app.whenReady().then(async () => {
  try {
    const frames = fs.readdirSync(fixtures).filter(f => /\.png$/i.test(f)).sort().map(f => pathToFileURL(path.join(fixtures, f)).href);
    if (!frames.length) throw new Error('No fixture frames in ' + fixtures);
    const setup = `<base href="${pathToFileURL(source + path.sep).href}"><script>
      window.MATTE_ALLOW_CPU=${process.env.WEBCAM_QA_CPU === '1'};
      const handlers={};window.qa={frames:0,times:[]};
      const input=document.createElement('canvas');input.width=640;input.height=360;const ictx=input.getContext('2d');
      const images=${JSON.stringify(frames)}.map(src=>{const i=new Image();i.src=src;return i;});
      const ready=Promise.all(images.map(i=>i.decode()));
      function paint(n){const img=images[n%images.length];ictx.fillStyle='#8899aa';ictx.fillRect(0,0,640,360);const h=360,w=img.width/img.height*h;ictx.drawImage(img,(640-w)/2,0,w,h);}
      ready.then(()=>{let tick=0;paint(0);setInterval(()=>paint(++tick),250);});
      window.desktop={onSourceChanged:f=>handlers.source=f,onVisibilityChanged:f=>handlers.visible=f,onOptionsChanged:f=>handlers.options=f,loadDecoration:async()=>({ok:false}),reportOverlayHealth:()=>{},
        getState:async()=>{await ready;return {sources:['fixture',''],sourceNames:['fixture',''],displayMode:1,activeSingleSource:0,video:{background:'original'}};}};
      navigator.mediaDevices.getUserMedia=async()=>{await ready;return input.captureStream(30);};
      window.qa.run=async(video,count=12)=>{
        await ready;window.qa.frames=0;window.qa.times=[];
        handlers.options({appearance:{borderWidth:0,shadow:false},video:{matteEdge:15,matteFeather:25,matteStability:40,...video}});
        const deadline=Date.now()+240000;
        while(window.qa.frames<count){if(Date.now()>deadline)throw Error('timeout: '+message.textContent+' / '+matteStatus.textContent);await new Promise(r=>setTimeout(r,100));}
        const c=document.getElementById('canvas'),x=c.getContext('2d'),px=(u,v)=>x.getImageData(Math.floor(c.width*u),Math.floor(c.height*v),1,1).data[3];
        const t=window.qa.times.slice(2);
        return {requested:video.matteQuality,active:activeMode(),notice:matteStatus.textContent,frames:window.qa.frames,medianMs:t.sort((a,b)=>a-b)[t.length>>1],
          compositor:compositor?.constructor.name,engine:[...engines.values()].map(e=>({type:e.constructor.name,backend:e.backend,model:e.model}))[0],
          cornerAlpha:px(.03,.05),subjectAlpha:px(.5,.8),size:[c.width,c.height],image:c.toDataURL()};
      };
    </script>`;
    const instrument = `<script>const realDraw=drawResult;let lastDraw=0;drawResult=function(...a){realDraw(...a);const now=performance.now();if(lastDraw)window.qa.times.push(now-lastDraw);lastDraw=now;window.qa.frames++;};</script>`;
    const html = fs.readFileSync(path.join(source, 'overlay.html'), 'utf8').replace('<head>', '<head>' + setup).replace('</body>', instrument + '</body>');
    const htmlPath = path.join(source, '.qa-overlay.html');
    fs.writeFileSync(htmlPath, html);
    const win = new BrowserWindow({ show: false, width: 680, height: 420, webPreferences: { backgroundThrottling: false } });
    const log = path.join(out, 'console.txt'); fs.writeFileSync(log, '');
    win.webContents.on('console-message', e => fs.appendFileSync(log, `[${e.level}] ${e.message}\n`));
    await win.loadFile(htmlPath);
    await win.webContents.executeJavaScript('handlers.visible(true)');
    const cases = [
      ['rvm', { background: 'remove', matteQuality: 'rvm' }],
      ['advanced', { background: 'remove', matteQuality: 'advanced' }],
      ['quality', { background: 'remove', matteQuality: 'quality' }],
      ['fast', { background: 'remove', matteQuality: 'fast' }],
      ['rvm-blur', { background: 'blur', matteQuality: 'rvm', blur: 14 }],
      ['quality-virtual', { background: 'virtual', virtualType: 'scene', backgroundImage: 'classroom', matteQuality: 'quality' }]
    ];
    const results = [];
    for (const [name, video] of cases) {
      const r = await win.webContents.executeJavaScript(`window.qa.run(${JSON.stringify(video)})`);
      fs.writeFileSync(path.join(out, name + '.png'), Buffer.from(r.image.split(',')[1], 'base64'));
      delete r.image; r.name = name; results.push(r); console.log(JSON.stringify(r));
    }
    // A failing engine must fall back without hiding the video.
    const fallback = await win.webContents.executeJavaScript(`(async()=>{
      const original=Matting.RVMMatting.prototype.infer;
      Matting.RVMMatting.prototype.infer=async()=>{throw Error('QA: GPU unavailable');};
      try { const r=await window.qa.run({background:'remove',matteQuality:'rvm',matteEdge:16},4); delete r.image;
        if(r.active!=='quality'||!r.notice)throw Error('fallback not reported: '+JSON.stringify(r)); return r; }
      finally { Matting.RVMMatting.prototype.infer=original; }
    })()`);
    console.log('fallback', JSON.stringify(fallback));
    const released = await win.webContents.executeJavaScript(`handlers.options({video:{background:'original'}});[...engines.keys()]`);
    fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, fallback, released, gpu: await app.getGPUFeatureStatus() }, null, 2));
    fs.unlinkSync(htmlPath);
    for (const r of results.filter(r => !/blur|virtual/.test(r.name))) if (r.cornerAlpha > 40 || r.subjectAlpha < 200) throw new Error(`${r.name}: unexpected alpha corner=${r.cornerAlpha} subject=${r.subjectAlpha}`);
    clearTimeout(timeout); app.exit(0);
  } catch (error) {
    console.error(error); try { fs.unlinkSync(path.join(source, '.qa-overlay.html')); } catch {}
    app.exit(1);
  }
});
