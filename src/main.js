const { app, BrowserWindow, ipcMain, globalShortcut, screen, session, Tray, Menu, nativeImage, shell, dialog, net } = require('electron');
const fs = require('fs');
const path = require('path');

let settingsWindow;
let overlays = [];
let displayMode = 0;
let activeSingleSource = 0;
let config;
let tray;
const dragSessions = new Map();
const overlaySizes = new Map();
const resizeAnimations = new Map();
let saveTimer;

const defaults = {
  schemaVersion: 2,
  sources: ['', ''],
  sourceNames: ['攝影機 1', '攝影機 2'],
  displayMode: 0,
  activeSingleSource: 0,
  overlayBounds: [
    { width: 420, height: 236 },
    { width: 420, height: 236 }
  ],
  appearance: { shape: 'rounded', borderColor: '#ffffff', borderWidth: 5, radius: 20, shadow: true },
  video: { background: 'original', blur: 14, mirror: true, fit: 'cover' },
  sourceOptions: [],
  hotkeys: { cycle: 'Ctrl+Alt+C', hide: 'Ctrl+Alt+0', one: 'Ctrl+Alt+1', two: 'Ctrl+Alt+2', swap: 'Ctrl+Alt+S' }
};

function configPath() {
  const base = app.isPackaged ? path.dirname(process.execPath) : path.join(__dirname, '..');
  const local = path.join(base, 'Data');
  try {
    fs.mkdirSync(local, { recursive: true });
    fs.accessSync(local, fs.constants.W_OK);
    return path.join(local, 'settings.json');
  } catch {
    return path.join(app.getPath('userData'), 'settings.json');
  }
}

function loadConfig() {
  try {
    const saved = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    if (!saved.schemaVersion) {
      saved.appearance = { ...saved.appearance, borderWidth: 5, radius: 20 };
      saved.schemaVersion = 1;
    }
    if (saved.hotkeys) {
      for (const key of Object.keys(saved.hotkeys)) saved.hotkeys[key] = saved.hotkeys[key].replace(/CommandOrControl/gi, 'Ctrl');
    }
    const merged = { ...defaults, ...saved, appearance: { ...defaults.appearance, ...saved.appearance }, video: { ...defaults.video, ...saved.video }, hotkeys: { ...defaults.hotkeys, ...saved.hotkeys } };
    merged.sourceOptions = [0, 1].map(index => ({
      appearance: { ...merged.appearance, ...(saved.sourceOptions?.[index]?.appearance || {}) },
      video: { ...merged.video, ...(saved.sourceOptions?.[index]?.video || {}) }
    }));
    merged.schemaVersion = 2;
    return merged;
  } catch { return structuredClone(defaults); }
}

function ensureSourceOptions() {
  if (!Array.isArray(config.sourceOptions) || config.sourceOptions.length < 2) {
    config.sourceOptions = [0, 1].map(() => ({
      appearance: { ...config.appearance },
      video: { ...config.video }
    }));
  }
}

function optionsForSource(index) {
  ensureSourceOptions();
  return config.sourceOptions[index] || { appearance: config.appearance, video: config.video };
}

function saveConfig() {
  ensureSourceOptions();
  config.displayMode = displayMode;
  config.activeSingleSource = activeSingleSource;
  config.overlayBounds = overlays.map((w, i) => w && !w.isDestroyed() ? w.getBounds() : config.overlayBounds[i]);
  fs.writeFileSync(configPath(), JSON.stringify(config, null, 2));
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveConfig, 350);
}

function createOverlay(index) {
  const saved = config.overlayBounds[index] || defaults.overlayBounds[index];
  const normalizedWidth = Math.max(180, Math.min(1100, Number(saved.width) || 420));
  const normalizedHeight = optionsForSource(sourceForOverlay(index)).appearance.shape === 'circle' ? normalizedWidth : Math.round(normalizedWidth * 9 / 16);
  overlaySizes.set(index, { width: normalizedWidth, height: normalizedHeight });
  const area = screen.getPrimaryDisplay().workArea;
  const fallbackX = area.x + area.width - normalizedWidth - 28;
  const fallbackY = area.y + 28 + index * (normalizedHeight + 24);
  const win = new BrowserWindow({
    x: Number.isFinite(saved.x) ? saved.x : fallbackX,
    y: Number.isFinite(saved.y) ? saved.y : fallbackY,
    width: normalizedWidth, height: normalizedHeight,
    minWidth: 180, minHeight: 101,
    frame: false, transparent: true, backgroundColor: '#00000000',
    alwaysOnTop: true, skipTaskbar: true, show: false,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  win.setResizable(false);
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.loadFile(path.join(__dirname, 'overlay.html'), { query: { index: String(index) } });
  win.on('moved', scheduleSave);
  win.on('resized', scheduleSave);
  win.on('blur', () => ensureOverlayVisible(index));
  win.on('closed', () => { overlays[index] = null; });
  return win;
}

function ensureOverlayVisible(index) {
  const win = overlays[index];
  if (!win || win.isDestroyed() || displayMode === 0 || (displayMode === 1 && index === 1)) return;
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (!win.isVisible()) win.showInactive();
}

function ensureAllOverlaysVisible() {
  overlays.forEach((_win, index) => ensureOverlayVisible(index));
}

function createSettings() {
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.show(); settingsWindow.focus(); return;
  }
  settingsWindow = new BrowserWindow({
    width: 780, height: 610, minWidth: 700, minHeight: 540,
    title: `Webcam Overlay 設定 v${app.getVersion()}`,
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  settingsWindow.loadFile(path.join(__dirname, 'settings.html'));
  settingsWindow.webContents.on('page-title-updated', event => {
    event.preventDefault();
    settingsWindow?.setTitle(`Webcam Overlay 設定 v${app.getVersion()}`);
  });
  settingsWindow.on('close', event => {
    if (app.isQuiting) return;
    event.preventDefault();
    dialog.showMessageBox(settingsWindow, {
      type: 'question',
      title: '關閉 Webcam Overlay 設定',
      message: '要結束程式，還是僅關閉設定視窗？',
      buttons: ['僅關閉視窗', '結束程式'],
      defaultId: 0,
      cancelId: 0,
      noLink: true
    }).then(result => {
      if (result.response === 1) {
        app.isQuiting = true;
        app.quit();
      } else if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.hide();
      }
    });
  });
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

async function checkForUpdates() {
  const currentVersion = app.getVersion();
  try {
    const response = await net.fetch(`https://raw.githubusercontent.com/harmonica80/WebcamOverlay/main/package.json?t=${Date.now()}`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const remotePackage = await response.json();
    const latestVersion = String(remotePackage.version || '').trim();
    if (!/^\d+\.\d+\.\d+$/.test(latestVersion)) throw new Error('invalid version');
    const parts = version => version.split('.').map(Number);
    const current = parts(currentVersion);
    const latest = parts(latestVersion);
    let comparison = 0;
    for (let index = 0; index < 3; index++) {
      if (latest[index] !== current[index]) { comparison = latest[index] > current[index] ? 1 : -1; break; }
    }
    return {
      ok: true,
      currentVersion,
      latestVersion,
      updateAvailable: comparison > 0,
      downloadUrl: `https://github.com/harmonica80/WebcamOverlay/raw/main/release/WebcamOverlay-Portable-${latestVersion}.exe`
    };
  } catch {
    return { ok: false, currentVersion, message: '目前無法連線至 GitHub 檢查新版本。' };
  }
}

function createApplicationMenu() {
  const sendUpdateResult = async () => {
    createSettings();
    const result = await checkForUpdates();
    settingsWindow?.webContents.send('update-check-result', result);
  };
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: '檔案', submenu: [
      { label: '關閉設定視窗', accelerator: 'Ctrl+W', role: 'close' },
      { type: 'separator' },
      { label: '結束程式', accelerator: 'Alt+F4', click: () => { app.isQuiting = true; app.quit(); } }
    ] },
    { label: '編輯', submenu: [
      { label: '復原', accelerator: 'Ctrl+Z', role: 'undo' },
      { label: '重做', accelerator: 'Ctrl+Y', role: 'redo' },
      { type: 'separator' },
      { label: '剪下', accelerator: 'Ctrl+X', role: 'cut' },
      { label: '複製', accelerator: 'Ctrl+C', role: 'copy' },
      { label: '貼上', accelerator: 'Ctrl+V', role: 'paste' },
      { label: '全選', accelerator: 'Ctrl+A', role: 'selectAll' }
    ] },
    { label: '檢視', submenu: [
      { label: '實際大小', accelerator: 'Ctrl+0', role: 'resetZoom' },
      { label: '放大', accelerator: 'Ctrl+Plus', role: 'zoomIn' },
      { label: '縮小', accelerator: 'Ctrl+-', role: 'zoomOut' },
      { type: 'separator' },
      { label: '切換全螢幕', accelerator: 'F11', role: 'togglefullscreen' }
    ] },
    { label: '視窗', submenu: [
      { label: '最小化', role: 'minimize' },
      { label: '關閉', role: 'close' }
    ] },
    { label: '說明', submenu: [
      { label: '檢查新版本', click: sendUpdateResult },
      { label: '開發者網站', click: () => shell.openExternal('https://harmonica80.blogspot.com/') }
    ] }
  ]));
}

function sourceForOverlay(index) {
  if (displayMode === 1) return activeSingleSource;
  return index;
}

function refreshOverlays() {
  applyShapeGeometry();
  overlays.forEach((win, index) => {
    if (!win || win.isDestroyed()) return;
    if (displayMode === 0 || (displayMode === 1 && index === 1)) {
      win.webContents.send('visibility-changed', false);
      win.hide();
    }
    else {
      const sourceIndex = sourceForOverlay(index);
      win.webContents.send('source-changed', {
        deviceId: config.sources[sourceIndex] || '',
        name: config.sourceNames[sourceIndex] || `攝影機 ${sourceIndex + 1}`
      });
      win.webContents.send('options-changed', optionsForSource(sourceIndex));
      win.webContents.send('visibility-changed', true);
      win.showInactive();
    }
  });
  settingsWindow?.webContents.send('state-changed', currentState());
  saveConfig();
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Webcam Overlay');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '開啟設定', click: createSettings },
    { type: 'separator' },
    { label: '隱藏', click: () => setMode(0) },
    { label: '顯示 1 個', click: () => setMode(1) },
    { label: '顯示 2 個', click: () => setMode(2) },
    { label: '交換來源', click: () => { if (displayMode === 1) activeSingleSource = 1-activeSingleSource; else [config.sources[0],config.sources[1],config.sourceNames[0],config.sourceNames[1]]=[config.sources[1],config.sources[0],config.sourceNames[1],config.sourceNames[0]]; refreshOverlays(); } },
    { type: 'separator' }, { label: '結束程式', click: () => { app.isQuiting = true; app.quit(); } }
  ]));
  tray.on('double-click', createSettings);
}

function setMode(mode) {
  displayMode = Math.max(0, Math.min(2, mode));
  refreshOverlays();
}

function currentState() {
  return { ...config, displayMode, activeSingleSource, appVersion: app.getVersion() };
}

function registerHotkeys() {
  globalShortcut.unregisterAll();
  const results = {};
  const bind = (name, action) => { try { results[name] = globalShortcut.register(config.hotkeys[name], action); } catch { results[name] = false; } };
  bind('cycle', () => setMode((displayMode + 1) % 3));
  bind('hide', () => setMode(0));
  bind('one', () => setMode(1));
  bind('two', () => setMode(2));
  bind('swap', () => {
    if (displayMode === 1) activeSingleSource = 1 - activeSingleSource;
    else if (displayMode === 2) [config.sources[0], config.sources[1], config.sourceNames[0], config.sourceNames[1]] =
      [config.sources[1], config.sources[0], config.sourceNames[1], config.sourceNames[0]];
    refreshOverlays();
  });
  return results;
}

function applyShapeGeometry() {
  overlays.forEach((win, index) => {
    if (!win || win.isDestroyed()) return;
    const circle = optionsForSource(sourceForOverlay(index)).appearance.shape === 'circle';
    const resize = resizeAnimations.get(index);
    if (resize?.timer) clearInterval(resize.timer);
    resizeAnimations.delete(index);

    const apply = () => {
      if (!win || win.isDestroyed()) return;
      const b = win.getBounds();
      const width = overlaySizes.get(index)?.width || b.width;
      const height = circle ? width : Math.round(width * 9 / 16);
      win.setAspectRatio(circle ? 1 : 16 / 9);
      win.setBounds({
        x: Math.round(b.x - (width - b.width) / 2),
        y: Math.round(b.y - (height - b.height) / 2),
        width,
        height
      }, false);
      overlaySizes.set(index, { width, height });
    };

    apply();
    // Windows 偶爾會在外觀重繪時保留上一個圓形視窗的 1:1 尺寸；
    // 下一個事件循環再次套用，確保矩形類型恢復為 16:9。
    setImmediate(apply);
  });
}

app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => callback(permission === 'media'));
  config = loadConfig();
  displayMode = config.displayMode || 0;
  activeSingleSource = config.activeSingleSource || 0;
  overlays = [createOverlay(0), createOverlay(1)];
  createApplicationMenu();
  createSettings();
  createTray();
  registerHotkeys();
  screen.on('display-metrics-changed', ensureAllOverlaysVisible);
  setTimeout(refreshOverlays, 700);
  setInterval(ensureAllOverlaysVisible, 1000);
});

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => { saveConfig(); globalShortcut.unregisterAll(); });
app.on('browser-window-blur', ensureAllOverlaysVisible);
app.on('activate', ensureAllOverlaysVisible);

ipcMain.handle('get-state', () => currentState());
ipcMain.handle('open-external', (_e, url) => {
  if (url === 'https://harmonica80.blogspot.com/' || /^https:\/\/github\.com\/harmonica80\/WebcamOverlay\/(?:raw|releases)\//.test(url)) return shell.openExternal(url);
});
ipcMain.handle('check-for-updates', () => checkForUpdates());
ipcMain.on('set-mode', (_e, mode) => setMode(Number(mode)));
ipcMain.on('save-sources', (_e, data) => {
  config.sources = data.sources;
  config.sourceNames = data.sourceNames;
  refreshOverlays();
});
ipcMain.on('save-options', (_e, data) => {
  ensureSourceOptions();
  const target = data.target;
  if (target === 'all') {
    config.appearance = { ...config.appearance, ...data.appearance };
    config.video = { ...config.video, ...data.video };
    config.sourceOptions = [0, 1].map(() => ({ appearance: { ...config.appearance }, video: { ...config.video } }));
  } else {
    const sourceIndex = Number(target);
    if (sourceIndex !== 0 && sourceIndex !== 1) return;
    config.sourceOptions[sourceIndex] = {
      appearance: { ...config.sourceOptions[sourceIndex].appearance, ...data.appearance },
      video: { ...config.sourceOptions[sourceIndex].video, ...data.video }
    };
  }
  applyShapeGeometry();
  overlays.forEach((win, index) => win?.webContents.send('options-changed', optionsForSource(sourceForOverlay(index))));
  settingsWindow?.webContents.send('state-changed', currentState());
  scheduleSave();
});
ipcMain.handle('save-hotkeys', (_e, hotkeys) => {
  const previous = config.hotkeys;
  config.hotkeys = { ...hotkeys };
  const results = registerHotkeys();
  if (Object.values(results).some(ok => !ok)) {
    config.hotkeys = previous; registerHotkeys();
    return { ok: false, message: '快速鍵格式錯誤，或已被其他程式占用。' };
  }
  scheduleSave(); return { ok: true, message: '快速鍵已更新。' };
});
ipcMain.on('overlay-click', (_e, index) => {
  if (displayMode === 1) activeSingleSource = 1 - activeSingleSource;
  else if (displayMode === 2) {
    [config.sources[0], config.sources[1]] = [config.sources[1], config.sources[0]];
    [config.sourceNames[0], config.sourceNames[1]] = [config.sourceNames[1], config.sourceNames[0]];
  }
  refreshOverlays();
});
ipcMain.on('drag-start', (_e, { index, screenX, screenY }) => {
  const win = overlays[index]; if (!win) return;
  const [x, y] = win.getPosition();
  const pointer = screen.getCursorScreenPoint();
  const size = overlaySizes.get(index) || win.getBounds();
  dragSessions.set(index, { pointerX: pointer.x, pointerY: pointer.y, windowX: x, windowY: y, ...size });
});
ipcMain.on('move-overlay', (_e, { index }) => {
  const win = overlays[index], drag = dragSessions.get(index);
  if (!win || !drag) return;
  const pointer = screen.getCursorScreenPoint();
  win.setBounds({
    x: Math.round(drag.windowX + pointer.x - drag.pointerX),
    y: Math.round(drag.windowY + pointer.y - drag.pointerY),
    width: drag.width,
    height: drag.height
  }, false);
});
ipcMain.on('drag-end', (_e, index) => {
  const win = overlays[index], drag = dragSessions.get(index);
  if (win && drag) {
    const b = win.getBounds();
    win.setBounds({ x: b.x, y: b.y, width: drag.width, height: drag.height }, false);
  }
  dragSessions.delete(index);
});
ipcMain.on('resize-overlay', (_e, { index, delta }) => {
  const win = overlays[index]; if (!win) return;
  const current = resizeAnimations.get(index) || {};
  const baseWidth = current.targetWidth || overlaySizes.get(index)?.width || win.getBounds().width;
  const normalizedDelta = Math.max(-120, Math.min(120, Number(delta) || 0));
  current.targetWidth = Math.max(180, Math.min(1100, baseWidth * Math.exp(-normalizedDelta * 0.00115)));
  resizeAnimations.set(index, current);
  if (current.timer) return;

  current.timer = setInterval(() => {
    if (!win || win.isDestroyed()) {
      clearInterval(current.timer); resizeAnimations.delete(index); return;
    }
    const b = win.getBounds();
    const difference = current.targetWidth - b.width;
    const nextWidth = Math.round(Math.abs(difference) < 0.75 ? current.targetWidth : b.width + difference * 0.12);
    const width = Math.max(180, Math.min(1100, nextWidth));
    const circle = optionsForSource(sourceForOverlay(index)).appearance.shape === 'circle';
    const height = circle ? width : Math.round(width * 9 / 16);
    if (width !== b.width || height !== b.height) {
      win.setBounds({
        x: Math.round(b.x - (width - b.width) / 2),
        y: Math.round(b.y - (height - b.height) / 2),
        width, height
      }, false);
    }
    overlaySizes.set(index, { width, height });
    if (Math.abs(current.targetWidth - width) < 0.75) {
      clearInterval(current.timer); current.timer = null;
      scheduleSave();
    }
  }, 16);
});
