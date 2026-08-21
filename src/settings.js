const selects = [document.getElementById('source1'), document.getElementById('source2')];
const status = document.getElementById('status');
let state;
let appearanceTarget = 'all';
function arrangeSectionOrder(){
  const quickPosition=document.querySelector('.quickPosition');
  const appearance=[...document.querySelectorAll('main > section')].find(section=>section.querySelector(':scope > h2')?.textContent==='畫面與背景');
  if(quickPosition&&appearance)appearance.after(quickPosition);
}
arrangeSectionOrder();
function initializeAccordion(){
  const sections=[...document.querySelectorAll('main > section')];
  const setExpanded=(section,expanded)=>{
    section.classList.toggle('collapsed',!expanded);
    section.querySelector('.accordionToggle').setAttribute('aria-expanded',String(expanded));
    section.querySelector('.accordionContent').hidden=!expanded;
  };
  sections.forEach((section,index)=>{
    const heading=section.querySelector(':scope > h2');
    if(!heading)return;
    const title=heading.textContent;
    const content=document.createElement('div');
    content.className='accordionContent';
    content.id=`accordion-content-${index}`;
    while(heading.nextSibling)content.append(heading.nextSibling);
    const toggle=document.createElement('button');
    toggle.type='button';toggle.className='accordionToggle';toggle.setAttribute('aria-controls',content.id);
    const label=document.createElement('span');label.textContent=title;
    const arrow=document.createElement('span');arrow.className='accordionArrow';arrow.setAttribute('aria-hidden','true');
    toggle.append(label,arrow);heading.replaceChildren(toggle);heading.className='accordionHeading';section.append(content);
    toggle.onclick=()=>{
      const opening=section.classList.contains('collapsed');
      if(opening)sections.forEach(item=>setExpanded(item,false));
      setExpanded(section,opening);
    };
    setExpanded(section,index===0);
  });
}
initializeAccordion();
document.getElementById('developerLink').onclick=()=>window.desktop.openExternal('https://harmonica80.blogspot.com/');
const updateButton=document.getElementById('checkUpdates');
const versionStatus=document.getElementById('versionStatus');
async function checkUpdates(){
  updateButton.disabled=true;updateButton.textContent='正在檢查…';versionStatus.textContent='正在連線至 GitHub';
  showUpdateResult(await window.desktop.checkForUpdates());
}
function showUpdateResult(result){
  updateButton.disabled=false;
  if(!result.ok){updateButton.textContent='重新檢查';versionStatus.textContent=`目前版本 v${result.currentVersion}　${result.message}`;updateButton.onclick=checkUpdates;return;}
  if(result.updateAvailable){
    updateButton.textContent=`下載新版本 v${result.latestVersion}`;
    versionStatus.textContent=`目前版本 v${result.currentVersion}，已有新版本可下載。`;
    updateButton.onclick=()=>window.desktop.openExternal(result.downloadUrl);
  }else if(result.versionRelation==='local-newer'){
    updateButton.textContent='再次檢查';
    versionStatus.textContent=`目前版本 v${result.currentVersion}，高於 GitHub 最新公開版 v${result.latestVersion}。`;
    updateButton.onclick=checkUpdates;
  }else{
    updateButton.textContent='再次檢查';versionStatus.textContent=`目前版本 v${result.currentVersion}，已是最新版本。`;
    updateButton.onclick=checkUpdates;
  }
}
updateButton.onclick=checkUpdates;
window.desktop.onUpdateCheckResult(showUpdateResult);
document.querySelector('.quickPosition .accordionContent')?.insertAdjacentHTML('afterbegin','<div class="actions quickWindowAction"><button type="button" id="openQuickPosition" class="primary">開啟快速排列小視窗</button></div>');
document.getElementById('openQuickPosition')?.addEventListener('click',()=>window.desktop.openQuickPosition());
let positionSource=0;
const positionStatus=document.getElementById('positionStatus');
document.querySelectorAll('[data-position-source]').forEach(button=>button.onclick=()=>{
  positionSource=Number(button.dataset.positionSource);
  document.querySelectorAll('[data-position-source]').forEach(item=>item.classList.toggle('active',item===button));
});
document.querySelectorAll('[data-position]').forEach(button=>button.onclick=()=>{
  window.desktop.positionOverlay({sourceIndex:positionSource,position:button.dataset.position});
  positionStatus.textContent=`已將攝影機 ${positionSource+1} 移到${button.title}。`;
});
document.querySelectorAll('[data-layout]').forEach(button=>button.onclick=()=>{
  window.desktop.arrangeOverlays(button.dataset.layout);
  positionStatus.textContent=`已套用「${button.textContent.trim()}」排列並顯示兩個攝影機。`;
});

function option(value, text) { const o=document.createElement('option'); o.value=value; o.textContent=text; return o; }
function fillSourceSelects(devices) {
  selects.forEach((select,i)=>{
    const wanted=state?.sources?.[i]||select.value;
    select.replaceChildren(option('', '不指定'));
    devices.forEach((device,n)=>select.append(option(device.deviceId,device.label||`攝影機 ${n+1}`)));
    if(wanted&&![...select.options].some(item=>item.value===wanted)){
      select.append(option(wanted,state?.sourceNames?.[i]||`原有攝影機 ${i+1}`));
    }
    select.value=wanted;
  });
}
async function videoInputs(){
  return (await navigator.mediaDevices.enumerateDevices()).filter(device=>device.kind==='videoinput');
}
async function detect() {
  status.textContent='正在偵測攝影機…';
  let devices=[];
  try {
    devices=await videoInputs();
    if(!devices.length||devices.every(device=>!device.label)){
      const probe=await navigator.mediaDevices.getUserMedia({video:true,audio:false});
      probe.getTracks().forEach(track=>track.stop());
      devices=await videoInputs();
    }
    fillSourceSelects(devices);
    status.textContent=`找到 ${devices.length} 個攝影機來源。`;
  } catch(error) {
    console.error('Camera detection failed',error);
    try{devices=await videoInputs();}catch{}
    fillSourceSelects(devices);
    status.textContent=devices.length
      ?`找到 ${devices.length} 個攝影機來源。`
      :state?.sources?.some(Boolean)
        ?'目前無法重新偵測，已保留原有攝影機來源。'
        :'無法取得攝影機清單，請檢查 Windows 攝影機權限。';
  }
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
  const selected = appearanceTarget === 'all' ? s : (s.sourceOptions?.[Number(appearanceTarget)] || s);
  const values={...selected.appearance,...selected.video};
  controls.forEach(id=>{const e=document.getElementById(id);if(e.type==='checkbox')e.checked=!!values[id];else e.value=values[id]??e.value;});
  document.getElementById('borderWidthOut').value=`${values.borderWidth||0}px`;
  document.getElementById('radiusOut').value=`${values.radius||0}px`;
  document.getElementById('blurOut').value=`${values.blur||14}px`;
  const h=s.hotkeys||{};
  setHotkey(document.getElementById('hkCycle'),h.cycle||'');setHotkey(document.getElementById('hkHide'),h.hide||'');
  setHotkey(document.getElementById('hkOne'),h.one||'');setHotkey(document.getElementById('hkTwo'),h.two||'');setHotkey(document.getElementById('hkSwap'),h.swap||'');
}
function sendOptions(){
  window.desktop.saveOptions({target:appearanceTarget,appearance:{shape:document.getElementById('shape').value,borderColor:document.getElementById('borderColor').value,borderWidth:Number(document.getElementById('borderWidth').value),radius:Number(document.getElementById('radius').value),shadow:document.getElementById('shadow').checked},video:{background:document.getElementById('background').value,blur:Number(document.getElementById('blur').value),mirror:document.getElementById('mirror').checked}});
}
document.querySelectorAll('[data-appearance-target]').forEach(button=>button.onclick=()=>{
  appearanceTarget=button.dataset.appearanceTarget;
  document.querySelectorAll('[data-appearance-target]').forEach(item=>item.classList.toggle('active',item===button));
  document.getElementById('appearanceScopeHint').textContent=appearanceTarget==='all'?'以下設定會同步套用到兩個攝影機。':`以下設定只套用到攝影機 ${Number(appearanceTarget)+1}。`;
  if(state)fillOptions(state);
});
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
window.desktop.getState().then(s=>{state=s;paintMode(s.displayMode);fillOptions(s);fillSourceSelects([]);versionStatus.textContent=`目前版本 v${s.appVersion}`;detect();checkUpdates();});
