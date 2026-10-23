const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const MAX_BYTES = 20 * 1024 * 1024;
const signature = Buffer.from([137,80,78,71,13,10,26,10]);
function inspectPng(buffer) {
  if (buffer.length > MAX_BYTES) throw Error('圖檔不可超過 20 MB。');
  if (buffer.length < 33 || !buffer.subarray(0,8).equals(signature)) throw Error('請選擇 PNG 或 APNG 圖檔。');
  let width = 0, height = 0, frames = 1, controls = 0, ended = false, imageData = false, animation = false;
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset), type = buffer.toString('ascii',offset+4,offset+8), start = offset+8;
    if (offset + length + 12 > buffer.length) throw Error('PNG 圖檔不完整。');
    if (offset === 8 && (type !== 'IHDR' || length !== 13)) throw Error('PNG 標頭不正確。');
    if (type === 'IHDR') {
      if (width || length !== 13) throw Error('PNG 標頭不正確。');
      width=buffer.readUInt32BE(start);height=buffer.readUInt32BE(start+4);
      if (!width || !height || width>2048 || height>2048) throw Error('圖檔寬、高需介於 1 至 2048 像素。');
    }
    if (type === 'acTL') {
      if (length !== 8 || animation || imageData) throw Error('APNG 動畫資訊不正確。');
      animation = true;
      frames = buffer.readUInt32BE(start);
      if (!frames || frames>120) throw Error('APNG 動畫最多 120 格。');
      if (width*height*frames > 64000000) throw Error('動畫總像素過多，請縮小尺寸或減少影格（上限 6,400 萬像素）。');
    }
    if (type === 'fcTL') {
      if (length !== 26 || !animation) throw Error('APNG 影格資訊不正確。');
      controls++;
      const w=buffer.readUInt32BE(start+4),h=buffer.readUInt32BE(start+8),x=buffer.readUInt32BE(start+12),y=buffer.readUInt32BE(start+16);
      if (!w||!h||w+x>width||h+y>height) throw Error('APNG 影格超出畫布範圍。');
    }
    if (type === 'IDAT') imageData = true;
    if (type === 'IEND') { ended=true;break; }
    offset += length+12;
  }
  if (!ended || !imageData || (animation && controls !== frames)) throw Error('PNG／APNG 結構不完整。');
  if (width*height*frames > 64000000) throw Error('動畫總像素過多，請縮小尺寸或減少影格（上限 6,400 萬像素）。');
  return {width,height,frames,animated:controls>0};
}
function assetPath(directory,id) {
  if (!/^[a-f0-9]{64}\.png$/.test(id || '')) throw Error('圖檔識別碼不正確，請重新匯入。');
  return path.join(directory,id);
}
async function readLimited(filename) {
  const file=await fs.promises.open(filename,'r');
  try {
    const stat=await file.stat();
    if (!stat.isFile() || stat.size>MAX_BYTES) throw Error('請選擇不超過 20 MB 的 PNG／APNG 圖檔。');
    const buffer=Buffer.alloc(stat.size+1);let bytes=0;
    while(bytes<buffer.length){const read=await file.read(buffer,bytes,buffer.length-bytes,null);if(!read.bytesRead)break;bytes+=read.bytesRead;}
    if(bytes>stat.size)throw Error('圖檔讀取期間已變更，請重新選擇。');
    return buffer.subarray(0,bytes);
  } finally { await file.close(); }
}
async function importAsset(filename,directory,nativeImage) {
  const buffer=await readLimited(filename),info=inspectPng(buffer);
  if(nativeImage.createFromBuffer(buffer).isEmpty())throw Error('無法解碼圖檔，請重新匯出為 PNG／APNG。');
  const id=crypto.createHash('sha256').update(buffer).digest('hex')+'.png';
  await fs.promises.mkdir(directory,{recursive:true});
  await fs.promises.writeFile(assetPath(directory,id),buffer);
  return {asset:id,assetName:path.basename(filename),...info};
}
async function loadAsset(id,directory,nativeImage) {
  const buffer=await readLimited(assetPath(directory,id));inspectPng(buffer);
  const still=nativeImage.createFromBuffer(buffer);
  if(still.isEmpty())throw Error('圖檔損壞，請重新匯入。');
  return {ok:true,url:'data:image/png;base64,'+buffer.toString('base64'),stillUrl:still.toDataURL()};
}
module.exports={inspectPng,assetPath,importAsset,loadAsset};
