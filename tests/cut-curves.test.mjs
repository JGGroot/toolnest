import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCutPaths,bounds,exportSVG,exportDXF,smoothOutline} from '../dist/vision.js';
import {hasCrossings,nearestOnRing} from '../dist/outline.js';
import {normalizePaths,DEFAULT_FOAM,exportFoamSVG} from '../dist/foam-model.js';
import {buildFoamMesh,meshReport} from '../dist/foam-stl.js';
const body=[[50,40],[70,40],[70,160],[50,160]];
const radial=(p,f)=>Math.hypot(p[0]-f.x,p[1]-f.y);
test('Finger arcs retain their radius and sub-0.006 mm chords at every cleanup/style/strength',()=>{
 for(const r of [3,8,25])for(const simplification of [0,.18,.9,1])for(const mode of ['fair','round','relax','detail'])for(const passes of [0,1,5]){
  const f={x:70,y:100,r},paths=makeCutPaths([body],[f],'a4',1,passes,{mode,simplification});
  assert.equal(paths.length,1);const ring=paths[0];assert.equal(hasCrossings(ring),false);
  let segments=0;
  for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length];
   if(a[0]<71.01||b[0]<71.01)continue;
   assert.ok(Math.abs(radial(a,f)-r)<.00002,'circle was altered by body smoothing');
   assert.ok(Math.abs(radial(b,f)-r)<.00002);
   const mid=[(a[0]+b[0])/2,(a[1]+b[1])/2];
   assert.ok(r-radial(mid,f)<.00502,'export chord visibly flattens the circle');segments++;
  }
  assert.ok(segments>15,`${mode}/${passes}/${r}: too few circular arc segments`);
 }
});
test('Vector clearance is continuous in mm, includes erosion and reversals, and keeps tools that extend past the sheet',()=>{
 for(const delta of [-.31,0,.07,1.13])for(const reversed of [false,true]){
  const [ring]=makeCutPaths([reversed?[...body].reverse():body],[],'a4',delta,0);
  const b=bounds(ring);assert.ok(Math.abs(b.minX-(50-delta))<.00002);assert.ok(Math.abs(b.maxY-(160+delta))<.00002);
 }
 const paths=makeCutPaths([body],[{x:1,y:1,r:8},{x:70,y:100,r:8},{x:70,y:106,r:8}],'a4',1,3,{mode:'fair'});
 for(const ring of paths){assert.ok(ring.flat().every(Number.isFinite));assert.equal(hasCrossings(ring),false);}
 const off=bounds(makeCutPaths([[[-30,20],[40,20],[40,50],[-30,50]]],[],'a4',0,0).flat());assert.ok(Math.abs(off.minX+30)<.01,'a tool hanging off the sheet edge is kept, not clipped');
 const far=bounds(makeCutPaths([[[-1500,10],[-1400,10],[-1400,40],[-1500,40]],body],[],'a4',0,0).flat());assert.ok(far.minX>=-1000,'geometry far from the sheet is still clipped to the working area');
});
test('Rounded style uses tangent corner curves, leaving long straight spans and dimensions intact',()=>{
 const p=smoothOutline(body,3,'round',{radius:1});assert.ok(p.length>32);
 assert.deepEqual(bounds(p),bounds(body));assert.equal(hasCrossings(p),false);
 for(const q of p)assert.ok(nearestOnRing(q,body).distance<.5);
});
test('The same high-resolution circular geometry survives SVG, DXF, foam placement and a manifold STL',()=>{
 const paths=makeCutPaths([body],[{x:70,y:100,r:8}],'a4',.7,3,{mode:'fair',simplification:.9});
 const svg=exportSVG(paths,'a4'),dxf=exportDXF(paths,'a4');
 for(const [x,y] of paths[0]){assert.ok(svg.includes(`${x.toFixed(3)} ${y.toFixed(3)}`));assert.ok(dxf.includes(`10\n${x.toFixed(4)}\n20\n${(297-y).toFixed(4)}`));}
 const shape=normalizePaths(paths),tool={id:'curve',name:'Curved grip',shape,x:30,y:30,rotation:0,depth:15,zones:[]},data={name:'Curve export',foam:{...DEFAULT_FOAM,width:200,height:200},tools:[tool]};
 assert.ok(exportFoamSVG(data).length>svg.length/2);assert.equal(meshReport(buildFoamMesh(data)).badEdges,0);
});
test('Cloned worker inputs reuse refinement without leaking later grip or clearance changes',()=>{
 const run=(fingers=[],clearance=1)=>makeCutPaths([structuredClone(body)],fingers,'a4',clearance,3,{mode:'fair'});
 const original=run(),saved=structuredClone(original);
 for(const y of [80,95,110])assert.notDeepEqual(run([{x:70,y,r:8}]),original);
 assert.notDeepEqual(run([],.13),original);
 assert.deepEqual(run(),saved);assert.deepEqual(original,saved);
});
