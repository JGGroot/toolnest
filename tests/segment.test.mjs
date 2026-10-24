import test from 'node:test';
import assert from 'node:assert/strict';
import {maskToPaths,nudgeInside,pointToImage,imageToPoint,normalizedPrompts,validPrompts,bestMask,promptTarget} from '../dist/segment-model.js?v=20261025-cut2';
import {bounds} from '../dist/vision.js?v=20261025-cut2';
import {computePreview,DEFAULT_SETTINGS} from '../dist/preview-model.js?v=20261025-cut2';
function fixture(shape,{origin=[0,0],scale=3,width=360,height=390}={}){const mask=new Uint8Array(width*height),data=new Uint8ClampedArray(width*height*4);for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=y*width+x,on=shape(x/scale+origin[0],y/scale+origin[1]);mask[i]=on?1:0;data[i*4]=data[i*4+1]=data[i*4+2]=on?25:245;data[i*4+3]=255;}return {result:{mask,width,height},rect:{data,width,height,origin,scale}};}
function near(a,b,tolerance=.3){assert.ok(Math.abs(a-b)<=tolerance,`${a} differs from ${b}`);}
test('Rectangle and circle masks retain millimetre dimensions with real-edge snapping',()=>{
 for(const [shape,w,h] of [[(x,y)=>x>=20&&x<50&&y>=25&&y<85,30,60],[(x,y)=>Math.hypot(x-50,y-60)<15,30,30]]){const {result,rect}=fixture(shape),paths=maskToPaths(result,rect,'a4',{snapEdges:true});assert.equal(paths.length,1);const b=bounds(paths[0]);near(b.maxX-b.minX,w);near(b.maxY-b.minY,h);}
});
test('Extended rectified origins preserve a tool crossing the printed sheet edge',()=>{const {result,rect}=fixture((x,y)=>x>=-12&&x<28&&y>=20&&y<80,{origin:[-30,-10]});const [path]=maskToPaths(result,rect),b=bounds(path);near(b.minX,-12);near(b.maxX,28);near(b.maxY-b.minY,60);});
test('Prompts map through rectified origins and non-default pixel scale without clamping',()=>{const rect={width:800,height:900,origin:[-25,-40],scale:2.5},p={x:-10,y:20,label:0};assert.deepEqual(pointToImage(p,rect),[37.5,150]);assert.deepEqual(imageToPoint([37.5,150],rect),{x:-10,y:20});assert.deepEqual(normalizedPrompts([p],rect),[{x:37.5/800,y:150/900,label:0}]);assert.throws(()=>normalizedPrompts([{x:-30,y:0,label:1}],rect));});
test('A downscaled mask maps back to source pixels and snapping ignores transparent photo regions',()=>{const {result,rect}=fixture((x,y)=>x>=20&&x<50&&y>=25&&y<85);const mask=new Uint8Array(120*130);for(let y=0;y<130;y++)for(let x=0;x<120;x++)mask[y*120+x]=result.mask[y*3*360+x*3];const b=bounds(maskToPaths({mask,width:120,height:130},rect)[0]);near(b.maxX-b.minX,30);near(b.maxY-b.minY,60);for(let i=3;i<rect.data.length;i+=4)rect.data[i]=0;assert.equal(maskToPaths(result,rect).length,0);});
test('Only a positive-prompt region is retained; invalid masks and prompt metadata are rejected',()=>{const {result,rect}=fixture((x,y)=>(x>=10&&x<25&&y>=20&&y<60)||(x>=70&&x<90&&y>=20&&y<60));const paths=maskToPaths(result,rect,'a4',{points:[{x:15,y:30,label:1}]});assert.equal(paths.length,1);assert.ok(bounds(paths[0]).maxX<30);assert.throws(()=>maskToPaths({mask:new Uint8Array(3),width:2,height:2},rect));assert.equal(validPrompts({engine:'sam',points:[{x:1,y:2,label:1}]}),true);for(const points of [[{x:1,y:2,label:0}],[{x:NaN,y:2,label:1}],Array(65).fill({x:1,y:2,label:1})])assert.equal(validPrompts({engine:'sam',points}),false);assert.equal(bestMask([.2,.9,.5]),1);});
test('Tap previews never retrace away prompt tools when smoothing or threshold changes',()=>{const tools=[{name:'Tapped',points:[[40,40],[60,40],[60,80],[40,80]],tap:{engine:'sam',points:[{x:50,y:60,label:1}]}}],s={...DEFAULT_SETTINGS,paper:'a4',traceMethod:'tap',tools,fingers:[],selected:0};const {rect}=fixture(()=>false);const a=computePreview(s,rect,true),b=computePreview({...s,smoothing:4,threshold:200},rect,true);assert.deepEqual(a.tools,tools);assert.deepEqual(b.tools,tools);assert.equal(promptTarget(tools,{x:50,y:60},0),0);assert.equal(promptTarget(tools,{x:90,y:60},0),-1);assert.equal(promptTarget(tools,{x:90,y:60},0,true),0);});
import {componentAt,pickCandidate,zoomWindow,proposalBox,rasterize,maskIoU,spreadPoints} from '../dist/segment-model.js?v=20261025-cut2';
const grid=(w,h,on)=>{const m=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++)m[y*w+x]=on(x,y)?1:0;return m;};
test('The region under a tap is chosen: sheet-sized answers are rejected, whole tools beat parts, outlines decide',()=>{const w=100,h=80,tool=grid(w,h,(x,y)=>x>=20&&x<70&&y>=30&&y<40),part=grid(w,h,(x,y)=>x>=20&&x<35&&y>=30&&y<40),sheet=grid(w,h,()=>true),apart=grid(w,h,(x,y)=>(x>=20&&x<70&&y>=30&&y<40)||(x>=80&&y>=70));
 const c=componentAt(apart,w,h,30,35);assert.equal(c.count,500);assert.equal(c.edges,0);assert.deepEqual(c.box,[20,30,70,40]);assert.equal(componentAt(tool,w,h,5,5,2),null);
 assert.equal(pickCandidate([{mask:sheet},{mask:part},{mask:tool}],w,h,[25,35]).count,500);
 const outline=[[20,30],[35,30],[35,40],[20,40]];assert.equal(pickCandidate([{mask:tool},{mask:part}],w,h,[25,35],{outline}).count,150);
 assert.ok(maskIoU(rasterize([[20,30],[70,30],[70,40],[20,40]],w,h),tool)>.99);});
test('Zoom windows stay inside the photo, keep a margin and grow to a minimum size; outlines become tap proposals',()=>{const rect={width:900,height:1200,scale:3,origin:[-30,-20]},win=zoomWindow([300,300,360,330],rect);assert.ok(win[2]>=120&&win[3]>=120);assert.ok(win[0]<=300&&win[0]+win[2]>=360&&win[1]<=300&&win[1]+win[3]>=330);const edge=zoomWindow([0,0,60,60],rect);assert.deepEqual(edge.slice(0,2),[0,0]);
 rect.proposals=[[[10,10],[60,10],[60,30],[10,30]]];const box=proposalBox(rect,{x:20,y:20});assert.deepEqual(box.slice(0,4),[120,90,270,150]);assert.equal(box.outline.length,4);assert.equal(proposalBox(rect,{x:200,y:200}),null);assert.ok(proposalBox(rect,{x:63,y:20}),'within 6 mm of an outline');
 const pts=spreadPoints([[0,0],[300,0],[300,20],[0,20]],5);assert.equal(pts.length,5);assert.ok(pts.every(([x,y])=>y>5&&y<15));assert.ok(pts[4][0]-pts[0][0]>200,'spread along the long axis');});
test('Cast shadow kept by the model is trimmed; coloured and textured parts of the tool are not',()=>{
 // Tool 20–50 mm, shadow band 50–52 mm (paper ×0.6), red grip 20–24 mm; the model's mask covers all of it.
 const paint=(x,y)=>x>=20&&x<50&&y>=25&&y<85?(x<24?[200,40,40]:[25,25,25]):x>=50&&x<52&&y>=25&&y<85?[147,147,150]:[245,245,245];
 const {result,rect}=fixture((x,y)=>x>=20&&x<52&&y>=25&&y<85);for(let y=0;y<390;y++)for(let x=0;x<360;x++){const c=paint(x/3,y/3),i=(y*360+x)*4;rect.data[i]=c[0];rect.data[i+1]=c[1];rect.data[i+2]=c[2];}
 const b=bounds(maskToPaths(result,rect)[0]);near(b.minX,20);near(b.maxX,50,.7);near(b.maxY,85,.7);
 const kept=bounds(maskToPaths(result,rect,'a4',{trimShadow:false})[0]);near(kept.maxX,52);
 // The same band made grey and textured (knurling) is tool, not shadow.
 for(let y=75;y<255;y++)for(let x=150;x<156;x++){const v=(x+y)%4<2?100:190,i=(y*360+x)*4;rect.data[i]=rect.data[i+1]=rect.data[i+2]=v;}
 assert.ok(bounds(maskToPaths(result,rect)[0]).maxX>51.5);
});
test('A tap on or just off a tool edge moves the nearest point that is safely inside',()=>{
 const bar=[[0,0],[100,0],[100,10],[0,10]],near=(a,b)=>Math.abs(a-b)<=.6;
 assert.deepEqual(nudgeInside(bar,{x:50,y:5,label:1},3),{x:50,y:5,label:1});
 for(const p of [{x:50,y:.5},{x:50,y:-2},{x:30,y:11}]){const q=nudgeInside(bar,p,3);assert.ok(near(q.x,p.x),`${q.x} vs ${p.x}`);assert.ok(q.y>=2.9&&q.y<=7.1);}
 // Thinner than twice the depth: as deep as the outline allows.
 const q=nudgeInside([[0,0],[100,0],[100,3],[0,3]],{x:20,y:-1},3);assert.ok(q.y>1&&q.y<2);
 assert.deepEqual(nudgeInside(bar,{x:300,y:300},3),{x:300,y:300});
});
