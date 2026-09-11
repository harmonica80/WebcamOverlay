const mode=document.getElementById('arrangeMode');
const source=document.getElementById('cameraSource');
const singlePanel=document.getElementById('singlePanel');
const dualPanel=document.getElementById('dualPanel');
const cameraChoice=document.getElementById('cameraChoice');
const alwaysOnTop=document.getElementById('alwaysOnTop');
const toggleCollapse=document.getElementById('toggleCollapse');
let collapsed=false;
const customSelectControls=[];

function enhanceSelect(select){
  select.classList.add('nativeSelectFallback');
  const wrapper=document.createElement('div');
  wrapper.className='customSelect';
  const trigger=document.createElement('button');
  trigger.type='button';
  trigger.className='customSelectButton';
  trigger.setAttribute('aria-haspopup','listbox');
  trigger.setAttribute('aria-expanded','false');
  trigger.setAttribute('aria-label',select.getAttribute('aria-label')||'選擇項目');
  const triggerText=document.createElement('span');
  trigger.appendChild(triggerText);
  const menu=document.createElement('div');
  menu.className='customSelectMenu';
  menu.setAttribute('role','listbox');
  menu.hidden=true;

  const optionButtons=Array.from(select.options,option=>{
    const button=document.createElement('button');
    button.type='button';
    button.className='customSelectOption';
    button.setAttribute('role','option');
    button.dataset.value=option.value;
    button.textContent=option.textContent;
    button.onclick=()=>{
      control.close();
      select.value=option.value;
      control.sync();
      select.dispatchEvent(new Event('change',{bubbles:true}));
      trigger.focus();
    };
    menu.appendChild(button);
    return button;
  });

  wrapper.append(trigger,menu);
  select.insertAdjacentElement('afterend',wrapper);

  const control={
    close(){
      menu.hidden=true;
      wrapper.classList.remove('open');
      trigger.setAttribute('aria-expanded','false');
    },
    open(focusOption=false){
      customSelectControls.forEach(item=>{if(item!==control)item.close();});
      menu.hidden=false;
      wrapper.classList.add('open');
      trigger.setAttribute('aria-expanded','true');
      if(focusOption){
        (optionButtons.find(button=>button.dataset.value===select.value)||optionButtons[0])?.focus();
      }
    },
    sync(){
      const selected=Array.from(select.options).find(option=>option.value===select.value)||select.options[0];
      triggerText.textContent=selected?.textContent||'';
      optionButtons.forEach(button=>{
        const active=button.dataset.value===select.value;
        button.classList.toggle('selected',active);
        button.setAttribute('aria-selected',String(active));
      });
    }
  };

  trigger.onclick=event=>{
    event.stopPropagation();
    menu.hidden?control.open():control.close();
  };
  trigger.onkeydown=event=>{
    if(['ArrowDown','ArrowUp','Enter',' '].includes(event.key)){
      event.preventDefault();
      control.open(true);
    }
  };
  menu.onkeydown=event=>{
    const current=optionButtons.indexOf(document.activeElement);
    if(event.key==='Escape'){
      event.preventDefault();control.close();trigger.focus();return;
    }
    let next=current;
    if(event.key==='ArrowDown')next=Math.min(optionButtons.length-1,current+1);
    else if(event.key==='ArrowUp')next=Math.max(0,current-1);
    else if(event.key==='Home')next=0;
    else if(event.key==='End')next=optionButtons.length-1;
    else return;
    event.preventDefault();optionButtons[next]?.focus();
  };
  control.sync();
  customSelectControls.push(control);
  return control;
}

const modeControl=enhanceSelect(mode);
const sourceControl=enhanceSelect(source);
document.addEventListener('pointerdown',event=>{
  if(!event.target.closest('.customSelect'))customSelectControls.forEach(control=>control.close());
});

function savePanelState(){window.desktop.saveQuickPanelState({mode:mode.value,sourceIndex:Number(source.value)});}
function paintMode(){
  customSelectControls.forEach(control=>control.close());
  const single=mode.value==='single';
  singlePanel.hidden=!single;dualPanel.hidden=single;cameraChoice.hidden=!single;
  savePanelState();
}
function paintCollapsed(next){
  customSelectControls.forEach(control=>control.close());
  collapsed=!!next;
  document.body.classList.toggle('collapsed',collapsed);
  toggleCollapse.textContent=collapsed?'▾':'−';
  toggleCollapse.title=collapsed?'展開設定':'折疊設定';
  toggleCollapse.setAttribute('aria-label',toggleCollapse.title);
}
mode.onchange=paintMode;
source.onchange=savePanelState;
document.querySelectorAll('[data-position]').forEach(button=>button.onclick=()=>{
  window.desktop.quickPositionSingle({sourceIndex:Number(source.value),position:button.dataset.position});
});
document.querySelectorAll('[data-layout]').forEach(button=>button.onclick=()=>{
  window.desktop.arrangeOverlays(button.dataset.layout);
});
alwaysOnTop.onchange=()=>window.desktop.setQuickPanelTop(alwaysOnTop.checked);
document.getElementById('openSettings').onclick=()=>window.desktop.openSettings();
toggleCollapse.onclick=()=>{
  paintCollapsed(!collapsed);
  window.desktop.setQuickPanelCollapsed(collapsed);
};
document.getElementById('closeWindow').onclick=()=>window.desktop.closeQuickPosition();
window.desktop.getState().then(state=>{
  mode.value=state.quickPanel?.mode==='dual'?'dual':'single';
  source.value=String(state.quickPanel?.sourceIndex===1?1:0);
  modeControl.sync();
  sourceControl.sync();
  alwaysOnTop.checked=state.quickPanel?.alwaysOnTop!==false;
  paintCollapsed(state.quickPanel?.collapsed===true);
  paintMode();
});
