const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),path=require('path');
const D=require('../src/decoration'),F=require('../src/decoration-files'),{png,chunk}=require('./decoration-fixtures');
test('decoration defaults are opt-in and bounded; asset references cannot escape storage',()=>{
  assert.equal(D.normalize().enabled,false);
  assert.equal(D.normalize({size:999,opacity:0}).size,100);assert.equal(D.normalize({opacity:0}).opacity,10);
  assert.equal(D.normalize({size:-1}).size,10);assert.equal(D.normalize({sceneScale:999}).sceneScale,180);
  assert.equal(D.normalize({sceneScale:1}).sceneScale,50);assert.equal(D.normalize().showBorder,false);
  assert.equal(D.normalize({asset:'../settings.json',preset:'<script>',position:'9-9'}).asset,'');
  assert.throws(()=>F.assetPath('/safe','../settings.json'));
});
test('borderless varied scenes retain optional outlines and circular geometry',()=>{
  for(const p of D.presets){
    const scene=D.svg(p.id,'frame');
    assert.ok(scene.includes('deco-particle'));assert.ok(!scene.includes('deco-outline'));
    assert.ok(D.svg(p.id,'frame','circle',{showBorder:true}).includes('deco-outline'));
    assert.ok(D.svg(p.id,'frame','circle').includes('viewBox="0 0 640 640"'));
    assert.ok(!D.svg(p.id,'sticker').includes('deco-particle'));
  }
  assert.ok(D.svg('sakura','frame').includes('deco-fall'));
  assert.ok(D.svg('birthday','frame').includes('deco-rise'));
});
test('field-level shared adjustment preserves unrelated individual choices',()=>{
  const cameras=[{preset:'moon',mode:'sticker',size:45,enabled:true},{preset:'teacher',mode:'frame',animated:false,enabled:true}];
  const result=cameras.map(d=>D.patch(d,{opacity:60}));
  assert.equal(result[0].preset,'moon');assert.equal(result[0].size,45);assert.equal(result[1].preset,'teacher');assert.equal(result[1].animated,false);
  assert.deepEqual(result.map(d=>d.opacity),[60,60]);
});
test('approved illustrated themes use bundled transparent artwork in both modes',()=>{
  const R=require('../src/decoration-scenes');
  for(const id of R.themes){
    const asset=fs.readFileSync(path.join(__dirname,'../src',R.assetPath(id)));
    assert.equal(asset.readUInt32BE(16),1536);assert.equal(asset.readUInt32BE(20),1024);assert.equal(asset[25],6);
    for(const mode of ['frame','sticker'])assert.ok(D.svg(id,mode).includes(R.assetPath(id)));
  }
  assert.ok(D.svg('newyear','frame').includes('rich-firework'));
  assert.ok(D.svg('moon','frame').includes('rich-hop'));
  assert.ok(D.svg('graduation','frame').includes('rich-plane'));
});
test('the other seven themes retain their approved v0.2.40 scene artwork',()=>{
  const old=fs.readFileSync(path.join(__dirname,'../docs/decoration-preview-v0.2.40.html'),'utf8');
  for(const p of D.presets.filter(p=>!['newyear','moon','graduation'].includes(p.id)))assert.ok(old.includes(D.svg(p.id,'frame')),p.id);
});
test('valid transparent PNG and multi-frame APNG are accepted without flattening',()=>{
  assert.deepEqual(F.inspectPng(png()),{width:64,height:64,frames:1,animated:false});
  assert.deepEqual(F.inspectPng(png(true)),{width:64,height:64,frames:2,animated:true});
});
test('reject invalid, truncated, oversized and excessive-animation inputs',()=>{
  assert.throws(()=>F.inspectPng(Buffer.from('not png')));
  assert.throws(()=>F.inspectPng(png().subarray(0,40)));
  const huge=png();huge.writeUInt32BE(3000,16);assert.throws(()=>F.inspectPng(huge),/2048/);
  const animation=png(true);animation.writeUInt32BE(121,41);assert.throws(()=>F.inspectPng(animation),/120/);
  const budget=png(true);budget.writeUInt32BE(2048,16);budget.writeUInt32BE(2048,20);budget.writeUInt32BE(120,41);
  // Use a legitimate header/frame count match to reach the decoded-pixel guard.
  const ctl=Buffer.alloc(8);ctl.writeUInt32BE(120);
  const header=budget.subarray(0,33);const data=Buffer.concat([header,chunk('acTL',ctl),chunk('IDAT',Buffer.alloc(1)),chunk('IEND',Buffer.alloc(0))]);
  assert.throws(()=>F.inspectPng(data),/像素/);
});
test('save-decoration updates only its target and never overwrites camera settings',()=>{
  const source=fs.readFileSync(path.join(__dirname,'../src/main.js'),'utf8'),handlers={};let saves=0;
  const sender={},config={decorations:[{preset:'moon',size:40},{preset:'teacher',size:30}],sourceOptions:[{video:{brightness:80}},{video:{brightness:120}}]};
  const c={ipcMain:{handle:(name,fn)=>handlers[name]=fn},settingsWindow:{webContents:sender},config,require:()=>D,saveConfig:()=>saves++,overlays:[],currentState:()=>config};sender.send=()=>{};vm.createContext(c);
  vm.runInContext(source.slice(source.indexOf("ipcMain.handle('save-decoration'"),source.indexOf("ipcMain.handle('import-decoration'")),c);
  assert.equal(handlers['save-decoration']({sender:{}},{target:'all',patch:{enabled:true}}).ok,false);
  handlers['save-decoration']({sender},{target:'0',patch:{enabled:true}});
  assert.equal(config.decorations[0].enabled,true);assert.equal(config.decorations[1].enabled,false);
  handlers['save-decoration']({sender},{target:'all',patch:{opacity:70}});
  assert.equal(config.decorations[0].preset,'moon');assert.equal(config.decorations[1].preset,'teacher');
  assert.deepEqual(config.sourceOptions.map(o=>o.video.brightness),[80,120]);assert.equal(saves,2);
});
test('late image load cannot replace a newer preset or reappear after hiding',async()=>{
  const previous=global.document;
  const element=()=>({style:{setProperty(){}},children:[],replaceChildren(...nodes){this.children=nodes;},append(node){this.children.push(node);}});
  global.document={createElement:element};
  try{
    const host=element();let resolve;
    const renderer=D.createRenderer(host,()=>new Promise(r=>{resolve=r;}));
    const asset='a'.repeat(64)+'.png';
    const old=renderer.update({enabled:true,asset});
    await renderer.update({enabled:true,preset:'moon'});
    const presetMarkup=host.children[0].innerHTML;
    resolve({ok:true,url:'data:image/png;base64,old',stillUrl:'data:image/png;base64,old'});await old;
    assert.equal(host.children[0].innerHTML,presetMarkup);assert.equal(host.children[0].children.length,0);
    const pending=renderer.update({enabled:true,asset:'b'.repeat(64)+'.png'});
    await renderer.update({enabled:true},'rounded',false);resolve({ok:true,url:'old',stillUrl:'old'});await pending;
    assert.equal(host.hidden,true);assert.equal(host.children.length,0);
  }finally{global.document=previous;}
});
