const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),dest=path.join(root,'src/vendor/onnxruntime');
fs.mkdirSync(dest,{recursive:true});
for(const name of ['ort.webgpu.min.js','ort-wasm-simd-threaded.asyncify.mjs','ort-wasm-simd-threaded.asyncify.wasm'])
  fs.copyFileSync(path.join(root,'node_modules/onnxruntime-web/dist',name),path.join(dest,name));
