// Small deterministic PNG/APNG fixtures for import and playback verification.
const zlib=require('zlib');
function chunk(type,data){
  const t=Buffer.from(type),len=Buffer.alloc(4);len.writeUInt32BE(data.length);
  let crc=0xffffffff;for(const byte of Buffer.concat([t,data])){crc^=byte;for(let j=0;j<8;j++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}
  const end=Buffer.alloc(4);end.writeUInt32BE((crc^0xffffffff)>>>0);return Buffer.concat([len,t,data,end]);
}
function png(animated=false,width=64,height=64){
  const sig=Buffer.from([137,80,78,71,13,10,26,10]),ihdr=Buffer.alloc(13);
  ihdr.writeUInt32BE(width);ihdr.writeUInt32BE(height,4);ihdr[8]=8;ihdr[9]=6;
  const image=color=>{const raw=Buffer.alloc((width*4+1)*height);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const o=y*(width*4+1)+1+x*4;raw[o]=color[0];raw[o+1]=color[1];raw[o+2]=color[2];raw[o+3]=(x<8||y<8||x>=width-8||y>=height-8)?0:255;}return zlib.deflateSync(raw);};
  const control=seq=>{const b=Buffer.alloc(26);b.writeUInt32BE(seq);b.writeUInt32BE(width,4);b.writeUInt32BE(height,8);b.writeUInt16BE(1,20);b.writeUInt16BE(4,22);return chunk('fcTL',b);};
  const parts=[sig,chunk('IHDR',ihdr)];
  if(animated){const a=Buffer.alloc(8);a.writeUInt32BE(2);parts.push(chunk('acTL',a),control(0));}
  parts.push(chunk('IDAT',image([230,70,90])));
  if(animated){const seq=Buffer.alloc(4);seq.writeUInt32BE(2);parts.push(control(1),chunk('fdAT',Buffer.concat([seq,image([65,150,235])])));}
  parts.push(chunk('IEND',Buffer.alloc(0)));return Buffer.concat(parts);
}
module.exports={png,chunk};
