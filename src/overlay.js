const index = Number(new URLSearchParams(location.search).get('index')) || 0;
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const context = canvas.getContext('2d');
const frame = document.getElementById('frame');
const shell = document.getElementById('shell');
const message = document.getElementById('message');
const matteStatus = document.getElementById('matteStatus');
const decorationRenderer = window.Decorations?.createRenderer(document.getElementById('decoration'), id => window.desktop.loadDecoration(id), message => {
  const label = document.getElementById('decorationError');
  label.textContent = message; label.hidden = !message;
});
let stream;
let options = { appearance: {}, video: { background: 'original' } };
let processing = false;
let segmentationEpoch = 0;
let segmentationBusy = false;
let segmentationTimer;
let matteSignature = '';
let virtualBackground = null;
function loadVirtualBackground(name){const image=new Image();image.dataset.name=name;image.src=name.startsWith('data:image/')?name:`assets/virtual-backgrounds/${name}.webp`;virtualBackground=image;}

// Matting modes, best first. A mode that cannot start (no WebGPU, no FP16, missing model)
// falls back to the next one until the settings change.
const MODE_FALLBACK = { rvm: 'quality', advanced: 'quality', quality: 'fast', fast: null };
const MODE_NAMES = { rvm: '影片去背（RVM）', advanced: '進階去背（PP-MattingV2）', quality: '品質模式', fast: '快速模式' };
const ALLOW_CPU_INFERENCE = window.MATTE_ALLOW_CPU === true; // automated tests only
const engines = new Map();
const failedModes = new Set();
let compositor;
let frameCanvas, frameContext;
let fallbackNotice = '';
let reportedMode = '';
let lastErrorReason = '';
const reportMatting = data => { try { window.desktop.reportMatting?.(data); } catch {} };
function resetMatte() { segmentationEpoch++; compositor?.reset(); engines.forEach(engine => engine.reset()); }
function stopSegmentation() { processing = false; clearTimeout(segmentationTimer); resetMatte(); }
function requestedMode() { const mode = options.video?.matteQuality; return mode in MODE_FALLBACK ? mode : 'rvm'; }
function activeMode() { let mode = requestedMode(); while (mode && failedModes.has(mode)) mode = MODE_FALLBACK[mode]; return mode; }
function engineFor(mode) {
  if (!engines.has(mode)) {
    const { RVMMatting, PPMatting, TasksSegmenter } = window.Matting;
    engines.set(mode, mode === 'rvm' ? new RVMMatting({ allowCpu: ALLOW_CPU_INFERENCE })
      : mode === 'advanced' ? new PPMatting({ allowCpu: ALLOW_CPU_INFERENCE }) : new TasksSegmenter(mode));
  }
  return engines.get(mode);
}
// Only one model per window stays loaded, to keep GPU memory low.
function releaseEngines(keep) { for (const [mode, engine] of engines) if (mode !== keep) { engines.delete(mode); engine.close().catch(() => {}); } }

let retryTimer;
let down;
let dragged = false;
let overlayVisible = false;
let selectedSource = { deviceId: '', name: '', resolution: 'auto' };
let sourceGeneration = 0;

async function useSource({ deviceId, name, resolution = 'auto' }) {
  selectedSource = { deviceId, name, resolution };
  stopSource();
  if (!overlayVisible) return;
  const generation = sourceGeneration;
  const isCurrent = () => generation === sourceGeneration && overlayVisible;
  let acquiredStream;
  message.style.display = 'grid';
  if (!deviceId) { message.textContent = '尚未選擇攝影機'; return; }
  message.textContent = `正在連接 ${name}…`;
  const dimensions = /^\d+x\d+$/.test(resolution) ? resolution.split('x').map(Number) : null;
  try {
    const videoConstraints = {
      deviceId: { exact: deviceId },
      width: dimensions ? { exact: dimensions[0] } : { ideal: 1280 },
      height: dimensions ? { exact: dimensions[1] } : { ideal: 720 },
      frameRate: { ideal: 30 }
    };
    acquiredStream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
    if (!isCurrent()) { acquiredStream.getTracks().forEach(track => track.stop()); return; }
    stream = acquiredStream;
    stream.getVideoTracks().forEach(track => track.addEventListener('ended', () => {
      if (isCurrent()) useSource(selectedSource);
    }, { once: true }));
    video.srcObject = stream; await video.play();
    if (!isCurrent()) return;
    video.style.display = 'block'; message.style.display = 'none';
    applyOptions(options);
  } catch (error) {
    if (!isCurrent()) return;
    if (acquiredStream) acquiredStream.getTracks().forEach(track => track.stop());
    if (dimensions && ['OverconstrainedError','ConstraintNotSatisfiedError'].includes(error.name)) {
      message.textContent = `${name}\n無法使用 ${resolution}，改用自動解析度`;
      selectedSource = { deviceId, name, resolution: 'auto' };
      setTimeout(() => { if (isCurrent()) useSource(selectedSource); }, 500);
      return;
    }
    stream = null; video.srcObject = null;
    video.style.display = 'none'; canvas.style.display = 'none'; message.style.display = 'grid';
    message.textContent = `${name}\n無法開啟或裝置正被占用\n5 秒後自動重試`;
    retryTimer=setTimeout(()=>{ if (isCurrent()) useSource(selectedSource); },5000);
  }
}
function stopSource(){
  matteStatus.style.display='none';
  sourceGeneration++;
  clearTimeout(retryTimer);stopSegmentation();
  if(stream)stream.getTracks().forEach(track=>track.stop());
  stream=null;video.srcObject=null;video.style.display='none';canvas.style.display='none';
}
function applyOptions(next) {
  matteStatus.style.display='none';
  const signature = JSON.stringify([next.video?.background,next.video?.backgroundImage, next.video?.matteQuality, next.video?.matteEdge, next.video?.matteFeather, next.video?.matteStability]);
  if (signature !== matteSignature) { resetMatte(); matteSignature = signature; failedModes.clear(); fallbackNotice = ''; reportedMode = ''; }
  options = next;
  const a=options.appearance||{}, v=options.video||{};
  decorationRenderer?.update(next.decoration, a.shape, overlayVisible);
  frame.style.borderColor=a.borderColor||'#fff'; frame.style.borderWidth=`${a.borderWidth||0}px`;
  frame.style.borderRadius=a.shape==='circle'?'50%':a.shape==='rounded'?`${a.radius||20}px`:'0';
  frame.style.clipPath=a.shape==='circle'?'circle(50% at 50% 50%)':'none';
  shell.style.filter=a.shadow?'drop-shadow(0 5px 7px #0006)':'none';
  shell.style.inset=a.shadow?'14px':'2px';
  frame.style.background=['remove','virtual'].includes(v.background)?'transparent':'#111';
  const backgroundName=v.virtualType==='custom'?v.backgroundData:v.backgroundImage;
  if(v.background==='virtual'&&v.virtualType!=='solid'&&backgroundName&&virtualBackground?.dataset?.name!==backgroundName)loadVirtualBackground(backgroundName);
  video.style.transform=v.mirror?'scaleX(-1)':'none'; canvas.style.transform=v.mirror?'scaleX(-1)':'none';
  // Adjust the displayed image after segmentation to preserve mask alpha.
  const adjustment=(key,fallback,min,max)=>Number.isFinite(v[key])?Math.max(min,Math.min(max,v[key])):fallback;
  const imageFilter=`brightness(${adjustment('brightness',100,0,200)}%) contrast(${adjustment('contrast',100,0,200)}%) saturate(${adjustment('saturation',100,0,200)}%) hue-rotate(${adjustment('hue',0,-180,180)}deg)`;
  video.style.filter=imageFilter;canvas.style.filter=imageFilter;
  video.style.objectFit='cover';
  if(v.background==='original'){canvas.style.display='none';video.style.display=stream?'block':'none';if(stream)message.style.display='none';stopSegmentation();}
  else {video.style.display='none';canvas.style.display=stream?'block':'none';startSegmentation();}
}
function startSegmentation(){
  if(!stream||processing)return;
  processing=true;
  processFrame();
}
// One snapshot per inference so the matte, colour and blurred background share a frame.
function captureFrame(){
  const scale=Math.min(1,1280/Math.max(video.videoWidth,video.videoHeight));
  const width=Math.max(1,Math.round(video.videoWidth*scale)),height=Math.max(1,Math.round(video.videoHeight*scale));
  if(!frameCanvas){frameCanvas=document.createElement('canvas');frameContext=frameCanvas.getContext('2d');}
  if(frameCanvas.width!==width||frameCanvas.height!==height){frameCanvas.width=width;frameCanvas.height=height;}
  frameContext.drawImage(video,0,0,width,height);
  return frameCanvas;
}
async function processFrame(){
  if(!processing||!stream||segmentationBusy)return;
  segmentationBusy=true;
  const started=performance.now(),epoch=segmentationEpoch;
  let delay=33;
  try {
    if(video.readyState<2||!video.videoWidth)return;
    const mode=activeMode();
    if(!mode)throw new Error('No matting engine available');
    releaseEngines(mode);
    const engine=engineFor(mode),frame=captureFrame();
    let result;
    try { result=await engine.infer(frame); }
    catch(error) {
      if(epoch!==segmentationEpoch||!processing||!stream)return;
      if(!MODE_FALLBACK[mode])throw error;
      console.warn(`${mode} matting fallback: ${error?.message||error}`);
      reportMatting({event:'fallback',mode,backend:engine.backend,reason:String(error?.message||error)});
      failedModes.add(mode);engines.delete(mode);engine.close().catch(()=>{});
      fallbackNotice=`${MODE_NAMES[requestedMode()]}無法使用，已改用${MODE_NAMES[activeMode()]||'原有背景'}。`;
      delay=0;return;
    }
    try {
      if(epoch===segmentationEpoch&&processing&&stream&&overlayVisible){
        drawResult(result,mode,frame);
        if(reportedMode!==mode){reportedMode=mode;reportMatting({event:'started',mode,backend:engine.backend,model:engine.model,compositor:compositor?.constructor.name,stats:engine.lastStats});}
      }
    }
    finally { result.dispose?.(); }
  } catch(error) {
    if(epoch===segmentationEpoch&&processing){
      console.warn('Matting failed: '+(error?.message||error));
      const reason=String(error?.message||error);
      if(reason!==lastErrorReason){lastErrorReason=reason;reportMatting({event:'error',mode:activeMode(),reason});}
      message.textContent='去背處理暫時失敗，正在重試；可切換「原有背景」。';message.style.display='grid';
      delay=1000;
    }
  } finally {
    segmentationBusy=false;
    if(processing&&stream){clearTimeout(segmentationTimer);segmentationTimer=setTimeout(processFrame,Math.max(0,delay-(performance.now()-started)));}
  }
}
function matteSettings(mode){
  const v=options.video||{},pct=(value,fallback)=>Number.isFinite(Number(value))?Math.max(0,Math.min(100,Number(value)))/100:fallback;
  const edge=pct(v.matteEdge,.15),feather=pct(v.matteFeather,.25),stability=pct(v.matteStability,.4);
  const segmentation=mode==='quality'||mode==='fast';
  // Segmentation masks are re-thresholded; matting alpha only gets its faint haze trimmed.
  return {segmentation,shrink:segmentation?edge*.16:edge*.3,soft:.24+feather*.5,history:stability*.8,edge:edge*100,feather:feather*100,stability:stability*100};
}
function outputCanvasSize(){
  const width=video.videoWidth,height=video.videoHeight;
  if(!width||!height)return {width:0,height:0};
  const displayWidth=Math.max(1,frame.clientWidth||width);
  const scale=Math.min(1,1920/Math.max(width,height),(displayWidth*2)/width);
  return {width:Math.max(1,Math.round(width*scale)),height:Math.max(1,Math.round(height*scale))};
}
function renderForeground(source,result,mode){
  compositor ||= MatteCompositor.create();
  try { return compositor.render(source,result,matteSettings(mode)); }
  catch(error) {
    if(compositor instanceof MatteCompositor.CpuMatte)throw error;
    console.warn('GPU matte failed, using CPU: '+error.message);
    compositor.dispose();compositor=new MatteCompositor.CpuMatte();
    return compositor.render(source,result,matteSettings(mode));
  }
}
function drawResult(result,mode,source){
  if(!video.videoWidth)return;
  const outputSize=outputCanvasSize();
  if(canvas.width!==outputSize.width||canvas.height!==outputSize.height){canvas.width=outputSize.width;canvas.height=outputSize.height;}
  const foreground=renderForeground(source,result,mode);
  const background=options.video?.background;
  context.save();context.clearRect(0,0,canvas.width,canvas.height);
  context.drawImage(foreground,0,0,canvas.width,canvas.height);
  context.globalCompositeOperation='destination-over';
  if(background==='blur'){
    const blurRadius=Math.max(1,(Number(options.video.blur)||14)*canvas.width/1280);
    context.filter=`blur(${blurRadius}px)`;drawCover(source,Math.ceil(blurRadius*2));context.filter='none';
  } else if(background==='virtual'){
    if(options.video?.virtualType==='solid'){context.fillStyle=options.video.backgroundColor||'#7bb7e8';context.fillRect(0,0,canvas.width,canvas.height);}
    else if(virtualBackground?.complete&&virtualBackground.naturalWidth>0)drawContain(virtualBackground);
    else{context.fillStyle='#9bc7e8';context.fillRect(0,0,canvas.width,canvas.height);}
  }
  context.restore();
  message.style.display='none';
  matteStatus.textContent=fallbackNotice;
  matteStatus.style.display=fallbackNotice?'block':'none';
}
function drawCover(image,extra=0){
  const iw=image.videoWidth||image.width, ih=image.videoHeight||image.height;
  const targetRatio=canvas.width/canvas.height, sourceRatio=iw/ih;
  let sx=0,sy=0,sw=iw,sh=ih;
  if(sourceRatio>targetRatio){sw=ih*targetRatio;sx=(iw-sw)/2;}else{sh=iw/targetRatio;sy=(ih-sh)/2;}
  context.drawImage(image,sx,sy,sw,sh,-extra,-extra,canvas.width+extra*2,canvas.height+extra*2);
}
window.desktop.onSourceChanged(source=>{
  const sameSource=source.deviceId===selectedSource.deviceId;
  const hasLiveStream=stream?.active&&stream.getVideoTracks().some(track=>track.readyState==='live');
  selectedSource=source;
  if(overlayVisible&&(!sameSource||!hasLiveStream))useSource(source);
});
window.desktop.onOptionsChanged(applyOptions);
window.desktop.onVisibilityChanged(visible=>{const wasVisible=overlayVisible;overlayVisible=visible;decorationRenderer?.update(options.decoration, options.appearance?.shape, visible);if(visible&&!wasVisible)useSource(selectedSource);else if(!visible)stopSource();});
window.desktop.getState().then(state => {
  const sourceIndex=state.displayMode===1?state.activeSingleSource:index;
  applyOptions({ ...(state.sourceOptions?.[sourceIndex] || state), decoration: state.decorations?.[sourceIndex] });
  selectedSource={deviceId:state.sources[sourceIndex]||'',name:state.sourceNames[sourceIndex]||'',resolution:state.sourceResolutions?.[sourceIndex]||'auto'};
  overlayVisible=state.displayMode===2||(state.displayMode===1&&index===0);
  decorationRenderer?.update(options.decoration, options.appearance?.shape, overlayVisible);
  if(overlayVisible)useSource(selectedSource);
});
addEventListener('wheel', e => { e.preventDefault(); window.desktop.resizeOverlay({ index, delta: e.deltaY }); }, { passive: false });
addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  down = { x: e.screenX, y: e.screenY, time: performance.now() };
  dragged = false;
  window.desktop.dragStart({ index, screenX: e.screenX, screenY: e.screenY });
});
addEventListener('mousemove', e => {
  if (!down || !(e.buttons & 1)) return;
  if (Math.abs(e.screenX-down.x)+Math.abs(e.screenY-down.y)>5) dragged=true;
  window.desktop.moveOverlay({ index });
});
addEventListener('mouseup', e => {
  if (e.button !== 0 || !down) return;
  window.desktop.dragEnd(index);
  const distance=Math.abs(e.screenX-down.x)+Math.abs(e.screenY-down.y);
  dragged = distance >= 8 || performance.now()-down.time >= 500;
  down=null;
});
addEventListener('click', () => {
  if (!dragged) window.desktop.overlayClick(index);
  dragged = false;
});
addEventListener('blur', () => { if (down) window.desktop.dragEnd(index); down=null; });


if (window.desktop.reportOverlayHealth) {
  setInterval(() => window.desktop.reportOverlayHealth({ visible: overlayVisible, readyState: video.readyState, paused: video.paused, streamActive: !!stream?.active }), 2000);
}

function drawContain(image){
  const iw=image.naturalWidth||image.videoWidth||image.width, ih=image.naturalHeight||image.videoHeight||image.height;
  if(!iw||!ih)return;
  const scale=Math.min(canvas.width/iw,canvas.height/ih),w=iw*scale,h=ih*scale;
  context.drawImage(image,(canvas.width-w)/2,(canvas.height-h)/2,w,h);
}
