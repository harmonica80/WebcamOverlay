(() => {
  const D = window.Decorations;
  const section = document.createElement('section');
  section.className = 'decoration-settings';
  section.innerHTML = `
    <h2>節慶與活動裝飾</h2>
    <div class="modes"><button type="button" data-deco-target="all" class="active">同步調整</button><button type="button" data-deco-target="0">攝影機 1</button><button type="button" data-deco-target="1">攝影機 2</button></div>
    <p id="decoScope" class="hint">只同步本次調整的裝飾項目，不影響影像與外觀設定。</p>
    <div class="deco-toolbar"><label><input id="decoEnabled" type="checkbox">開啟裝飾</label><label><input id="decoAnimated" type="checkbox" checked>播放動畫</label><button type="button" id="decoImport">匯入 PNG／APNG</button><button type="button" id="decoHelpButton">自製圖檔規格與教學</button></div>
    <div class="deco-settings-grid"><label>裝飾模式<select id="decoMode"><option value="frame">全畫面場景</option><option value="sticker">自由貼圖</option></select></label><label>不透明度<input id="decoOpacity" type="range" min="10" max="100" value="100"><output id="decoOpacityOut">100%</output></label></div>
    <div id="decoPresets" class="deco-presets" aria-label="10 款內建主題"></div>
    <div class="deco-settings-grid" id="decoSceneControls"><label>場景圖案大小<input id="decoSceneScale" type="range" min="50" max="180" value="100"><output id="decoSceneScaleOut">100%</output></label><label><input id="decoShowBorder" type="checkbox">加上細框線<p class="hint">預設無框線；大小不同的圖案搭配飄落、上升或閃爍效果。</p></label></div>
    <div class="deco-settings-grid" id="decoStickerControls" hidden><label>貼圖位置<select id="decoPosition"><option value="0-0">左上</option><option value="0-1">上方置中</option><option value="0-2">右上</option><option value="1-0">左側置中</option><option value="1-1">中央</option><option value="1-2">右側置中</option><option value="2-0">左下</option><option value="2-1">下方置中</option><option value="2-2" selected>右下</option></select></label><label>貼圖大小<input id="decoSize" type="range" min="10" max="100" value="30"><output id="decoSizeOut">30%</output></label></div>
    <p id="decoFile" class="deco-status"></p>
    <div id="decoPreview" class="deco-preview"><svg class="sample-person" viewBox="0 0 320 180" aria-hidden="true"><circle cx="160" cy="65" r="31" fill="#a5b4c8"/><path d="M84 180V148Q84 108 160 108Q236 108 236 148V180" fill="#a5b4c8"/></svg><div id="decoPreviewLayer" class="decoration-layer" hidden></div></div>
    <p class="deco-preview-label">裝飾示意預覽（非即時攝影機）；場景隨攝影機外形調整。放大圖案可能超出視窗邊緣。</p>
    <p id="decoMessage" class="deco-status" role="status" aria-live="polite"></p>
    <details id="decoHelp" class="deco-help"><summary>自製圖檔規格與教學</summary>
      <p>可用 Canva、PowerPoint 或繪圖軟體製作素材，再匯出為透明背景 PNG。若工具不支援透明匯出，請先移除背景；白色底圖不會自動變透明。</p>
      <table><thead><tr><th>用途</th><th>建議畫布</th><th>設計方式</th></tr></thead><tbody>
      <tr><td>矩形／圓角外框</td><td>1280 × 720 px（16:9）</td><td>裝飾放在四邊，中央約 70% 保持透明，讓老師的臉與手勢清楚可見。</td></tr>
      <tr><td>圓形外框</td><td>800 × 800 px（1:1）</td><td>沿圓周設計；中央及四角保持透明。自訂外框不會自動改成圓形。</td></tr>
      <tr><td>角落貼圖</td><td>512 × 512 px（1:1）</td><td>圖案四周留少量透明邊距，再用貼圖位置與大小調整。</td></tr>
      <tr><td>動態素材</td><td>APNG，建議 512 × 512 或 640 × 360 px</td><td>建議 10–15 fps、2–4 秒、循環播放。關閉「播放動畫」顯示預設靜態畫面。</td></tr>
      </tbody></table>
      <p><strong>匯入限制：</strong>PNG／APNG（.png 或 .apng），檔案最多 20 MB；寬、高各不超過 2048 px；動畫最多 120 格，畫布寬 × 高 × 格數不超過 6,400 萬像素。一般 PNG 只有靜態影像，勾選播放動畫不會自動產生動畫。</p>
      <ol><li>建立合適比例的透明畫布，放入圖案與正向可讀的文字。</li><li>匯出 PNG；動畫請用支援 APNG 的工具，設定無限循環。重新命名副檔名不會把 GIF 或影片變成 APNG。</li><li>點「匯入 PNG／APNG」，選擇全畫面場景或自由貼圖，查看預覽並調整位置、大小及透明度。</li><li>想下次啟動沿用時，勾選設定頁底部「記錄設定，下次啟動時自動套用」。</li></ol>
      <p>圖檔依比例完整顯示，不會拉伸。裝飾不受鏡像、亮度或去背影響，並限制在浮動視窗內；若素材被遮住，請把圖案往畫布內側移。內建 10 款主題皆可切換場景／貼圖及靜態／動畫。</p>
      <p>內建場景預設不畫框線，可調整圖案大小（50–180%），並保留各圖案的大小差異；櫻花花瓣及雪花會向下飄，氣球與愛心向上飄。取消「播放動畫」會顯示靜態構圖。自由貼圖大小可調 10–100%，適用內建與自訂圖片；百分比是圖片畫布占視窗的比例，透明邊距也包含在內。自訂圖檔的場景內容與框線請在製圖時設定。</p><p>新年燈籠搭配獅頭、飄落紅包及煙花；中秋月兔搭配流雲、桂花與輕躍月兔；畢業星光搭配拋起的學士帽、紙飛機與彩紙。這三款以插畫呈現，場景與自由貼圖皆可使用，中央保留給老師。</p>
      <p>匯入時會保存圖檔副本至設定資料夾的 decorations 子資料夾（通常為 EXE 旁 Data\\decorations）。搬移工具時請一起保留 Data。關閉記錄或重設設定會停止下次套用，但不會刪除已匯入素材。缺少或損壞的素材可重新匯入。</p>
    </details>`;
  const appearance = [...document.querySelectorAll('main > section')].find(s => s.querySelector('h2')?.textContent === '畫面與背景');
  appearance.after(section);
  const $ = id => document.getElementById(id);
  let target = 'all', state, timer, pending = {}, pendingTarget, queue = Promise.resolve(), importBusy = false;
  const renderer = D.createRenderer($('decoPreviewLayer'), id => window.desktop.loadDecoration(id), error => { if(error) $('decoMessage').textContent=error; });
  D.presets.forEach(p => {
    const button=document.createElement('button');button.type='button';button.className='deco-preset';button.dataset.preset=p.id;
    button.setAttribute('aria-pressed','false');button.innerHTML=D.svg(p.id,'sticker')+`<span>${p.name}</span>`;
    button.onclick=()=>save({preset:p.id,asset:'',assetName:'',enabled:true});$('decoPresets').append(button);
  });
  function selected() { return D.normalize(state?.decorations?.[target === 'all' ? 0 : Number(target)]); }
  function paint() {
    if(!state)return;
    const d=selected(), index=target==='all'?0:Number(target);
    const different=target==='all'&&JSON.stringify(D.normalize(state.decorations?.[0]))!==JSON.stringify(D.normalize(state.decorations?.[1]));
    $('decoScope').textContent=different?'兩台裝飾設定不同；預覽以攝影機 1 為準，只同步本次調整的項目。':target==='all'?'只同步本次調整的裝飾項目，不影響影像與外觀設定。':`以下裝飾只套用到攝影機 ${index+1}。`;
    $('decoEnabled').checked=d.enabled;$('decoAnimated').checked=d.animated;$('decoMode').value=d.mode;
    $('decoPosition').value=d.position;$('decoSize').value=d.size;$('decoOpacity').value=d.opacity;
    $('decoSizeOut').value=d.size+'%';$('decoOpacityOut').value=d.opacity+'%';$('decoStickerControls').hidden=d.mode!=='sticker';
    $('decoSceneControls').hidden=d.mode!=='frame'||!!d.asset;$('decoShowBorder').checked=d.showBorder;
    $('decoSceneScale').value=d.sceneScale;$('decoSceneScaleOut').value=d.sceneScale+'%';
    section.querySelectorAll('[data-preset]').forEach(b=>b.setAttribute('aria-pressed',String(!d.asset&&d.preset===b.dataset.preset)));
    $('decoFile').textContent=d.asset?`自訂圖檔：${d.assetName||'PNG／APNG'}（已保存副本）`:`內建主題：${D.presets.find(p=>p.id===d.preset).name}｜${d.animated?'動畫':'靜態'}`;
    const shape=state.sourceOptions?.[index]?.appearance?.shape||state.appearance?.shape||'rounded';
    $('decoPreview').classList.toggle('circle',shape==='circle');renderer.update(d,shape);
  }
  function save(changes, chosenTarget=target) {
    $('decoMessage').textContent='';
    queue=queue.then(async()=>{
      try {
        const result=await window.desktop.saveDecoration({target:chosenTarget,patch:changes});
        if(!result.ok)throw Error(result.message);
        state=result.state;if(!Object.keys(pending).length)paint();
      } catch(error) { $('decoMessage').textContent=error.message||'無法套用裝飾。'; }
    });
    return queue;
  }
  function flush() { clearTimeout(timer);if(Object.keys(pending).length){const changes=pending;pending={};save(changes,pendingTarget);} }
  section.querySelectorAll('[data-deco-target]').forEach(b=>b.onclick=()=>{
    flush();target=b.dataset.decoTarget;section.querySelectorAll('[data-deco-target]').forEach(item=>item.classList.toggle('active',item===b));paint();
  });
  for(const [id,key] of [['decoEnabled','enabled'],['decoAnimated','animated'],['decoMode','mode'],['decoPosition','position'],['decoShowBorder','showBorder']])$(id).onchange=()=>{flush();save({[key]:$(id).type==='checkbox'?$(id).checked:$(id).value});};
  for(const [id,key] of [['decoSize','size'],['decoOpacity','opacity'],['decoSceneScale','sceneScale']])$(id).oninput=()=>{
    $(id+'Out').value=$(id).value+'%';pendingTarget=target;pending[key]=Number($(id).value);clearTimeout(timer);timer=setTimeout(flush,70);
  };
  $('decoImport').onclick=async()=>{
    if(importBusy)return;flush();const chosenTarget=target;importBusy=true;$('decoImport').disabled=true;
    try {
      const result=await window.desktop.importDecoration();
      if(result.cancelled)return;if(!result.ok)throw Error(result.message);
      await save({asset:result.asset,assetName:result.assetName,enabled:true,animated:result.animated},chosenTarget);
      $('decoMessage').textContent=`已匯入 ${result.width} × ${result.height} px${result.animated?`，${result.frames} 格動畫`:' 靜態圖片'}。`;
    } catch(error){$('decoMessage').textContent=error.message||'匯入失敗，請重試。';}
    finally{importBusy=false;$('decoImport').disabled=false;}
  };
  $('decoHelpButton').onclick=()=>{$('decoHelp').open=true;$('decoHelp').scrollIntoView({block:'start',behavior:'smooth'});$('decoHelp').querySelector('summary').focus();};
  window.desktop.onStateChanged(s=>{state=s;if(!Object.keys(pending).length)paint();});
  window.desktop.getState().then(s=>{state=s;paint();});
  window.addEventListener('pagehide',()=>{flush();renderer.dispose();});
})();
