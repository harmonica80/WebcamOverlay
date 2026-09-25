const {test}=require('node:test');
const assert=require('node:assert/strict');
const MatteRefiner=require('../src/matte-refiner');
const rgba=(values)=>Uint8ClampedArray.from(values.flatMap(v=>[v,v,v,v]));
const alpha=a=>Array.from(a).filter((_,i)=>i%4===3);
test('fully transparent and opaque masks retain their endpoints',()=>{
  const r=new MatteRefiner();
  assert.deepEqual(alpha(r.refine(rgba([0,0,255,255]),rgba([0,0,255,255]),4,1)),[0,0,255,255]);
});
test('image guidance preserves a sharp colour boundary better than uniform guidance',()=>{
  const mask=rgba([0,0,255,255]);
  const sharp=alpha(new MatteRefiner().refine(mask,rgba([0,0,255,255]),4,1,{edge:0,feather:100}));
  const uniform=alpha(new MatteRefiner().refine(mask,rgba([100,100,100,100]),4,1,{edge:0,feather:100}));
  assert.ok(sharp[1]<uniform[1]);assert.ok(sharp[2]>uniform[2]);
});
test('temporal filtering reduces small static changes but does not trail a large change',()=>{
  const r=new MatteRefiner(),opts={edge:0,feather:100,stability:100};
  r.refine(rgba([120]),rgba([100]),1,1,opts);
  const steady=r.refine(rgba([125]),rgba([100]),1,1,opts)[3];
  const raw=new MatteRefiner().refine(rgba([125]),rgba([100]),1,1,opts)[3];
  assert.ok(steady<raw);
  assert.equal(r.refine(rgba([0]),rgba([0]),1,1,opts)[3],0);
});
test('reset and dimension changes discard history',()=>{
  const r=new MatteRefiner(),opts={edge:0,stability:100};r.refine(rgba([120]),rgba([100]),1,1,opts);r.reset();
  assert.deepEqual(r.refine(rgba([125]),rgba([100]),1,1,opts),new MatteRefiner().refine(rgba([125]),rgba([100]),1,1,opts));
  assert.equal(r.refine(rgba([0,255]),rgba([0,255]),2,1).length,8);
});
test('contour contraction removes more uncertain edge coverage',()=>{
  const mask=rgba([140]);
  assert.ok(new MatteRefiner().refine(mask,mask,1,1,{edge:100})[3]<new MatteRefiner().refine(mask,mask,1,1,{edge:0})[3]);
});
