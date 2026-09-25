# PP-MattingV2

Source: PaddlePaddle/PaddleSeg, release/2.10, Matting.
https://github.com/PaddlePaddle/PaddleSeg/tree/release/2.10/Matting

Official inference package:
https://paddleseg.bj.bcebos.com/matting/models/deploy/ppmattingv2-stdc1-human_512.zip

Distributed under Apache License 2.0 (see LICENSE).
Modified 2026-09-24: converted fixed 512x512 inference model to ONNX opset 13 with
paddle2onnx 1.3.1; corrected adaptive average pooling 8x8 -> 6x6 by AveragePool
2x2 stride 1 plus Gather indices [0,1,2,4,5,6] on each spatial axis.
This preserves the original Paddle pooling bins instead of the exporter's approximation.
Original authors do not endorse these modifications.

Input: float32 RGB NCHW [1,3,512,512], normalization pixel/127.5 - 1.
Output: foreground alpha; restore to original frame dimensions by stretching.
No demonstration videos or training datasets are distributed with this application.
