/* Shared, offline decoration catalog and renderer. No camera pixels enter this layer. */
(function (root) {
  const scenes = typeof module !== 'undefined' && module.exports ? require('./decoration-scenes') : root.DecorationScenes;
  const presets = [
    { id: 'newyear', name: '新年燈籠', color: '#dc354b', accent: '#ffd479', motion: 'sway' },
    { id: 'sakura', name: '春日櫻花', color: '#e47da4', accent: '#ffdbe8', motion: 'float' },
    { id: 'dragonboat', name: '端午粽香', color: '#278b68', accent: '#c5e79b', motion: 'sway' },
    { id: 'moon', name: '中秋月兔', color: '#b08bdf', accent: '#ffe4a1', motion: 'float' },
    { id: 'halloween', name: '萬聖南瓜', color: '#f18c35', accent: '#b5a0e8', motion: 'sway' },
    { id: 'christmas', name: '聖誕雪花', color: '#36958a', accent: '#d5f8ff', motion: 'twinkle' },
    { id: 'birthday', name: '生日氣球', color: '#ea81ac', accent: '#9cceff', motion: 'float' },
    { id: 'graduation', name: '畢業星光', color: '#4e72bb', accent: '#ffdc78', motion: 'twinkle' },
    { id: 'teacher', name: '教師謝意', color: '#d68368', accent: '#ffe6ac', motion: 'float' },
    { id: 'sports', name: '運動加油', color: '#3b9cb0', accent: '#ffcf6d', motion: 'sway' }
  ];
  const defaults = { enabled: false, preset: 'newyear', asset: '', assetName: '', mode: 'frame', animated: true, showBorder: false, sceneScale: 100, size: 30, position: '2-2', opacity: 100 };
  function normalize(input = {}) {
    const n = (key, min, max) => Number.isFinite(input[key]) ? Math.max(min, Math.min(max, input[key])) : defaults[key];
    return {
      enabled: input.enabled === true,
      preset: presets.some(p => p.id === input.preset) ? input.preset : defaults.preset,
      asset: /^[a-f0-9]{64}\.png$/.test(input.asset || '') ? input.asset : '',
      assetName: typeof input.assetName === 'string' ? input.assetName.slice(0, 120) : '',
      mode: input.mode === 'sticker' ? 'sticker' : 'frame', animated: input.animated !== false,
      showBorder: input.showBorder === true, sceneScale: n('sceneScale', 50, 180),
      size: n('size', 10, 100), position: /^[0-2]-[0-2]$/.test(input.position || '') ? input.position : '2-2', opacity: n('opacity', 10, 100)
    };
  }
  function patch(current, changes) { return normalize({ ...normalize(current), ...changes }); }
  const star = '<path d="M0-28 8-9 29-8 13 6 18 27 0 16-18 27-13 6-29-8-8-9Z" fill="var(--accent)" stroke="white" stroke-width="3"/>';
  function motif(id) {
    switch (id) {
      case 'newyear': return '<path d="M0-43V-33M-17-32H17M-17 31H17M0 33V51M-7 43V53M7 43V53" stroke="#ffd479" stroke-width="5"/><ellipse rx="30" ry="32" fill="#e94854"/><ellipse rx="15" ry="32" fill="none" stroke="#ffb763" stroke-width="3"/><path d="M-29 0H29" stroke="#ffb763" stroke-width="3"/><path d="M-8-8H8V8H-8Z" fill="#ffd479" transform="rotate(45)"/>';
      case 'sakura': return '<g fill="#f9b9d3" stroke="#fff0f6" stroke-width="2">' + [0,72,144,216,288].map(a => `<path transform="rotate(${a})" d="M0 3C-32-9-23-38-9-33L0-25 9-33C23-38 32-9 0 3Z"/>`).join('') + '</g><circle r="7" fill="#f0b34e"/>';
      case 'dragonboat': return '<path d="M0-40Q9-40 14-27L37 24Q39 34 23 38H-24Q-39 35-36 24L-12-28Q-7-40 0-40Z" fill="#79b76b" stroke="#d8efb2" stroke-width="3"/><path d="M-29 12 25 36M-13-23 24 36M-31 23 24-5" stroke="#e9e6a7" stroke-width="5"/><path d="M-20 5Q-6 15 8 6" stroke="#397956" stroke-width="2" fill="none"/>';
      case 'moon': return '<circle cx="-9" cy="-7" r="33" fill="#ffe4a1"/><circle cx="-22" cy="-15" r="6" fill="#edc879"/><g fill="white" stroke="#ddceea" stroke-width="2"><ellipse cx="20" cy="-15" rx="6" ry="22" transform="rotate(-12 20 -15)"/><ellipse cx="34" cy="-14" rx="6" ry="22" transform="rotate(12 34 -14)"/><ellipse cx="26" cy="18" rx="23" ry="25"/></g><circle cx="18" cy="13" r="2.5" fill="#6e5878"/><circle cx="33" cy="13" r="2.5" fill="#6e5878"/><path d="M23 20Q26 25 29 20" fill="none" stroke="#d88ba1" stroke-width="2"/>';
      case 'halloween': return '<path d="M-3-27Q-6-43 9-42" stroke="#76a977" stroke-width="8" fill="none"/><ellipse cy="6" rx="37" ry="31" fill="#f6a143"/><ellipse cy="6" rx="21" ry="31" fill="#ed8734"/><path d="M-24 0-12-10-5 2ZM7 2 15-10 25 0ZM-21 15Q0 38 23 14L10 20 0 14-10 20Z" fill="#60476d"/>';
      case 'christmas': return '<path d="M0-45 28-9H16L35 17H17L39 38H-39L-17 17H-35L-16-9H-28Z" fill="#51a997" stroke="#d3f4e8" stroke-width="3"/><path d="M0 38V48" stroke="#cb9369" stroke-width="9"/><g fill="#ffe0a3"><circle cx="-11" cy="2" r="4"/><circle cx="14" cy="17" r="4"/><circle cx="-17" cy="29" r="4"/></g><g transform="translate(0 -38) scale(.38)">' + star + '</g>';
      case 'birthday': return '<path d="M-23 3Q-33 31-8 52M20-8Q38 29 4 51M1 11V51" stroke="#dbd5ef" stroke-width="2" fill="none"/><ellipse cx="-23" cy="-17" rx="18" ry="23" fill="#f29fc1"/><ellipse cx="20" cy="-27" rx="18" ry="23" fill="#96c8f9"/><ellipse cy="-9" rx="18" ry="23" fill="#ffdc84"/><path d="M-29-30-25-34M14-39 18-43M-6-21-2-25" stroke="white" stroke-width="4" stroke-linecap="round"/>';
      case 'graduation': return '<g transform="translate(25 25) scale(.62)">' + star + '</g><path d="M-29-5V17Q0 34 29 17V-5" fill="#4166a4"/><path d="M-44-14 0-34 44-14 0 6Z" fill="#7899d2" stroke="#e0eaff" stroke-width="3"/><path d="M0-14 32-1V24" stroke="#ffdc78" stroke-width="3" fill="none"/><path d="M27 25H37L40 38H24Z" fill="#ffdc78"/>';
      case 'teacher': return '<path d="M0-20Q-25-36-39-22V31Q-16 20 0 34Q16 20 39 31V-22Q25-36 0-20Z" fill="#fff2d2" stroke="#dd9a7d" stroke-width="3"/><path d="M0-20V34M-29-9-9-5M-29 2-9 6M10-5 29-9M10 6 29 2" stroke="#d1a58d" stroke-width="2"/><path d="M0-27C-25-42-13-60 0-45C13-60 25-42 0-27Z" fill="#ec8b9d"/>';
      case 'sports': return '<path d="M-22-29H22V-4Q22 17 0 20Q-22 17-22-4Z" fill="#ffd06b" stroke="#fff0b6" stroke-width="3"/><path d="M-22-23H-36Q-38 1-19 3M22-23H36Q38 1 19 3" fill="none" stroke="#ffd06b" stroke-width="6"/><path d="M0 20V34M-18 39H18" stroke="#e9ad53" stroke-width="8"/><g transform="translate(0 -8) scale(.4)">' + star + '</g>';
      default: return star;
    }
  }
  function particle(id, i) {
    if (id === 'sakura') return `<path d="M-16-8Q0-25 18-8Q11 11-9 16Q-5 3-16-8Z" fill="${['#f6a8c7','#ffd4e3','#e98bb0'][i%3]}" stroke="#fff0f6" stroke-width="1.5"/>`;
    if (id === 'christmas') return '<g fill="none" stroke="#f6fdff" stroke-width="3" stroke-linecap="round"><path d="M0-16V16M-14-8 14 8M-14 8 14-8M-5-12 0-7 5-12M-5 12 0 7 5 12"/></g>';
    if (id === 'birthday') return `<path d="M0 19Q-9 31 0 44" fill="none" stroke="#d3c8e7" stroke-width="1.5"/><ellipse cy="-2" rx="17" ry="22" fill="${['#f6a1c5','#99cff6','#ffda81','#bdb0f1'][i%4]}"/><path d="M-8-12-5-16" stroke="white" stroke-width="3" stroke-linecap="round"/>`;
    if (id === 'teacher') return '<path d="M0 15C-36-6-17-29 0-12C17-29 36-6 0 15Z" fill="#f0a4b8" stroke="#ffe8ef" stroke-width="2"/>';
    if (id === 'dragonboat') return '<path d="M-19 18Q-26-15 18-21Q26 12-19 18Z" fill="#8ac9a0"/><path d="M-15 14 13-15" stroke="#e3f5bc" stroke-width="2"/>';
    if (id === 'halloween') return '<path d="M-29-9Q-21-25-10-9L-4-15 0-8 4-15 10-9Q21-25 29-9L18 8Q8 0 0 14Q-8 0-18 8Z" fill="#9b83bc"/>';
    if (id === 'sports') return `<path d="M-5-17 9-12 4 16-10 11Z" fill="${['#ffca68','#76c7d4','#f19bb3'][i%3]}"/>`;
    return star;
  }
  function svg(presetId, mode, shape = 'rounded', options = {}) {
    const p = presets.find(item => item.id === presetId) || presets[0];
    const illustrated = scenes?.render(p.id,mode,shape,options);
    if (illustrated) return illustrated;
    const circle = shape === 'circle', h = mode === 'sticker' ? 180 : circle ? 640 : 360, w = mode === 'sticker' ? 180 : 640;
    const group = (x,y,s,i) => `<g transform="translate(${x} ${y}) scale(${s})"><g class="${mode === 'sticker' ? '' : 'deco-sized'}"><g class="deco-motion deco-${p.motion}" style="animation-delay:-${i * .63}s">${motif(p.id)}</g></g></g>`;
    let content;
    if (mode === 'sticker') {
      content = group(90,88,1.14,0) + `<g transform="translate(29 34) scale(.25)">${star}</g><g transform="translate(150 135) scale(.28)">${star}</g>`;
    } else {
      const outline = circle ? '<circle cx="320" cy="320" r="291"/>' : `<rect x="16" y="16" width="608" height="328" rx="${shape === 'rectangle' ? 2 : 25}"/>`;
      content = options.showBorder ? `<g class="deco-outline" fill="none" stroke="${p.color}" stroke-width="3" opacity=".7">${outline}</g>` : '';
      // Asymmetric focal artwork, with the middle kept open for the teacher.
      const left = circle ? 140 : 73, right = circle ? 500 : 563, top = circle ? 100 : 65, bottom = circle ? 538 : 295;
      const arrangements = {
        newyear: [[left,top,1.15],[right,top-14,.68],[right-47,top+24,.4]],
        sakura: [[left-20,top-25,.8],[left+33,top-41,.48],[right+8,top-30,.55]],
        dragonboat: [[left,bottom,1.08],[left+70,bottom+18,.54],[right,top,.58]],
        moon: [[right-12,top+7,1.28],[left,bottom,.55]],
        halloween: [[left,bottom,1.25],[left+80,bottom+23,.54],[right,top,.65]],
        christmas: [[right,bottom-9,1.24],[right-78,bottom+14,.57]],
        birthday: [[left,bottom-20,1.05],[right,top,.61]],
        graduation: [[left,bottom,1.22],[right,top,.58]],
        teacher: [[right,bottom-6,1.18],[left,top,.53]],
        sports: [[left,bottom-4,1.17],[right,top,.6]]
      };
      if (p.id === 'sakura') content += `<path d="M${left-85} ${top-52}Q${left} ${top-5} ${left+86} ${top-50}M${left-9} ${top-27}L${left+10} ${top-65}" fill="none" stroke="#ad7d8e" stroke-width="5" stroke-linecap="round" opacity=".65"/>`;
      if (p.id === 'newyear') content += `<path d="M${left} 0V${top-43}M${right} 0V${top-43*.68-14}" stroke="#e9be70" stroke-width="2"/>`;
      content += arrangements[p.id].map((a,i) => group(...a,i)).join('');
      const count = p.id === 'birthday' ? 9 : 20;
      const rise = ['birthday','teacher'].includes(p.id);
      const sparkle = ['moon','graduation','newyear'].includes(p.id);
      const fly = p.id === 'halloween';
      const variation = (i, salt) => {
        let n = Math.imul(i + 1, 374761393) ^ Math.imul(salt, 668265263);
        n = Math.imul(n ^ (n >>> 13), 1274126177);
        return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
      };
      for (let i=0;i<count;i++) {
        // Deterministic variation keeps previews and camera scenes consistent.
        const x = 28 + variation(i,1)*584, y = 22 + variation(i,2)*(h-44);
        const scale = (p.id === 'birthday' ? .42 : .22) + variation(i,3)*.45;
        const duration = 10 + variation(i,4)*12, delay = -variation(i,5)*duration;
        const travel = sparkle ? 'deco-sparkle' : rise ? 'deco-rise' : fly ? 'deco-fly' : 'deco-fall';
        content += `<g transform="translate(${fly ? `0 ${y}` : `${x} 0`})"><g class="deco-particle ${travel}" style="--rest-x:${x}px;--rest-y:${y}px;--travel-end:${h+80}px;--duration:${duration}s;--delay:${delay}s"><g class="deco-drift" style="--drift:${i%2 ? 24 : -24}px;--drift-duration:${3+i%4}s;--delay:${delay}s"><g transform="scale(${scale})"><g class="deco-sized"><g class="deco-spin" style="--spin-duration:${4+i%5}s;--delay:${delay}s">${particle(p.id,i)}</g></g></g></g></g></g>`;
      }
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true" style="--accent:${p.accent}">${content}</svg>`;
  }
  // Reuse the same image element across slider changes so APNG does not restart.
  function createRenderer(host, loadAsset, onError = () => {}) {
    let key = '', generation = 0, disposed = false, current;
    const cache = new Map();
    async function update(value, shape = 'rounded', visible = true) {
      current = normalize(value);
      const d = current;
      host.className = `decoration-layer ${d.mode} ${d.animated ? 'animated' : ''}`;
      host.hidden = !d.enabled || !visible;
      host.style.opacity = d.opacity / 100;
      const [row,col] = d.position.split('-').map(Number);
      host.style.setProperty('--deco-size', `${d.size}%`);
      host.style.setProperty('--deco-scene-scale', d.sceneScale / 100);
      host.style.setProperty('--deco-x', `${col * 50}%`);
      host.style.setProperty('--deco-y', `${row * 50}%`);
      host.style.setProperty('--deco-tx', `${col * -50}%`);
      host.style.setProperty('--deco-ty', `${row * -50}%`);
      if (host.hidden) { key = ''; generation++; host.replaceChildren(); onError(''); return; }
      const nextKey = d.asset ? `asset:${d.asset}:${d.animated}` : `${d.preset}:${d.mode}:${shape}:${d.showBorder}`;
      if (key === nextKey) return;
      key = nextKey;
      onError('');
      const epoch = ++generation;
      const content = document.createElement('div'); content.className = 'decoration-content';
      host.replaceChildren(content);
      if (!d.asset) { content.innerHTML = svg(d.preset,d.mode,shape,d); return; }
      try {
        if (!cache.has(d.asset)) {
          // Only retain the current imported file, not every file ever previewed.
          cache.clear(); cache.set(d.asset, loadAsset(d.asset));
        }
        const data = await cache.get(d.asset);
        if (disposed || epoch !== generation) return;
        if (!data?.ok) throw Error(data?.message || '無法載入圖檔');
        const img = document.createElement('img'); img.alt = '';
        img.onload = () => { if (epoch === generation) onError(''); };
        img.onerror = () => { if (epoch === generation) { content.replaceChildren(); onError('圖檔無法顯示，請重新匯入有效的 PNG／APNG。'); } };
        img.src = d.animated ? data.url : data.stillUrl;
        content.append(img);
      } catch (error) {
        if (epoch === generation) { cache.delete(d.asset); key = ''; onError(error.message); }
      }
    }
    return { update, dispose() { disposed = true; generation++; cache.clear(); host.replaceChildren(); } };
  }
  const api = { presets, defaults, normalize, patch, svg, createRenderer };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Decorations = api;
})(typeof window !== 'undefined' ? window : globalThis);
