const selects = [document.getElementById('source1'), document.getElementById('source2')];
const resolutionSelects = [document.getElementById('resolution1'), document.getElementById('resolution2')];
const status = document.getElementById('status');
let state;
let appearanceTarget = 'all';
let detectedDevices = [];
const resolutionCandidates = [[3840,2160],[2560,1440],[1920,1080],[1600,1200],[1600,900],[1280,960],[1280,720],[960,540],[800,600],[640,480],[640,360],[320,240]];
const resolutionProbeTokens = [0, 0];
function setResolutionOptions(index, values, selected='auto', hint='') {
  const select=resolutionSelects[index];
  select.replaceChildren(option('auto','自動（優先 1280 × 720）'));
  [...new Map(values.map(size=>[`${size.width}x${size.height}`,size])).values()].sort((a,b)=>(b.width*b.height)-(a.width*a.height)).forEach(size=>select.append(option(`${size.width}x${size.height}`,`${size.width} × ${size.height}`)));
  if(selected!=='auto'&&![...select.options].some(item=>item.value===selected))select.append(option(selected,`${selected.replace('x',' × ')}（目前設定）`));
  select.value=selected;
  select.disabled=!selects[index].value;
  document.getElementById(`resolutionHint${index+1}`).textContent=hint;
}
async function detectResolutions(index, deviceId, preferred='auto') {
  const token=++resolutionProbeTokens[index];
  if(!deviceId){setResolutionOptions(index,[],'auto','選擇攝影機後偵測解析度。');return;}
  setResolutionOptions(index,[],'auto','正在偵測此攝影機支援的常見解析度…');
  let supported=[];
  let capability=null;
  let probe;
  try {
    probe=await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:deviceId},width:{ideal:1280},height:{ideal:720}},audio:false});
    const track=probe.getVideoTracks()[0];
    capability=track.getCapabilities?.()||null;
    const current=track.getSettings?.();
    if(current?.width&&current?.height)supported.push({width:current.width,height:current.height});
    for(const [width,height] of resolutionCandidates){
      if(token!==resolutionProbeTokens[index])return;
      if(capability?.width&&(width<capability.width.min||width>capability.width.max))continue;
      if(capability?.height&&(height<capability.height.min||height>capability.height.max))continue;
      try{
        await track.applyConstraints({width:{exact:width},height:{exact:height}});
        const actual=track.getSettings?.();
        if(actual?.width===width&&actual?.height===height)supported.push({width,height});
      }catch{}
    }
  } catch(error) { console.warn('Unable to inspect camera capabilities',error); }
  finally{probe?.getTracks().forEach(item=>item.stop());}
  if(token!==resolutionProbeTokens[index])return;
  setResolutionOptions(index,supported,preferred,supported.length?'只列出已成功測試的常見解析度。無法偵測時仍可使用自動模式。':'未能列出可測解析度；仍可使用自動模式。');
}
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
    const wanted=state?.sources?.[i]??select.value;
    select.replaceChildren(option('', '不指定'));
    devices.forEach((device,n)=>select.append(option(device.deviceId,device.label||`攝影機 ${n+1}`)));
    if(wanted&&![...select.options].some(item=>item.value===wanted)){
      select.append(option(wanted,state?.sourceNames?.[i]||`原有攝影機 ${i+1}`));
    }
    select.value=wanted;
    if(resolutionSelects[i])resolutionSelects[i].disabled=!wanted;
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
    detectedDevices=devices;
    selects.forEach((select,i)=>detectResolutions(i,select.value,state?.sourceResolutions?.[i]||'auto'));
    status.textContent=`找到 ${devices.length} 個攝影機來源。`;
  } catch(error) {
    console.error('Camera detection failed',error);
    try{devices=await videoInputs();}catch{}
    detectedDevices=devices;
    fillSourceSelects(devices);
    selects.forEach((select,i)=>detectResolutions(i,select.value,state?.sourceResolutions?.[i]||'auto'));
    status.textContent=devices.length
      ?`找到 ${devices.length} 個攝影機來源。`
      :state?.sources?.some(Boolean)
        ?'目前無法重新偵測，已保留原有攝影機來源。'
        :'無法取得攝影機清單，請檢查 Windows 攝影機權限。';
  }
}
function paintMode(mode){document.querySelectorAll('[data-mode]').forEach(b=>b.classList.toggle('active',Number(b.dataset.mode)===mode));}
document.getElementById('detect').onclick=async()=>{await detect();selects.forEach((select,i)=>detectResolutions(i,select.value,state?.sourceResolutions?.[i]||'auto'));};
selects.forEach((select,index)=>select.addEventListener('change',()=>detectResolutions(index,select.value,'auto')));
document.getElementById('save').onclick=()=>{
  const sources=selects.map(s=>s.value), sourceNames=selects.map((s,i)=>s.selectedOptions[0]?.textContent||`攝影機 ${i+1}`);
  if(sources[0]&&sources[0]===sources[1]){status.textContent='來源 1 與來源 2 請選擇不同的攝影機。';return;}
  const resolutions=resolutionSelects.map((s,i)=>sources[i]?s.value:'auto');
  window.desktop.saveSources({sources,sourceNames,resolutions}); status.textContent='來源與解析度設定已套用。';
};
document.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>window.desktop.setMode(Number(b.dataset.mode)));
window.desktop.onStateChanged(s=>{state=s;paintRememberSettings(s);paintMode(s.displayMode);});
const imageDefaults={brightness:100,contrast:100,saturation:100,hue:0};
const controls=[...Object.keys(imageDefaults),'shape','background','borderColor','borderWidth','radius','blur','mirror','shadow','backgroundImage','virtualType','backgroundColor','matteQuality','matteEdge','matteFeather','matteStability'];
function updateMatteControls(){
  const original=document.getElementById('background').value==='original';
  document.getElementById('matteQuality').disabled=original;
  const active=document.getElementById('background').value==='virtual';
  document.getElementById('virtualBackgroundRow').hidden=!active;
  const type=document.getElementById('virtualType').value;
  document.getElementById('sceneBackgroundRow').hidden=!active||type!=='scene';
  document.getElementById('solidBackgroundRow').hidden=!active||type!=='solid';
  document.getElementById('customBackgroundRow').hidden=!active||type!=='custom';
  const disabled=original||document.getElementById('matteQuality').value!=='quality';
  ['matteEdge','matteFeather','matteStability'].forEach(id=>document.getElementById(id).disabled=disabled);
}
function fillOptions(s){
  const selected = appearanceTarget === 'all' ? s : (s.sourceOptions?.[Number(appearanceTarget)] || s);
  const values={...imageDefaults,matteQuality:'quality',matteEdge:15,matteFeather:25,matteStability:40,...selected.appearance,...selected.video};
  controls.forEach(id=>{const e=document.getElementById(id);if(e.type==='checkbox')e.checked=!!values[id];else e.value=values[id]??e.value;});
  document.getElementById('borderWidthOut').value=`${values.borderWidth||0}px`;
  document.getElementById('radiusOut').value=`${values.radius||0}px`;
  document.getElementById('blurOut').value=`${values.blur||14}px`;
  ['matteEdge','matteFeather','matteStability'].forEach(id=>document.getElementById(`${id}Out`).value=`${values[id]}%`);
  updateMatteControls();
  Object.keys(imageDefaults).forEach(id=>document.getElementById(`${id}Out`).value=`${values[id]}${id==='hue'?'°':'%'}`);
  const h=s.hotkeys||{};
  setHotkey(document.getElementById('hkCycle'),h.cycle||'');setHotkey(document.getElementById('hkHide'),h.hide||'');
  setHotkey(document.getElementById('hkOne'),h.one||'');setHotkey(document.getElementById('hkTwo'),h.two||'');setHotkey(document.getElementById('hkSwap'),h.swap||'');
}
function sendOptions(){
  updateMatteControls();
  window.desktop.saveOptions({target:appearanceTarget,appearance:{shape:document.getElementById('shape').value,borderColor:document.getElementById('borderColor').value,borderWidth:Number(document.getElementById('borderWidth').value),radius:Number(document.getElementById('radius').value),shadow:document.getElementById('shadow').checked},video:{...Object.fromEntries(Object.keys(imageDefaults).map(id=>[id,Number(document.getElementById(id).value)])),matteQuality:document.getElementById('matteQuality').value,matteEdge:Number(document.getElementById('matteEdge').value),matteFeather:Number(document.getElementById('matteFeather').value),matteStability:Number(document.getElementById('matteStability').value),background:document.getElementById('background').value,backgroundImage:document.getElementById('backgroundImage').value,virtualType:document.getElementById('virtualType').value,backgroundColor:document.getElementById('backgroundColor').value,backgroundData:state?.sourceOptions?.[appearanceTarget==='1'?1:0]?.video?.backgroundData||'',blur:Number(document.getElementById('blur').value),mirror:document.getElementById('mirror').checked}});
}
document.querySelectorAll('[data-appearance-target]').forEach(button=>button.onclick=()=>{
  if(optionTimer){clearTimeout(optionTimer);optionTimer=null;sendOptions();}
  appearanceTarget=button.dataset.appearanceTarget;
  document.querySelectorAll('[data-appearance-target]').forEach(item=>item.classList.toggle('active',item===button));
  document.getElementById('appearanceScopeHint').textContent=appearanceTarget==='all'?'以下設定會同步套用到兩個攝影機。':`以下設定只套用到攝影機 ${Number(appearanceTarget)+1}。`;
  if(state)fillOptions(state);
});
let optionTimer;
controls.forEach(id=>{const e=document.getElementById(id);e.addEventListener(e.type==='range'?'input':'change',()=>{if(['borderWidth','radius','blur'].includes(id))document.getElementById(`${id}Out`).value=`${e.value}px`;if(id in imageDefaults)document.getElementById(`${id}Out`).value=`${e.value}${id==='hue'?'°':'%'}`;if(id.startsWith('matte')&&id!=='matteQuality')document.getElementById(`${id}Out`).value=`${e.value}%`;clearTimeout(optionTimer);optionTimer=setTimeout(()=>{optionTimer=null;sendOptions();},40);});});
document.getElementById('resetImageAdjustments').onclick=()=>{
  clearTimeout(optionTimer);optionTimer=null;
  Object.entries(imageDefaults).forEach(([id,value])=>{document.getElementById(id).value=value;document.getElementById(`${id}Out`).value=`${value}${id==='hue'?'°':'%'}`;});
  sendOptions();
};

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
const rememberSettings=document.getElementById('rememberSettings');
function paintRememberSettings(s){
  rememberSettings.checked=s.rememberSettings===true;
  document.getElementById('rememberHint').textContent=s.rememberSettings
    ?'已開啟記錄，設定變更會自動保存並於下次啟動套用。'
    :'不記錄本次設定；下次啟動使用預設值。';
}
rememberSettings.onchange=async()=>{
  rememberSettings.disabled=true;
  try{
    const result=await window.desktop.setRememberSettings(rememberSettings.checked);
    if(result.ok){state=result.state;paintRememberSettings(state);resetStatus.textContent='';}
    else{paintRememberSettings(state);resetStatus.textContent=result.message;}
  }catch{paintRememberSettings(state);resetStatus.textContent='無法變更記錄選項，請再試一次。';}
  finally{rememberSettings.disabled=false;}
};
const resetButton=document.getElementById('resetSettings');
const resetStatus=document.getElementById('resetStatus');
resetButton.onclick=async()=>{
  resetButton.disabled=true;
  resetStatus.textContent='';
  try{
    const result=await window.desktop.resetSettings();
    if(!result?.ok)return;
    state=result.state;
    paintRememberSettings(state);
    appearanceTarget='all';
    document.querySelectorAll('[data-appearance-target]').forEach(button=>button.classList.toggle('active',button.dataset.appearanceTarget==='all'));
    document.getElementById('appearanceScopeHint').textContent='以下設定會同步套用到兩個攝影機。';
    paintMode(state.displayMode);
    fillOptions(state);
    fillSourceSelects(detectedDevices);
    resolutionSelects.forEach((_,i)=>detectResolutions(i,'','auto'));
    status.textContent='攝影機來源已重設為不指定。';
    document.getElementById('hotkeyStatus').textContent='快速鍵已恢復為預設值。';
    resetStatus.textContent=result.message;
  }finally{
    resetButton.disabled=false;
  }
};
window.desktop.getState().then(s=>{state=s;paintRememberSettings(s);paintMode(s.displayMode);fillOptions(s);fillSourceSelects([]);resolutionSelects.forEach((_,i)=>setResolutionOptions(i,[],'auto','選擇攝影機後偵測解析度。'));versionStatus.textContent=`目前版本 v${s.appVersion}`;detect().then(()=>selects.forEach((select,i)=>detectResolutions(i,select.value,s.sourceResolutions?.[i]||'auto')));checkUpdates();});

document.getElementById('restartOverlays').onclick=async()=>{
  const button=document.getElementById('restartOverlays');button.disabled=true;
  try { const result=await window.desktop.restartOverlays();document.getElementById('recoveryStatus').textContent=result.message||'無法重新啟動。'; }
  catch { document.getElementById('recoveryStatus').textContent='重新啟動失敗，請保留診斷紀錄。'; }
  finally { setTimeout(()=>{button.disabled=false;},2000); }
};
document.getElementById('openDiagnostics').onclick=()=>window.desktop.openDiagnostics();

document.getElementById('importBackground').onclick=()=>document.getElementById('backgroundFile').click();
document.getElementById('backgroundFile').onchange=()=>{const file=document.getElementById('backgroundFile').files?.[0];if(!file)return;if(file.size>8*1024*1024){document.getElementById('customBackgroundName').textContent='圖片請小於 8 MB。';return;}const reader=new FileReader();reader.onload=()=>{document.getElementById('customBackgroundName').textContent=file.name;window.desktop.saveOptions({target:appearanceTarget,appearance:{},video:{backgroundData:reader.result,virtualType:'custom',background:'virtual'}});document.getElementById('background').value='virtual';document.getElementById('virtualType').value='custom';updateMatteControls();};reader.readAsDataURL(file);};

