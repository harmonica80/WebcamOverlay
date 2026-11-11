# v0.3.0 去背流程與驗證

## 流程

1. 每次推論先擷取一張影格快照（長邊最多 1280 px），遮罩、前景色與模糊背景都來自同一張，避免錯位。
2. 依模式推論：
   - **影片去背（RVM）**：輸入長邊 960 px（GPU 跟不上時自動降為 640 px），粗略階段約 480 px；循環狀態跨影格保留，切換來源或設定時重設。
   - **進階（PP-MattingV2）**：等比例縮放後置中於 512 × 512，上下補邊複製最外側像素，輸出只取有效區域。
   - **品質**：MediaPipe Tasks selfie multiclass（人物 = 1 − 背景機率）；模型不存在時改用一般 selfie 模型。
   - **快速**：MediaPipe Tasks 橫式 selfie 模型。
3. `matte-gpu.js`（WebGL2）：以攝影機畫面為導引做聯合雙邊放大 → 輪廓收縮／邊緣柔和 → 依畫面與遮罩變化量做動作感知時間平滑 → RVM 模式在半透明邊緣改用模型預測的前景色。
4. 無 WebGL2 時改用 CPU 版（`MatteRefiner`）；RVM／進階無法啟動時改用品質模式並顯示提示。每個視窗同時只保留一個模型。

## 自動驗證（2026-11-11，Linux 容器，無實體 GPU）

- `npm test`：40 項回歸測試通過（含新的交換來源、原子寫檔、引擎回退與過期結果測試）。
- `WEBCAM_QA_CPU=1 npx electron scripts/verify-matting-electron.js`：以 MODNet 示範影格作合成攝影機，六種情境（RVM、進階、品質、快速、RVM＋模糊、品質＋虛擬背景）都產生正確透明度（角落 0、人物 255），回退測試通過。結果圖：`matting-v0.3.0-qa.png`（左上起：RVM、進階、品質、快速、RVM＋模糊、品質＋教室背景）。
- 容器沒有 GPU，所以 RVM 與 PP 以 CPU（WASM）執行，耗時（約 350／700 ms）不代表實機速度；WebGL2 修邊由軟體 GL 執行。
- FP16 數值：PP-MattingV2 FP16 與 FP32 最大差 0.029、平均 0.00003。RVM 官方 FP16 版在 CPU 上正常（最大差 0.023），但使用者實機回報在 WebGPU 上人物完全透明，v0.3.2 查明原因為 ONNX Runtime WebGPU 卷積在 171 通道時算錯，改用補齊通道的模型後，WebGPU 結果與 CPU 一致。

## 尚待實機確認

- WebGPU＋FP16 在 RTX 3060 與 Intel Iris Xe 上的實際 FPS、雙攝影機同時執行 RVM 的負載。
- selfie multiclass 模型（需 `npm install` 或 `npm run fetch-models` 下載）的實際效果。
- 長時間執行、低光源與快速動作。
