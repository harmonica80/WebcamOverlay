# 第三方元件與授權

WebcamOverlay 的程式碼以 **GNU General Public License v3.0** 釋出（全文見 `LICENSE`）。
因為程式內含以 GPL-3.0 釋出的 Robust Video Matting 模型，散布本程式（含 EXE）時必須同時提供對應原始碼，並保留本檔與各元件授權。

| 元件 | 用途 | 授權 | 位置 |
|---|---|---|---|
| Robust Video Matting（Peter Lin 等，ByteDance） | 影片去背模型 `rvm_mobilenetv3_webgpu.onnx` | GPL-3.0 | `src/vendor/rvm/LICENSE`，https://github.com/PeterL1n/RobustVideoMatting |
| PP-MattingV2（PaddleSeg） | 進階去背模型 | Apache-2.0 | `src/vendor/ppmatting/LICENSE`、`NOTICE.md` |
| MediaPipe Tasks Vision 與 selfie segmentation／multiclass 模型（Google） | 品質／快速模式 | Apache-2.0 | https://github.com/google-ai-edge/mediapipe |
| ONNX Runtime Web（Microsoft） | 模型推論 | MIT | `src/vendor/onnxruntime/LICENSE`、`ThirdPartyNotices.txt` |
| Electron | 桌面應用程式執行環境 | MIT | EXE 內附 `LICENSE`、`LICENSES.chromium.html` |

## 圖片素材

`src/assets/decorations` 與 `src/assets/virtual-backgrounds` 的圖片維持 v0.2.43 起的
創用 CC 姓名標示-非商業性-相同方式分享 4.0 國際（CC BY-NC-SA 4.0）授權，與程式碼分開授權。

## 模型修改紀錄

- PP-MattingV2：沿用 v0.2.34 的池化修正版 ONNX，移除 Resize 空的 `roi`／`scales` 輸入後轉為 FP16（輸入輸出維持 FP32）。
- MediaPipe selfie segmentation：模型權重未修改，只加入 Tasks API 需要的 metadata。
- RVM：以官方 FP32 ONNX 為基礎，由 `scripts/patch-rvm-model.py` 修改（2026-11-11）：通道數不是 4 的倍數的卷積補上全為 0 的輸入通道與權重，以避開 ONNX Runtime Web WebGPU 的卷積錯誤；輸出與原模型數學上相同。依 GPL-3.0 第 5 條標示此修改。
