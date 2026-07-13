const index = Number(new URLSearchParams(location.search).get('index')) || 0;
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const context = canvas.getContext('2d');
const frame = document.getElementById('frame');
const message = document.getElementById('message');
let stream;
let options = { appearance: {}, video: { background: 'original' } };
let segmenter;
let processing = false;
let retryTimer;
let down;
let dragged = false;
let overlayVisible = false;
let selectedSource = { deviceId: '', name: '' };

async function useSource({ deviceId, name }) {
  selectedSource = { deviceId, name };
  if (!overlayVisible) return;
  clearTimeout(retryTimer);
  processing = false;
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; video.srcObject = null; video.style.display = 'none'; message.style.display = 'grid';
  if (!deviceId) { message.textContent = '尚未選擇攝影機'; return; }
  message.textContent = `正在連接 ${name}…`;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false });
    video.srcObject = stream; await video.play();
    video.style.display = 'block'; message.style.display = 'none';
    applyOptions(options);
  } catch (error) {
    message.textContent = `${name}\n無法開啟或裝置正被占用\n5 秒後自動重試`;
    retryTimer=setTimeout(()=>useSource({deviceId,name}),5000);
  }
}
function stopSource(){
  clearTimeout(retryTimer);processing=false;
  if(stream)stream.getTracks().forEach(track=>track.stop());
  stream=null;video.srcObject=null;video.style.display='none';canvas.style.display='none';
}
function applyOptions(next) {
  options = next;
  const a=options.appearance||{}, v=options.video||{};
  frame.style.borderColor=a.borderColor||'#fff'; frame.style.borderWidth=`${a.borderWidth||0}px`;
  frame.style.borderRadius=a.shape==='circle'?'50%':a.shape==='rounded'?`${a.radius||20}px`:'0';
  frame.style.clipPath=a.shape==='circle'?'circle(50% at 50% 50%)':'none';
  frame.style.filter=a.shadow?'drop-shadow(0 5px 7px #0006)':'none';
  frame.style.inset=a.shadow?'14px':'2px';
  frame.style.background=v.background==='remove'?'transparent':'#111';
  video.style.transform=v.mirror?'scaleX(-1)':'none'; canvas.style.transform=v.mirror?'scaleX(-1)':'none';
  video.style.objectFit='cover';
  if(v.background==='original'){canvas.style.display='none';video.style.display=stream?'block':'none';processing=false;}
  else {video.style.display='none';canvas.style.display=stream?'block':'none';startSegmentation();}
}
function startSegmentation(){
  if(!stream||processing)return;
  processing=true;
  if(!segmenter){
    segmenter=new SelfieSegmentation({locateFile:f=>`vendor/selfie_segmentation/${f}`});
    segmenter.setOptions({modelSelection:1,selfieMode:false});
    segmenter.onResults(drawResult);
  }
  processFrame();
}
async function processFrame(){
  if(!processing||!stream)return;
  try{await segmenter.send({image:video});}catch{}
  requestAnimationFrame(processFrame);
}
function drawResult(result){
  if(!video.videoWidth)return;
  if(canvas.width!==video.videoWidth){canvas.width=video.videoWidth;canvas.height=video.videoHeight;}
  const mode=options.video?.background;
  context.save();context.clearRect(0,0,canvas.width,canvas.height);
  drawCover(result.segmentationMask);
  context.globalCompositeOperation='source-in';drawCover(result.image);
  if(mode==='blur'){
    context.globalCompositeOperation='destination-over';context.filter=`blur(${options.video.blur||14}px)`;
    drawCover(result.image,20);context.filter='none';
  }
  context.restore();
}
function drawCover(image,extra=0){
  const iw=image.videoWidth||image.width, ih=image.videoHeight||image.height;
  const targetRatio=canvas.width/canvas.height, sourceRatio=iw/ih;
  let sx=0,sy=0,sw=iw,sh=ih;
  if(sourceRatio>targetRatio){sw=ih*targetRatio;sx=(iw-sw)/2;}else{sh=iw/targetRatio;sy=(ih-sh)/2;}
  context.drawImage(image,sx,sy,sw,sh,-extra,-extra,canvas.width+extra*2,canvas.height+extra*2);
}
window.desktop.onSourceChanged(source=>{selectedSource=source;if(overlayVisible)useSource(source);});
window.desktop.onOptionsChanged(applyOptions);
window.desktop.onVisibilityChanged(visible=>{const wasVisible=overlayVisible;overlayVisible=visible;if(visible&&!wasVisible)useSource(selectedSource);else if(!visible)stopSource();});
window.desktop.getState().then(state => {
  applyOptions(state);
  const sourceIndex=state.displayMode===1?state.activeSingleSource:index;
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
