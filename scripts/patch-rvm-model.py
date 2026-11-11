"""Make Robust Video Matting run correctly on ONNX Runtime's WebGPU execution provider.

ONNX Runtime Web 1.24 (WebGPU) computes some Conv layers wrongly when the input
channel count is not a multiple of 4 (confirmed for RVM's 171-channel decoder conv:
171 channels -> wrong, 172 -> exact). The matte then becomes almost fully transparent.

Fix: for every ordinary Conv (group == 1) whose input channel count is not a multiple
of 4, zero-pad the input channels (Pad node) and the weights (extra zero input
channels). The result is mathematically identical.

Usage: python scripts/patch-rvm-model.py rvm_mobilenetv3_fp32.onnx src/vendor/rvm/rvm_mobilenetv3_webgpu.onnx
Requires: pip install onnx numpy
"""
import sys
import numpy as np
import onnx
from onnx import helper, numpy_helper


def patch(source, target):
    model = onnx.load(source)
    graph = model.graph
    inits = {i.name: i for i in graph.initializer}
    new_nodes, patched = [], []
    for node in graph.node:
        if node.op_type == 'Conv' and node.input[1] in inits:
            group = next((helper.get_attribute_value(a) for a in node.attribute if a.name == 'group'), 1)
            weight = numpy_helper.to_array(inits[node.input[1]])
            cin = weight.shape[1]
            if group == 1 and cin % 4:
                extra = 4 - cin % 4
                padded = np.concatenate([weight, np.zeros((weight.shape[0], extra) + weight.shape[2:], weight.dtype)], axis=1)
                inits[node.input[1]].CopyFrom(numpy_helper.from_array(padded, node.input[1]))
                pads_name = f'{node.name}_channel_pads'
                graph.initializer.append(numpy_helper.from_array(np.array([0, 0, 0, 0, 0, extra, 0, 0], np.int64), pads_name))
                padded_input = f'{node.input[0]}_padded_{node.name}'
                new_nodes.append(helper.make_node('Pad', [node.input[0], pads_name], [padded_input], name=f'{node.name}_channel_pad', mode='constant'))
                node.input[0] = padded_input
                patched.append(f'{node.name}: {cin} -> {cin + extra}')
        new_nodes.append(node)
    del graph.node[:]
    graph.node.extend(new_nodes)
    onnx.checker.check_model(model)
    onnx.save(model, target)
    return patched


if __name__ == '__main__':
    for line in patch(sys.argv[1], sys.argv[2]):
        print('padded', line)
