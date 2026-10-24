import test from 'node:test';import assert from 'node:assert/strict';
import {markerBits,homography,project} from '../dist/vision.js?v=20261024-scan2';
import {TARGET,targetCorners,findTarget,measureCorners,readScanDPI,likelyScanDPI,foamColours,detectPockets} from '../dist/foam-scan.js';
// Synthetic RGB image; `paint(x,y)` returns [r,g,b].
function image(w,h,paint){const data=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const c=paint(x,y),i=(y*w+x)*4;data[i]=c[0];data[i+1]=c[1];data[i+2]=c[2];data[i+3]=255;}return {width:w,height:h,data};}
test('A photographed scale target is found and measures a foam outline on its plane',()=>{
 // Card at 6 px/mm, tilted in perspective, sitting in a larger scene.
 const H=homography([[0,0],[TARGET.width,0],[TARGET.width,TARGET.height],[0,TARGET.height]],[[260,180],[760,210],[740,520],[250,500]]),inv=homography([[260,180],[760,210],[740,520],[250,500]],[[0,0],[TARGET.width,0],[TARGET.width,TARGET.height],[0,TARGET.height]]);
 const cell=TARGET.size/8,img=image(1000,700,(x,y)=>{const [u,v]=project(inv,[x+.5,y+.5]);if(u<0||v<0||u>TARGET.width||v>TARGET.height)return [120,110,100];for(let id=0;id<4;id++){const [[mx,my]]=targetCorners(id);if(u>=mx&&v>=my&&u<mx+TARGET.size&&v<my+TARGET.size){const bits=markerBits(id);return bits[Math.floor((v-my)/cell)][Math.floor((u-mx)/cell)]?[0,0,0]:[255,255,255];}}return [255,255,255];});
 const t=findTarget(img);assert.ok(t,'target found');assert.ok(t.rms<.5,`rms ${t.rms}`);
 // A 60 x 30 mm rectangle on the same plane measures back to its size.
 const corners=[[10,10],[70,10],[70,40],[10,40]].map(p=>project(H,p)),m=measureCorners(corners,p=>project(t.inverse,p));assert.ok(Math.abs(m.width-60)<.6,`width ${m.width}`);assert.ok(Math.abs(m.height-30)<.6,`height ${m.height}`);
 assert.equal(findTarget(image(400,300,()=>[200,200,200])),null);});
test('Scan resolution is read from JPEG JFIF/EXIF and PNG pHYs; camera defaults are not treated as scans',()=>{
 const jfif=dpi=>{const b=new Uint8Array([0xff,0xd8,0xff,0xe0,0,16,0x4a,0x46,0x49,0x46,0,1,1,1,dpi>>8,dpi&255,dpi>>8,dpi&255,0,0,0xff,0xda]);return b.buffer;};
 assert.equal(readScanDPI(jfif(300)),300);assert.equal(likelyScanDPI(readScanDPI(jfif(72))),false);assert.equal(likelyScanDPI(300),true);
 const png=new Uint8Array(8+12+9+12);png.set([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]);const v=new DataView(png.buffer);v.setUint32(8,9);png.set([0x70,0x48,0x59,0x73],12);v.setUint32(16,23622);v.setUint32(20,23622);png[24]=1;v.setUint32(29,0);png.set([0x49,0x44,0x41,0x54],33);assert.ok(Math.abs(readScanDPI(png.buffer)-600)<.1);
 assert.equal(readScanDPI(new Uint8Array([1,2,3,4]).buffer),null);});
test('Pockets in an aligned two-tone foam photo come back at their size, with optional shrink',()=>{
 // 300 x 200 mm foam at 3 px/mm: dark grey surface, yellow pockets (a 100 x 40 slot and a 40 mm circle), light noise.
 const s=3,img=image(900,600,(x,y)=>{const u=x/s,v=y/s,noise=((x*7+y*13)%9)-4,pocket=(u>30&&u<130&&v>40&&v<80)||Math.hypot(u-220,v-120)<20;return pocket?[225+noise,200+noise,40+noise]:[70+noise,72+noise,75+noise];});
 const colours=foamColours(img),found=detectPockets(img,300,colours);assert.equal(found.length,2);assert.ok(Math.abs(found[0].area-4000)/4000<.04,`slot ${found[0].area}`);assert.ok(Math.abs(found[1].area-Math.PI*400)/(Math.PI*400)<.05,`circle ${found[1].area}`);
 const shrunk=detectPockets(img,300,colours,{shrinkMm:2});assert.ok(shrunk[0].area<found[0].area-300,'shrink pulls outlines in');
 assert.equal(detectPockets(img,300,colours,{minArea:2000}).length,1);
 const ring=found[0].shape[0][0];assert.deepEqual(ring[0],ring.at(-1));});
test('A scale card lying on the foam is ignored when its position is excluded',()=>{const s=3,img=image(900,600,(x,y)=>{const u=x/s,v=y/s;if(u>200&&u<280&&v>20&&v<70)return [250,250,250];return (u>30&&u<130&&v>40&&v<80)?[225,200,40]:[70,72,75];});const colours=foamColours(img);
 const card=[[200,20],[280,20],[280,70],[200,70]],all=detectPockets(img,300,colours,{sensitivity:.3}),without=detectPockets(img,300,colours,{sensitivity:.3,exclude:[card]});assert.ok(all.length>=without.length);assert.equal(without.length,1);assert.ok(Math.abs(without[0].area-4000)/4000<.05);});
test('Islands of top surface inside a pocket come back as holes, so they are cut around',()=>{const s=3,img=image(900,600,(x,y)=>{const u=x/s,v=y/s,r=Math.hypot(u-100,v-100),slot=u>180&&u<280&&v>60&&v<140,peg=Math.hypot(u-230,v-100)<8;return (r<40&&r>=15)||(slot&&!peg)?[225,200,40]:[70,72,75];});
 const found=detectPockets(img,300,foamColours(img));assert.equal(found.length,2);const ring=found.find(q=>Math.abs(q.area-Math.PI*(1600-225))/(Math.PI*1375)<.05),slot=found.find(q=>q!==ring);assert.ok(ring,`ring areas ${found.map(q=>q.area)}`);assert.equal(ring.islands,1);assert.equal(ring.shape[0].length,2);
 assert.equal(slot.islands,1);assert.ok(Math.abs(slot.area-(8000-Math.PI*64))/8000<.04,`slot ${slot.area}`);});
