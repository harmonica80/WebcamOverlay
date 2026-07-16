# Webcam Overlay 開發工具與環境設定

## 基本環境

- 作業系統：Windows 11 x64
- PowerShell：Windows PowerShell 5.1
- Node.js：v25.9.0
- npm：v11.17.0
- 專案類型：Windows 桌面應用程式
- 發布方式：Portable 綠色版 EXE
- 不需要安裝 .NET、攝影機驅動或背景服務

## 核心技術

- Electron：`^37.2.0`
- Electron Builder：`^26.0.12`
- JavaScript、HTML、CSS
- Chromium renderer
- Windows Media Capture：透過 `getUserMedia()` 取得攝影機
- MediaPipe Selfie Segmentation：人物分割、背景模糊、人物去背

## 專案結構

```text
WebcamOverlay
├─ package.json
├─ package-lock.json
├─ README.md
├─ scripts
│  └─ generate-icons.js
├─ src
│  ├─ main.js
│  ├─ preload.js
│  ├─ overlay.html
│  ├─ overlay.js
│  ├─ overlay.css
│  ├─ settings.html
│  ├─ settings.js
│  ├─ settings.css
│  ├─ settings-extra.css
│  ├─ assets
│  ├─ vendor
│  │  └─ selfie_segmentation
│  └─ ...
├─ docs
│  └─ settings-screenshot.png
└─ release
   └─ WebcamOverlay-Portable-0.2.7.exe
```

## 程式架構

### Main Process：`src/main.js`

負責建立視窗、攝影機來源管理、拖曳與縮放、永遠置頂、多螢幕位置保存、系統匣、全域快速鍵、設定讀寫，以及背景效果同步。

### Preload：`src/preload.js`

使用 Electron `contextBridge`，只暴露必要功能給前端。

```javascript
contextIsolation: true
```

### Renderer：攝影機浮動視窗

負責攝影機播放、點擊切換／交換來源、拖曳、滾輪縮放、外形裁切、框線、陰影、鏡像、背景模糊與去背。

### Settings Window：設定頁

負責攝影機選擇、顯示 0／1／2 個視窗、外觀、背景效果、快速鍵錄製、即時套用及說明頁。

## 主要功能模組

- `BrowserWindow`：建立設定視窗與浮動視窗
- `globalShortcut`：全域快速鍵
- `Tray`：Windows 系統匣
- `nativeImage`：應用程式及系統匣圖示
- `getUserMedia()`：攝影機擷取
- MediaPipe Selfie Segmentation：人物分割
- Canvas：背景合成、模糊及透明去背
- JSON：儲存使用者設定

## 建置方式

開發執行：

```powershell
npm.cmd install
npm.cmd start
```

建置免安裝版：

```powershell
npm.cmd run build:portable
```

建置結果會輸出到 `release` 資料夾：

```text
WebcamOverlay-Portable-{version}.exe
```

## 封裝設定

```json
{
  "win": {
    "icon": "src/assets/app-icon.png",
    "target": ["portable"]
  }
}
```

使用者下載 EXE 後可以直接執行，不需要安裝精靈。

## 建議沿用的開發模式

- Electron + HTML／CSS／JavaScript
- Main Process 管理視窗與系統功能
- Preload 使用 `contextBridge`
- Renderer 處理介面與畫面
- 使用 JSON 儲存設定
- Electron Builder 建立 Portable EXE
- `contextIsolation: true`
- 大型模型或原生資源放在 `src/vendor`
- 使用 `npm.cmd` 執行 npm，避免 PowerShell 執行原則阻擋 `npm.ps1`

## 建置前檢查

```powershell
node --check src/main.js
node --check src/preload.js
node --check src/overlay.js
node --check src/settings.js
```
