const { app, BrowserWindow, ipcMain, globalShortcut, screen, session, Tray, Menu, nativeImage, shell, dialog, net } = require('electron');
const fs = require('fs');
const path = require('path');

let settingsWindow;
let quickPositionWindow;
let quickPositionRequestedVisible = false;
let overlays = [];
let displayMode = 0;
let activeSingleSource = 0;
let config;
let tray;
const dragSessions = new Map();
const overlaySizes = new Map();
const resizeAnimations = new Map();
let saveTimer;
const QUICK_PANEL_WIDTH = 270;
const QUICK_PANEL_COLLAPSED_HEIGHT = 46;
const QUICK_PANEL_SINGLE_HEIGHT = 330;
const QUICK_PANEL_DUAL_HEIGHT = 280;

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
  video: { background: 'original', blur: 14, mirror: false, fit: 'cover' },
  sourceOptions: [],
  quickPanel: { bounds: { width: QUICK_PANEL_WIDTH, height: QUICK_PANEL_SINGLE_HEIGHT }, alwaysOnTop: true, mode: 'single', sourceIndex: 0, collapsed: false },
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
  if (quickPositionWindow && !quickPositionWindow.isDestroyed()) config.quickPanel.bounds = quickPositionWindow.getBounds();
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
  if (!win.isAlwaysOnTop()) win.setAlwaysOnTop(true, 'screen-saver');
  if (!win.isVisible()) win.showInactive();
}

function ensureQuickPositionOnTop() {
  if (!quickPositionRequestedVisible || !quickPositionWindow || quickPositionWindow.isDestroyed()) return;
  if (quickPositionWindow.isMinimized()) quickPositionWindow.restore();
  if (!quickPositionWindow.isVisible()) quickPositionWindow.showInactive();
  if (config.quickPanel?.alwaysOnTop === false) return;
  if (!quickPositionWindow.isAlwaysOnTop()) quickPositionWindow.setAlwaysOnTop(true, 'screen-saver');
}

function raiseQuickPositionOnTop() {
  ensureQuickPositionOnTop();
  if (!quickPositionWindow || quickPositionWindow.isDestroyed() || !quickPositionWindow.isVisible()) return;
  if (config.quickPanel?.alwaysOnTop === false) return;
  quickPositionWindow.moveTop();
}

function restoreQuickPositionAfterSettingsChange() {
  if (!quickPositionRequestedVisible) return;
  setTimeout(() => {
    ensureQuickPositionOnTop();
    if (config.quickPanel?.alwaysOnTop !== false) raiseQuickPositionOnTop();
  }, 80);
}

function hideQuickPositionWindow() {
  quickPositionRequestedVisible = false;
  quickPositionWindow?.hide();
  scheduleSave();
}

function ensureAllOverlaysVisible() {
  overlays.forEach((_win, index) => ensureOverlayVisible(index));
  ensureQuickPositionOnTop();
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
  settingsWindow.on('minimize', restoreQuickPositionAfterSettingsChange);
  settingsWindow.on('hide', restoreQuickPositionAfterSettingsChange);
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
        restoreQuickPositionAfterSettingsChange();
      }
    });
  });
  settingsWindow.on('closed', () => { settingsWindow = null; });
}

function createQuickPositionWindow() {
  quickPositionRequestedVisible = true;
  if (quickPositionWindow && !quickPositionWindow.isDestroyed()) {
    if (quickPositionWindow.isMinimized()) quickPositionWindow.restore();
    quickPositionWindow.show(); quickPositionWindow.focus(); raiseQuickPositionOnTop(); return;
  }
  const saved = config.quickPanel?.bounds || defaults.quickPanel.bounds;
  const width = QUICK_PANEL_WIDTH;
  const expandedHeight = config.quickPanel?.mode === 'dual' ? QUICK_PANEL_DUAL_HEIGHT : QUICK_PANEL_SINGLE_HEIGHT;
  const collapsedHeight = QUICK_PANEL_COLLAPSED_HEIGHT;
  const height = config.quickPanel?.collapsed === true ? collapsedHeight : expandedHeight;
  const area = screen.getPrimaryDisplay().workArea;
  const candidate = { x: Number.isFinite(saved.x) ? saved.x : area.x + area.width - width - 30, y: Number.isFinite(saved.y) ? saved.y : area.y + 30, width, height };
  const visibleArea = screen.getDisplayMatching(candidate).workArea;
  const x = Math.max(visibleArea.x, Math.min(candidate.x, visibleArea.x + visibleArea.width - width));
  const y = Math.max(visibleArea.y, Math.min(candidate.y, visibleArea.y + visibleArea.height - height));
  quickPositionWindow = new BrowserWindow({
    x, y, width, height, minWidth: width, minHeight: collapsedHeight, maxWidth: width, maxHeight: QUICK_PANEL_SINGLE_HEIGHT,
    frame: false, resizable: false, alwaysOnTop: config.quickPanel?.alwaysOnTop !== false,
    skipTaskbar: true, show: false, backgroundColor: '#eef2f7',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true }
  });
  if (config.quickPanel?.alwaysOnTop !== false) quickPositionWindow.setAlwaysOnTop(true, 'screen-saver');
  quickPositionWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  quickPositionWindow.loadFile(path.join(__dirname, 'quick-position.html'));
  quickPositionWindow.once('ready-to-show', () => {
    quickPositionWindow?.show();
    raiseQuickPositionOnTop();
  });
  quickPositionWindow.on('moved', scheduleSave);
  quickPositionWindow.on('minimize', () => {
    if (quickPositionRequestedVisible) setTimeout(ensureQuickPositionOnTop, 80);
  });
  quickPositionWindow.on('close', event => {
    if (app.isQuiting) return;
    event.preventDefault(); hideQuickPositionWindow();
  });
  quickPositionWindow.on('closed', () => { quickPositionWindow = null; });
}

function resizeQuickPositionWindow(height) {
  if (!quickPositionWindow || quickPositionWindow.isDestroyed()) return;
  const width = QUICK_PANEL_WIDTH;
  const current = quickPositionWindow.getBounds();
  const area = screen.getDisplayMatching({ ...current, width, height }).workArea;
  const x = Math.max(area.x, Math.min(current.x, area.x + area.width - width));
  const y = Math.max(area.y, Math.min(current.y, area.y + area.height - height));
  quickPositionWindow.setBounds({ x, y, width, height });
}

function setQuickPositionCollapsed(collapsed) {
  if (!quickPositionWindow || quickPositionWindow.isDestroyed()) return;
  config.quickPanel = { ...defaults.quickPanel, ...config.quickPanel, collapsed: !!collapsed };
  const expandedHeight = config.quickPanel.mode === 'dual' ? QUICK_PANEL_DUAL_HEIGHT : QUICK_PANEL_SINGLE_HEIGHT;
  resizeQuickPositionWindow(collapsed ? QUICK_PANEL_COLLAPSED_HEIGHT : expandedHeight);
  scheduleSave();
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
      versionRelation: comparison > 0 ? 'remote-newer' : comparison < 0 ? 'local-newer' : 'same',
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

function overlayIndexForSource(sourceIndex) {
  if (displayMode === 1) return activeSingleSource === sourceIndex ? 0 : 1;
  return sourceIndex;
}

function gridPosition(area, bounds, position, padding = 28) {
  const [row, column] = position.split('-').map(Number);
  const left = area.x + padding;
  const right = area.x + area.width - bounds.width - padding;
  const top = area.y + padding;
  const bottom = area.y + area.height - bounds.height - padding;
  const horizontal = [left, area.x + (area.width - bounds.width) / 2, right];
  const vertical = [top, area.y + (area.height - bounds.height) / 2, bottom];
  return {
    x: Math.round(Math.max(area.x, Math.min(horizontal[column], area.x + area.width - bounds.width))),
    y: Math.round(Math.max(area.y, Math.min(vertical[row], area.y + area.height - bounds.height)))
  };
}

function moveOverlayToGrid(sourceIndex, position) {
  if (!/^[0-2]-[0-2]$/.test(position)) return;
  const index = overlayIndexForSource(sourceIndex);
  const win = overlays[index];
  if (!win || win.isDestroyed()) return;
  const bounds = win.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const target = gridPosition(area, bounds, position);
  win.setPosition(target.x, target.y, false);
  scheduleSave();
}

function arrangeOverlays(layout) {
  const supported = new Set(['side-by-side', 'stacked', 'top-corners', 'bottom-corners', 'diagonal', 'reverse-diagonal']);
  if (!supported.has(layout)) return;
  setMode(2);
  const first = overlays[0], second = overlays[1];
  if (!first || !second || first.isDestroyed() || second.isDestroyed()) return;
  const area = screen.getDisplayMatching(first.getBounds()).workArea;
  const positions = {
    'side-by-side': ['1-0', '1-2'],
    stacked: ['0-1', '2-1'],
    'top-corners': ['0-0', '0-2'],
    'bottom-corners': ['2-0', '2-2'],
    diagonal: ['0-0', '2-2'],
    'reverse-diagonal': ['0-2', '2-0']
  }[layout];
  [first, second].forEach((win, index) => {
    const target = gridPosition(area, win.getBounds(), positions[index]);
    win.setPosition(target.x, target.y, false);
  });
  scheduleSave();
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
  raiseQuickPositionOnTop();
  settingsWindow?.webContents.send('state-changed', currentState());
  saveConfig();
}

function createTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'tray-icon.png')).resize({ width: 16, height: 16 });
  tray = new Tray(icon);
  tray.setToolTip('Webcam Overlay');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '開啟設定', click: createSettings },
    { label: '快速排列', click: createQuickPositionWindow },
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
  const nextMode = Math.max(0, Math.min(2, mode));
  if (displayMode === nextMode) return;
  displayMode = nextMode;
  refreshOverlays();
}

function resetOverlayBounds() {
  const area = screen.getPrimaryDisplay().workArea;
  overlays.forEach((win, index) => {
    if (!win || win.isDestroyed()) return;
    const width = defaults.overlayBounds[index].width;
    const height = Math.round(width * 9 / 16);
    const x = area.x + area.width - width - 28;
    const y = area.y + 28 + index * (height + 24);
    overlaySizes.set(index, { width, height });
    win.setAspectRatio(16 / 9);
    win.setBounds({ x, y, width, height }, false);
  });
}

function resetQuickPositionWindow() {
  if (!quickPositionWindow || quickPositionWindow.isDestroyed()) return;
  const area = screen.getPrimaryDisplay().workArea;
  const width = QUICK_PANEL_WIDTH;
  const height = QUICK_PANEL_SINGLE_HEIGHT;
  quickPositionWindow.setAlwaysOnTop(true, 'screen-saver');
  quickPositionWindow.setBounds({
    x: area.x + area.width - width - 30,
    y: area.y + 30,
    width,
    height
  });
  quickPositionWindow.webContents.reload();
}

async function resetSettingsToDefaults() {
  const result = await dialog.showMessageBox(settingsWindow, {
    type: 'warning',
    title: '重設 Webcam Overlay',
    message: '確定要重設為預設值嗎？',
    detail: '攝影機來源、顯示狀態、畫面外觀、快速鍵及視窗位置都會恢復為預設值。',
    buttons: ['重設為預設值', '取消'],
    defaultId: 1,
    cancelId: 1,
    noLink: true
  });
  if (result.response !== 0) return { ok: false, cancelled: true };

  config = structuredClone(defaults);
  ensureSourceOptions();
  displayMode = defaults.displayMode;
  activeSingleSource = defaults.activeSingleSource;
  dragSessions.clear();
  resizeAnimations.forEach(item => { if (item?.timer) clearInterval(item.timer); });
  resizeAnimations.clear();
  registerHotkeys();
  resetOverlayBounds();
  resetQuickPositionWindow();
  refreshOverlays();
  saveConfig();
  return { ok: true, state: currentState(), message: '所有設定已重設為預設值。' };
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

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
app.on('second-instance', () => {
  if (!app.isReady()) return;
  createSettings();
  if (settingsWindow?.isMinimized()) settingsWindow.restore();
  settingsWindow?.show();
  settingsWindow?.focus();
});

app.whenReady().then(() => {
  session.defaultSession.setPermissionCheckHandler((_wc, permission) => permission === 'media');
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
}

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
ipcMain.on('position-overlay', (_e, data) => moveOverlayToGrid(Number(data.sourceIndex), String(data.position)));
ipcMain.on('quick-position-single', (_e, data) => {
  const nextSource = Number(data.sourceIndex) === 1 ? 1 : 0;
  const sourceChanged = activeSingleSource !== nextSource;
  activeSingleSource = nextSource;
  if (displayMode !== 1) setMode(1);
  else if (sourceChanged) refreshOverlays();
  setImmediate(() => moveOverlayToGrid(activeSingleSource, String(data.position)));
});
ipcMain.on('arrange-overlays', (_e, layout) => arrangeOverlays(String(layout)));
ipcMain.on('open-quick-position', createQuickPositionWindow);
ipcMain.on('open-settings', createSettings);
ipcMain.on('close-quick-position', hideQuickPositionWindow);
ipcMain.on('set-quick-panel-collapsed', (_e, collapsed) => setQuickPositionCollapsed(!!collapsed));
ipcMain.on('save-quick-panel-state', (_e, data) => {
  config.quickPanel = { ...defaults.quickPanel, ...config.quickPanel, mode: data.mode === 'dual' ? 'dual' : 'single', sourceIndex: Number(data.sourceIndex) === 1 ? 1 : 0 };
  if (!config.quickPanel.collapsed) resizeQuickPositionWindow(config.quickPanel.mode === 'dual' ? QUICK_PANEL_DUAL_HEIGHT : QUICK_PANEL_SINGLE_HEIGHT);
  scheduleSave();
});
ipcMain.on('set-quick-panel-top', (_e, enabled) => {
  config.quickPanel = { ...defaults.quickPanel, ...config.quickPanel, alwaysOnTop: !!enabled };
  quickPositionWindow?.setAlwaysOnTop(!!enabled, 'screen-saver');
  if (enabled) raiseQuickPositionOnTop();
  scheduleSave();
});
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
ipcMain.handle('reset-settings', resetSettingsToDefaults);
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
