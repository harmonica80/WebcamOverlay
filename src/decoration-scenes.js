/* Layered artwork derived from the approved October 2026 concept boards.
 * Each local PNG is a 3 x 2 transparent atlas. SVG viewports isolate cells;
 * CSS animates the layers without touching camera pixels or decoding frames.
 */
(function(root) {
  const themes = ['newyear', 'moon', 'graduation'];
  const assetPath = id => `assets/decorations/${id}-v041.png`;
  function render(id, mode, shape, options = {}) {
    if (!themes.includes(id)) return null;
    const h = mode === 'sticker' ? 180 : shape === 'circle' ? 640 : 360;
    const w = mode === 'sticker' ? 180 : 640;
    const href = assetPath(id);
    // A few brush/tassel tips extend beyond the nominal atlas grid; use inspected
    // gutters so adjacent artwork never leaks into an independently moving layer.
    const cells=id==='graduation'?[[0,0,550,520],[550,0,485,512],[1045,0,491,512],[0,535,592,489],[592,512,436,512],[1030,515,506,509]]:
      id==='newyear'?[[0,0,512,530],[540,0,472,520],[1024,0,512,524],[0,530,520,494],[550,530,460,494],[1030,530,506,494]]:null;
    const sprite = (cell, size) => `<svg class="rich-sprite" x="${-size/2}" y="${-size/2}" width="${size}" height="${size}" viewBox="${(cells?.[cell]||[cell%3*512,Math.floor(cell/3)*512,512,512]).join(' ')}" overflow="hidden"><image href="${href}" width="1536" height="1024"/></svg>`;
    const layer = (cell,x,y,size,motion='',delay=0,angle=0) => `<g transform="translate(${x} ${y}) rotate(${angle})"><g class="${mode==='sticker'?'':'deco-sized'}"><g class="deco-motion rich-motion ${motion}" style="--rich-delay:${delay}s;--pivot-y:${-size*.35}px">${sprite(cell,size)}</g></g></g>`;
    let content = '';
    if(mode==='sticker') {
      if(id==='newyear') content=layer(0,82,76,155,'rich-lantern')+layer(3,137,137,84,'rich-bob')+layer(4,30,140,55,'rich-bob',-2);
      if(id==='moon') content=layer(0,113,60,124,'rich-glow')+layer(1,91,156,172,'rich-cloud')+layer(3,61,111,117,'rich-hop');
      if(id==='graduation') content=layer(0,72,72,144,'rich-toss-small')+layer(1,119,138,103,'rich-bob')+layer(2,137,28,60,'rich-bob',-1);
    } else {
      const circle=shape==='circle', left=circle?130:72, right=circle?510:567, top=circle?110:58, bottom=circle?h-106:h-55;
      if(options.showBorder) {
        const outline=circle?'<circle cx="320" cy="320" r="291"/>':`<rect x="16" y="16" width="608" height="328" rx="${shape==='rectangle'?2:25}"/>`;
        content+=`<g class="deco-outline" fill="none" stroke="${id==='newyear'?'#dfac54':id==='moon'?'#e4ce98':'#7f9fca'}" stroke-width="3" opacity=".7">${outline}</g>`;
      }
      if(id==='newyear') {
        content+=layer(2,left+25,top-48,255,'rich-branch')+layer(2,right+35,top-32,175,'rich-branch',-2,-20);
        content+=layer(5,right-25,top+5,173,'rich-firework',-1.4)+layer(5,right-74,bottom-30,88,'rich-firework',-3.3);
        content+=layer(0,left,top+50,235,'rich-lantern')+layer(1,left+100,top+27,133,'rich-lantern',-1)+layer(0,left+150,top-16,90,'rich-lantern',-2);
        content+=layer(0,right+13,top-1,112,'rich-lantern',-1.7);
        content+=layer(3,left-3,bottom+10,186,'rich-bob')+layer(4,right,bottom+2,143,'rich-bob',-2,-13);
      }
      if(id==='moon') {
        content+=layer(2,left+33,top-6,282,'rich-branch')+layer(0,right-13,top+10,202,'rich-glow');
        content+=layer(1,right+10,top+54,236,'rich-cloud',-2)+layer(1,left-1,bottom+46,290,'rich-cloud')+layer(1,right-15,bottom+49,315,'rich-cloud',-3);
        content+=layer(3,left,bottom-13,161,'rich-hop')+layer(4,right-4,bottom+3,133,'rich-hop',-2.5);
      }
      if(id==='graduation') {
        content+=layer(3,left-60,bottom-85,295,'rich-cloud',-1,25)+layer(3,left+20,bottom+65,334,'rich-cloud')+layer(3,right-1,bottom+62,302,'rich-cloud',-3);
        content+=layer(0,left+8,bottom-16,219,'rich-toss')+layer(5,left+40,top-8,125,'rich-toss',-2)+layer(5,right-34,top-12,85,'rich-toss-small',-3);
        content+=layer(1,right-5,bottom+5,192,'rich-bob',-1)+layer(2,right-55,top-20,111,'rich-plane');
      }
      // Falling elements stay in the side lanes to keep the teacher's face clear.
      const cell=id==='newyear'?4:id==='moon'?5:4;
      for(let i=0;i<12;i++) {
        const x=i%2===0?30+(i*37%145):465+(i*29%145);
        const y=20+(i*73%(h-40)), size=(id==='newyear'?25:20)+(i*13%22), duration=12+i%5*2;
        content+=`<g transform="translate(${x} 0)"><g class="deco-particle deco-fall" style="--rest-y:${y}px;--travel-end:${h+70}px;--duration:${duration}s;--delay:${-(i*.73%1)*duration}s"><g class="deco-drift" style="--drift:${i%2?12:-12}px;--drift-duration:4s;--delay:-${i*.6}s"><g class="deco-sized"><g class="deco-spin" style="--spin-duration:${7+i%4}s;--delay:-${i*.5}s">${sprite(cell,size)}</g></g></g></g></g>`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" class="rich-scene" data-theme="${id}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${content}</svg>`;
  }
  const api={themes,assetPath,render};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  else root.DecorationScenes=api;
})(typeof window!=='undefined'?window:globalThis);
