const selects = [document.getElementById('source1'), document.getElementById('source2')];
const status = document.getElementById('status');
let state;
document.getElementById('developerLink').onclick=()=>window.desktop.openExternal('https://harmonica80.blogspot.com/');

function option(value, text) { const o=document.createElement('option'); o.value=value; o.textContent=text; return o; }
async function detect() {
  status.textContent='正在偵測攝影機…';
  try {
    const probe=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
    probe.getTracks().forEach(t=>t.stop());
    const devices=(await navigator.mediaDevices.enumerateDevices()).filter(d=>d.kind==='videoinput');
    selects.forEach((select,i)=>{
      const wanted=state?.sources?.[i]||select.value;
      select.replaceChildren(option('', '不指定'));
      devices.forEach((d,n)=>select.append(option(d.deviceId,d.label||`攝影機 ${n+1}`)));
      select.value=wanted;
    });
    status.textContent=`找到 ${devices.length} 個攝影機來源。`;
  } catch(e) { status.textContent='無法取得攝影機清單，請檢查 Windows 攝影機權限。'; }
}
function paintMode(mode){document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',Number(b.dataset.mode)===mode));}
document.getElementById('detect').onclick=detect;
document.getElementById('save').onclick=()=>{
  const sources=selects.map(s=>s.value), sourceNames=selects.map((s,i)=>s.selectedOptions[0]?.textContent||`攝影機 ${i+1}`);
  if(sources[0]&&sources[0]===sources[1]){status.textContent='來源 1 與來源 2 請選擇不同的攝影機。';return;}
  window.desktop.saveSources({sources,sourceNames}); status.textContent='來源設定已套用。';
};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>window.desktop.setMode(Number(b.dataset.mode)));
window.desktop.onStateChanged(s=>{state=s;paintMode(s.displayMode);});
const controls=['shape','background','borderColor','borderWidth','radius','blur','mirror','shadow'];
function fillOptions(s){
  const values={...s.appearance,...s.video};
  controls.forEach(id=>{const e=document.getElementById(id);if(e.type==='checkbox')e.checked=!!values[id];else e.value=values[id]??e.value;});
  document.getElementById('borderWidthOut').value=`${values.borderWidth||0}px`;
  document.getElementById('radiusOut').value=`${values.radius||0}px`;
  document.getElementById('blurOut').value=`${values.blur||14}px`;
  const h=s.hotkeys||{};
  setHotkey(document.getElementById('hkCycle'),h.cycle||'');setHotkey(document.getElementById('hkHide'),h.hide||'');
  setHotkey(document.getElementById('hkOne'),h.one||'');setHotkey(document.getElementById('hkTwo'),h.two||'');setHotkey(document.getElementById('hkSwap'),h.swap||'');
}
function sendOptions(){
  window.desktop.saveOptions({appearance:{shape:document.getElementById('shape').value,borderColor:document.getElementById('borderColor').value,borderWidth:Number(document.getElementById('borderWidth').value),radius:Number(document.getElementById('radius').value),shadow:document.getElementById('shadow').checked},video:{background:document.getElementById('background').value,blur:Number(document.getElementById('blur').value),mirror:document.getElementById('mirror').checked}});
}
let optionTimer;
controls.forEach(id=>{const e=document.getElementById(id);e.addEventListener(e.type==='range'?'input':'change',()=>{if(['borderWidth','radius','blur'].includes(id))document.getElementById(`${id}Out`).value=`${e.value}px`;clearTimeout(optionTimer);optionTimer=setTimeout(sendOptions,40);});});
document.querySelectorAll('.colorSwatch').forEach(button=>{
  button.style.background=button.dataset.color;
  button.onclick=()=>{document.getElementById('borderColor').value=button.dataset.color;sendOptions();};
});
function acceleratorFromEvent(event){
  const modifiers=[];
  if(event.ctrlKey)modifiers.push('Ctrl');if(event.altKey)modifiers.push('Alt');if(event.shiftKey)modifiers.push('Shift');if(event.metaKey)modifiers.push('Super');
  const ignored=['Control','Alt','Shift','Meta'];if(ignored.includes(event.key))return '';
  let key=event.key.length===1?event.key.toUpperCase():event.key;
  const names={ArrowUp:'Up',ArrowDown:'Down',ArrowLeft:'Left',ArrowRight:'Right',' ':'Space',Escape:'Esc'};key=names[key]||key;
  return [...modifiers,key].join('+');
}
function setHotkey(element,value){
  value=(value||'').replace(/CommandOrControl/gi,'Ctrl');
  element.dataset.value=value;
  element.replaceChildren();
  const parts=value.split('+').filter(Boolean);
  parts.forEach((part,i)=>{
    if(i){const plus=document.createElement('span');plus.className='keyPlus';plus.textContent='+';element.append(plus);}
    const key=document.createElement('span');key.className='keyCap';key.textContent=part;element.append(key);
  });
}
document.querySelectorAll('.hotkeyCapture').forEach(input=>{
  input.onfocus=()=>{input.dataset.previous=input.dataset.value||'';input.textContent='請按下快速鍵…';};
  input.onkeydown=event=>{event.preventDefault();event.stopPropagation();const value=acceleratorFromEvent(event);if(value){setHotkey(input,value);input.blur();}};
  input.onblur=()=>{if(input.textContent==='請按下快速鍵…')setHotkey(input,input.dataset.previous||'');};
});
document.getElementById('saveHotkeys').onclick=async()=>{
  const result=await window.desktop.saveHotkeys({cycle:document.getElementById('hkCycle').dataset.value,hide:document.getElementById('hkHide').dataset.value,one:document.getElementById('hkOne').dataset.value,two:document.getElementById('hkTwo').dataset.value,swap:document.getElementById('hkSwap').dataset.value});
  document.getElementById('hotkeyStatus').textContent=result.message;
};
window.desktop.getState().then(s=>{state=s;paintMode(s.displayMode);fillOptions(s);detect();});
