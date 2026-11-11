# 交接說明：v0.2.45 → v0.3.2（Claude 修改）

這份文件寫給之後接手維護本專案的 AI 助理（ChatGPT／Codex）或開發者，說明 Claude 在 2026-11-11 做了哪些修改、為什麼這樣改，以及哪些地方不要改回去。

- 基準版本：GitHub `main` 的 v0.2.45（commit `7852af3`）。v0.2.45 與本機 v0.2.44 的程式碼相同，只差 README、CI 與檔案結尾換行。
- 新版本：v0.3.2，分支 `release/v0.3.2`，合併後發布為 GitHub Release `v0.3.2`。
- 本機的「Claude 改版」資料夾是這次修改的工作副本；在原專案資料夾執行 `git pull` 取得 v0.3.2 後，就可以刪除該資料夾。

## 一、主要改變

1. **新增「影片去背（RVM）」並設為預設**：Robust Video Matting，循環網路跨影格保留狀態，並用預測的前景色去除邊緣背景色殘留。
2. **MediaPipe 換成 Tasks Vision**：品質模式優先使用 selfie multiclass（人物 = 1 − 背景機率），快速模式使用橫式 selfie 模型。
3. **去背流程重寫**：所有模式改由 GPU（WebGL2）做邊緣感知放大、輪廓控制與動作感知防閃爍；PP-MattingV2 改為等比例 letterbox 輸入。
4. **瘦身**：PP-MattingV2 改用 FP16（36 MB → 18 MB）、裝飾圖 PNG → WebP（6.3 MB → 1 MB）、移除舊版 MediaPipe 與重複打包的 node_modules、Electron 語系只保留 zh-TW 與 en-US。
5. **主程序修正**：交換來源、設定寫檔、IPC 發送者檢查、外部連結處理。
6. **授權改為 GPL-3.0**：因內含 GPL-3.0 的 RVM 模型。內建圖片素材維持 CC BY-NC-SA 4.0。

## 二、逐檔修改清單

### 新增檔案

| 檔案 | 用途 |
|---|---|
| `src/matte-engines.js` | 三種推論引擎：`RVMMatting`、`PPMatting`、`TasksSegmenter`，提供 `infer(frameCanvas)`，回傳低解析度遮罩（RVM 另含前景色）；`outputStats()` 檢查輸出是否含無效數值 |
| `src/matte-gpu.js` | `GpuMatte`（WebGL2：聯合雙邊放大 → 輪廓／柔和 → 動作感知時間平滑 → RVM 前景色合成）與 `CpuMatte`（無 WebGL2 時使用 `MatteRefiner` 的備援） |
| `src/vendor/rvm/rvm_mobilenetv3_webgpu.onnx`、`LICENSE` | 修補過的 RVM FP32 模型與 GPL-3.0 授權全文（見第三節） |
| `src/vendor/ppmatting/ppmattingv2_fp16.onnx` | PP-MattingV2 FP16（輸入輸出維持 FP32；先移除 Resize 空的 roi／scales 輸入再轉換） |
| `src/vendor/mediapipe/selfie_segmentation*.tflite` | 原有 selfie 模型，權重未改，只加入 Tasks API 需要的 metadata（mean 0、std 255） |
| `src/vendor/mediapipe/vision_bundle.js`、`wasm/vision_wasm_internal.*` | MediaPipe Tasks Vision 1.2.2（由 `scripts/sync-vendor.js` 從 node_modules 複製，只保留 SIMD 版） |
| `scripts/sync-vendor.js` | 取代 `sync-onnx-runtime.js`：複製 ONNX Runtime 與 MediaPipe Tasks 執行檔 |
| `scripts/fetch-models.js` | 下載 `selfie_multiclass_256x256.tflite` 並核對 SHA-256（`npm install` 時失敗只警告；`build:portable` 時失敗會中止） |
| `scripts/patch-rvm-model.py` | 修補 RVM 模型，避開 ONNX Runtime WebGPU 卷積錯誤 |
| `scripts/verify-matting-electron.js` | 以合成攝影機實際執行所有去背模式與回退；`WEBCAM_QA_CPU=1` 允許 CPU 推論，`WEBCAM_QA_SOFTWARE_WEBGPU=1` 使用 SwiftShader 模擬 WebGPU |
| `scripts/test-main-helpers.js` | 測試交換來源、原子寫檔、模型輸出檢查 |
| `LICENSE`、`THIRD_PARTY_NOTICES.md`、`CHANGELOG.md` | GPL-3.0 全文、第三方授權與模型修改紀錄、版本紀錄（README 的舊版說明移到這裡） |
| `docs/matting-v0.3.0.md`、`docs/matting-v0.3.0-qa.png` | 去背流程說明與驗證結果圖 |
| `src/assets/decorations/*-v041.webp` | 取代同名 PNG |

### 修改檔案

| 檔案 | 修改內容 |
|---|---|
| `src/overlay.js` | 去背改用引擎與 compositor；模式回退鏈 `rvm/advanced → quality → fast`；每個視窗只保留一個模型（`releaseEngines`）；每次推論擷取一張影格快照（`captureFrame`，長邊 ≤ 1280）；合成改為「前景 → destination-over 背景」；透過 `desktop.reportMatting` 回報診斷；修正 `applyOptions` 中不會成立的 `virtualType` 判斷 |
| `src/overlay.html` | 改載入 `vendor/mediapipe/vision_bundle.js`、`matte-engines.js`、`matte-gpu.js`；移除舊 MediaPipe 與 `pp-matting.js` |
| `src/main.js` | `swapSources()` 合併三處交換邏輯，解析度跟著攝影機交換；`refreshOverlays` 改用 `scheduleSave`；`writeFileAtomic` 先寫 `.tmp` 再改名；快取 `configPath()`；`sendToOverlays` 略過已銷毀的視窗；設定類 IPC 檢查發送者（`isSettings`／`isControlWindow`／`isOverlay`）；`web-contents-created` 統一處理外部連結並阻擋非 file:// 導覽；新增 `overlay-matting` 診斷紀錄；預設 `matteQuality: 'rvm'` |
| `src/preload.js` | 新增 `reportMatting` |
| `src/settings.html` / `src/settings.js` | 去背模式新增「影片去背（RVM，建議）」並設為預設；邊緣滑桿在所有模式都可調；說明文字更新；授權說明改為 GPL-3.0＋圖片 CC BY-NC-SA |
| `src/decoration-scenes.js`、`scripts/verify-decoration-portable.js` | 裝飾圖副檔名 `.png` → `.webp` |
| `package.json` / `package-lock.json` | 版本 0.3.2；授權 `GPL-3.0-only`；移除 `@mediapipe/selfie_segmentation`（原本放在 dependencies 會被重複打包），改用 devDependencies 的 `@mediapipe/tasks-vision` 1.2.2；`postinstall` 執行 sync-vendor 與 fetch-models；`npm test`；打包設定 `electronLanguages`、`compression: maximum`，排除 SVG 與未使用的 RVM 模型 |
| `scripts/test-source-lifecycle.js` | 舊 PP／MediaPipe 測試改寫為引擎 API（過期結果丟棄、回退、模式切換、隱藏重開） |
| `scripts/test-decoration.js` | PNG 檔頭檢查改為 WebP（VP8X）；mock 加入 `sendToOverlays` |
| `scripts/test-settings-persistence.js` | mock 加入 `renameSync` |
| `.github/workflows/checks.yml` | 測試改用 `npm test`；artifact 名稱不再寫死版本 |
| `.gitignore` | `release/` 整個忽略；忽略 multiclass 模型與 QA 暫存檔 |
| `README.md`、`development-environment.md` | 新版說明、建置步驟、模型來源表 |

### 刪除檔案

`src/pp-matting.js`、`src/vendor/selfie_segmentation/`（舊版 MediaPipe）、`src/vendor/ppmatting/ppmattingv2.onnx`（改用 FP16）、`src/assets/decorations/*.png`、`scripts/sync-onnx-runtime.js`、`scripts/verify-advanced-electron.js`、`scripts/verify-matte-electron.js`（由 `verify-matting-electron.js` 取代）。

## 三、不要改回去的地方

1. **RVM 必須使用 `rvm_mobilenetv3_webgpu.onnx`**。ONNX Runtime Web 1.24.3 的 WebGPU 卷積在輸入 171 個通道時算錯（172 個通道完全正確），RVM 解碼器剛好有這一層，導致人物幾乎全透明（v0.3.0、v0.3.1 實機都發生）。FP16 與 FP32 都會發生，CPU 正常。`scripts/patch-rvm-model.py` 會把通道數不是 4 的倍數的卷積補上 0，結果與原模型相同（最大差 1.2e-6）。換用官方 RVM 檔案或升級 ONNX Runtime 時，請重新執行修補，並用 `WEBCAM_QA_SOFTWARE_WEBGPU=1` 驗證。
2. **不要用官方 FP16 版 RVM**：它同樣有上述問題，而且需要顯示卡支援 shader-f16。
3. **PP-MattingV2 FP16 需要 shader-f16**（`createSession(..., needsF16 = true)`）；RVM FP32 不需要。
4. **只能保留 GPL-3.0**：只要內含 RVM，整個程式就必須維持 GPL-3.0 相容授權，並在散布 EXE 時提供原始碼。

## 四、建置與測試

```powershell
npm.cmd install            # postinstall：複製執行檔、下載 multiclass 模型
npm.cmd test               # 41 項回歸測試
npx electron scripts/verify-matting-electron.js   # 實際執行所有去背模式（輸出到 release/matte-qa）
npm.cmd run build:portable
```

## 五、已知限制與後續可做

- 兩個攝影機視窗各自載入一份模型，GPU 記憶體用量加倍；要共用模型需要調整架構（例如改用隱藏的推論視窗）。
- multiclass 模型尚未在實機上測試；v0.3.2 的 RVM 修正是在 SwiftShader 模擬 WebGPU 上驗證（與 CPU 結果一致），RTX 3060／Intel Iris Xe 的實際畫面與速度仍需確認。
- `verify-matting-electron.js` 偶爾卡在「正在連接 fixture」，是測試用合成攝影機的問題，重跑即可。
- RVM 推論太慢時會自動把輸入長邊從 960 降到 640（`adapt()`）。
