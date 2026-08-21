const mode=document.getElementById('arrangeMode');
const source=document.getElementById('cameraSource');
const singlePanel=document.getElementById('singlePanel');
const dualPanel=document.getElementById('dualPanel');
const cameraChoice=document.getElementById('cameraChoice');
const alwaysOnTop=document.getElementById('alwaysOnTop');
const toggleCollapse=document.getElementById('toggleCollapse');
let collapsed=false;

function savePanelState(){window.desktop.saveQuickPanelState({mode:mode.value,sourceIndex:Number(source.value)});}
function paintMode(){
  const single=mode.value==='single';
  singlePanel.hidden=!single;dualPanel.hidden=single;cameraChoice.hidden=!single;
  savePanelState();
}
function paintCollapsed(next){
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
  alwaysOnTop.checked=state.quickPanel?.alwaysOnTop!==false;
  paintCollapsed(state.quickPanel?.collapsed===true);
  paintMode();
});
