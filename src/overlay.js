const index = Number(new URLSearchParams(location.search).get('index')) || 0;
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const context = canvas.getContext('2d');
const frame = document.getElementById('frame');
const shell = document.getElementById('shell');
const message = document.getElementById('message');
const matteStatus = document.getElementById('matteStatus');
let stream;
let options = { appearance: {}, video: { background: 'original' } };
let segmenter;
let advancedSegmenter;
let advancedFailed = false;
let processing = false;
let segmentationEpoch = 0;
let segmentationBusy = false;
let segmentationJob;
let segmentationTimer;
let configuredModel;
let segmentationImage;
let matteSignature = '';
let matteRefiner;
let maskSurface, imageSurface, refinedSurface;
function resetMatte() { segmentationEpoch++; matteRefiner?.reset(); }
function stopSegmentation() { processing = false; clearTimeout(segmentationTimer); resetMatte(); }

let retryTimer;
let down;
let dragged = false;
let overlayVisible = false;
let selectedSource = { deviceId: '', name: '' };
let sourceGeneration = 0;

async function useSource({ deviceId, name }) {
  selectedSource = { deviceId, name };
  stopSource();
  if (!overlayVisible) return;
  const generation = sourceGeneration;
  const isCurrent = () => generation === sourceGeneration && overlayVisible;
  let acquiredStream;
  message.style.display = 'grid';
  if (!deviceId) { message.textContent = '尚未選擇攝影機'; return; }
  message.textContent = `正在連接 ${name}…`;
  try {
    acquiredStream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false });
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
  const signature = JSON.stringify([next.video?.background, next.video?.matteQuality, next.video?.matteEdge, next.video?.matteFeather, next.video?.matteStability]);
  if (signature !== matteSignature) { resetMatte(); matteSignature = signature; advancedFailed = false; }
  options = next;
  const a=options.appearance||{}, v=options.video||{};
  frame.style.borderColor=a.borderColor||'#fff'; frame.style.borderWidth=`${a.borderWidth||0}px`;
  frame.style.borderRadius=a.shape==='circle'?'50%':a.shape==='rounded'?`${a.radius||20}px`:'0';
  frame.style.clipPath=a.shape==='circle'?'circle(50% at 50% 50%)':'none';
  shell.style.filter=a.shadow?'drop-shadow(0 5px 7px #0006)':'none';
  shell.style.inset=a.shadow?'14px':'2px';
  frame.style.background=v.background==='remove'?'transparent':'#111';
  video.style.transform=v.mirror?'scaleX(-1)':'none'; canvas.style.transform=v.mirror?'scaleX(-1)':'none';
  video.style.objectFit='cover';
  if(v.background==='original'){canvas.style.display='none';video.style.display=stream?'block':'none';if(stream)message.style.display='none';stopSegmentation();}
  else {video.style.display='none';canvas.style.display=stream?'block':'none';startSegmentation();}
}
function startSegmentation(){
  if(!stream||processing)return;
  processing=true;
  if(!segmenter){
    segmenter=new SelfieSegmentation({locateFile:f=>`vendor/selfie_segmentation/${f}`});
    segmenter.onResults(result => {
      if (segmentationJob?.epoch === segmentationEpoch && processing && stream && overlayVisible) drawResult(result);
    });
  }
  processFrame();
}
async function processFrame(){
  if(!processing||!stream||segmentationBusy)return;
  segmentationBusy=true;
  const started=Date.now();
  const epoch=segmentationEpoch;
  let delay=33;
  try {
    if(typeof video.readyState==='number' && video.readyState<2)return;
    if(options.video?.matteQuality==='advanced' && !advancedFailed){
      advancedSegmenter ||= new PPMatting();
      try {
        const result = await advancedSegmenter.send(video);
        if(epoch===segmentationEpoch && processing && stream && overlayVisible) drawResult(result);
        return;
      } catch(error) {
        if(epoch!==segmentationEpoch || !processing || !stream)return;
        console.warn('PP-MattingV2 fallback: '+String(error));
        advancedFailed=true;
        await advancedSegmenter.close();advancedSegmenter=null;
      }
    }
    if(advancedSegmenter){await advancedSegmenter.close();advancedSegmenter=null;}
    const model=options.video?.matteQuality==='fast'?1:0;
    if(configuredModel!==model){ await segmenter.setOptions({modelSelection:model,selfieMode:false}); configuredModel=model; }
    if(epoch!==segmentationEpoch||!processing||!stream)return;
    segmentationJob={epoch};
    let image=video;
    if(video.videoWidth){
      segmentationImage ||= document.createElement('canvas');
      if(segmentationImage.width!==video.videoWidth || segmentationImage.height!==video.videoHeight){
        segmentationImage.width=video.videoWidth;segmentationImage.height=video.videoHeight;
      }
      segmentationImage.getContext('2d').drawImage(video,0,0);
      image=segmentationImage;
    }
    await segmenter.send({image});
  } catch {
    if(epoch===segmentationEpoch && processing){
      message.textContent='去背處理暫時失敗，正在重試；可切換「原有背景」。';message.style.display='grid';
      delay=1000;
    }
  } finally {
    segmentationJob=null;segmentationBusy=false;
    if(processing&&stream){clearTimeout(segmentationTimer);segmentationTimer=setTimeout(processFrame,Math.max(0,delay-(Date.now()-started)));}
  }
}
function refineMask(result) {
  if(!matteRefiner){
    matteRefiner=new MatteRefiner();
    maskSurface=document.createElement('canvas');imageSurface=document.createElement('canvas');refinedSurface=document.createElement('canvas');
  }
  const scale=320/Math.max(video.videoWidth,video.videoHeight);
  const width=Math.max(1,Math.round(video.videoWidth*scale)), height=Math.max(1,Math.round(video.videoHeight*scale));
  for(const surface of [maskSurface,imageSurface,refinedSurface])if(surface.width!==width||surface.height!==height){surface.width=width;surface.height=height;}
  const mc=maskSurface.getContext('2d',{willReadFrequently:true}),ic=imageSurface.getContext('2d',{willReadFrequently:true}),rc=refinedSurface.getContext('2d');
  mc.clearRect(0,0,width,height);mc.drawImage(result.segmentationMask,0,0,width,height);
  ic.drawImage(result.image,0,0,width,height);
  const pixels=mc.getImageData(0,0,width,height), rgb=ic.getImageData(0,0,width,height);
  const v=options.video||{};
  pixels.data.set(matteRefiner.refine(pixels.data,rgb.data,width,height,{edge:v.matteEdge,feather:v.matteFeather,stability:v.matteStability}));
  rc.putImageData(pixels,0,0);return refinedSurface;
}
function drawResult(result){
  if(!video.videoWidth)return;
  if(canvas.width!==video.videoWidth||canvas.height!==video.videoHeight){canvas.width=video.videoWidth;canvas.height=video.videoHeight;}
  const mode=options.video?.background;
  const mask=result.advanced||options.video?.matteQuality==='fast'?result.segmentationMask:refineMask(result);
  context.save();context.clearRect(0,0,canvas.width,canvas.height);
  // PP alpha was inferred from a square resize: restore, rather than crop, its aspect ratio.
  if(result.advanced)context.drawImage(mask,0,0,canvas.width,canvas.height);else drawCover(mask);
  context.globalCompositeOperation='source-in';drawCover(result.image);
  if(mode==='blur'){
    context.globalCompositeOperation='destination-over';context.filter=`blur(${options.video.blur||14}px)`;
    drawCover(result.image,20);context.filter='none';
  }
  context.restore();
  message.style.display='none';
  matteStatus.textContent='進階去背無法使用，已改用品質模式。';
  matteStatus.style.display=advancedFailed?'block':'none';
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
window.desktop.onVisibilityChanged(visible=>{const wasVisible=overlayVisible;overlayVisible=visible;if(visible&&!wasVisible)useSource(selectedSource);else if(!visible)stopSource();});
window.desktop.getState().then(state => {
  const sourceIndex=state.displayMode===1?state.activeSingleSource:index;
  applyOptions(state.sourceOptions?.[sourceIndex] || state);
  selectedSource={deviceId:state.sources[sourceIndex]||'',name:state.sourceNames[sourceIndex]||''};
  overlayVisible=state.displayMode===2||(state.displayMode===1&&index===0);
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

