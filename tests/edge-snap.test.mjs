import test from 'node:test';import assert from 'node:assert/strict';
import {extract,PAPERS} from '../dist/vision.js';
import {DEMO_TOOLS} from '../dist/fixtures.js';
// Rectified 3 px/mm scenes with antialiased, blurred tools of known geometry.
const s=3,[pw,ph]=PAPERS.a4,w=Math.round(pw*s),h=Math.round(ph*s);
const circle=(cx,cy,r)=>Array.from({length:180},(_,i)=>[cx+r*Math.cos(i*Math.PI/90),cy+r*Math.sin(i*Math.PI/90)]);
const rot=(p,a,cx,cy)=>p.map(([x,y])=>[cx+(x-cx)*Math.cos(a)-(y-cy)*Math.sin(a),cy+(x-cx)*Math.sin(a)+(y-cy)*Math.cos(a)]);
const tools=[DEMO_TOOLS[2],circle(70,230,14),rot([[100,215],[160,215],[160,245],[100,245]],.3,130,230),rot([[60,70],[120,70],[120,88],[60,88]],-.2,90,79)];
function inside(x,y,p){let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>y)!==(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])c=!c;return c;}
function coverage(dx=0,dy=0){const cov=new Float32Array(w*h),k=4;for(const q of tools){const p=q.map(([x,y])=>[x+dx,y+dy]),xs=p.map(v=>v[0]*s),ys=p.map(v=>v[1]*s);
 for(let y=Math.floor(Math.min(...ys))-1;y<Math.max(...ys)+1;y++)for(let x=Math.floor(Math.min(...xs))-1;x<Math.max(...xs)+1;x++){let c=0;for(let j=0;j<k;j++)for(let i=0;i<k;i++)if(inside((x+(i+.5)/k)/s,(y+(j+.5)/k)/s,p))c++;cov[y*w+x]=Math.max(cov[y*w+x],c/k/k);}}return cov;}
function blur(cov,sigma){const r=Math.ceil(sigma*3),ker=[];for(let i=-r;i<=r;i++)ker.push(Math.exp(-i*i/(2*sigma*sigma)));const total=ker.reduce((a,b)=>a+b,0),t=new Float32Array(w*h),o=new Float32Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let i=-r;i<=r;i++)v+=cov[y*w+Math.max(0,Math.min(w-1,x+i))]*ker[i+r];t[y*w+x]=v/total;}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let i=-r;i<=r;i++)v+=t[Math.max(0,Math.min(h-1,y+i))*w+x]*ker[i+r];o[y*w+x]=v/total;}return o;}
const body=coverage(),inner=coverage(-1.5,0);
function render({cast=null,shine=null,paper=235,noise=10}={}){const o=blur(body,1),shadow=cast?blur(coverage(2.5,2),2.5):null,highlight=shine?blur(body.map((v,i)=>Math.max(0,v-inner[i])),1):null,data=new Uint8ClampedArray(w*h*4);let seed=7;
 for(let p=0;p<w*h;p++){seed=(seed*1664525+1013904223)>>>0;const bg=paper*(1-(shadow?cast*shadow[p]:0)),fg=highlight?40+(shine-40)*Math.min(1,highlight[p]/Math.max(.05,o[p])):40,v=bg+(fg-bg)*o[p]+((seed/4294967296)-.5)*noise;data[p*4]=data[p*4+1]=data[p*4+2]=v;data[p*4+3]=255;}return {width:w,height:h,data};}
function seg(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
const distance=(p,q)=>{let d=Infinity;for(let i=0;i<q.length;i++)d=Math.min(d,seg(p,q[i],q[(i+1)%q.length]));return d;};
// Signed distance from each outline vertex to the true boundary: positive is outside the tool.
function errors(paths){let sum=0,sq=0,n=0;for(const p of paths){const truth=tools.reduce((a,q)=>distance(p[0],q)<distance(p[0],a)?q:a);for(const v of p){const d=distance(v,truth)*(inside(v[0],v[1],truth)?-1:1);sum+=d;sq+=d*d;n++;}}return {bias:sum/n,rms:Math.sqrt(sq/n)};}
const trace=(image,method,snapEdges,paper=235)=>extract(image,'a4',method==='dark'?(40+paper)/2:160,20,method,{snapEdges});
// Grey paper with a chrome rim brighter than it, alone and beside its own shadow; and a
// near-white highlight that is darker than the paper, which luminance cannot recover.
const clean=render(),shadowed=render({cast:.45}),rim=render({paper:200,shine:250}),rimShadow=render({paper:200,shine:235,cast:.3}),nearWhite=render({shine:215});
for(const method of ['edges','dark']){
 test(`${method}: edge snapping removes pixel staircase and gap-closing bias`,()=>{const mask=errors(trace(clean,method,false)),snap=errors(trace(clean,method,true));assert.ok(Math.abs(snap.bias)<.05,JSON.stringify(snap));assert.ok(snap.rms<mask.rms*.85&&snap.rms<.16,JSON.stringify({mask,snap}));});
 test(`${method}: a hard cast shadow on one side is cut back to the tool edge`,()=>{const mask=errors(trace(shadowed,method,false)),snap=errors(trace(shadowed,method,true));assert.ok(snap.rms<mask.rms*.6,JSON.stringify({mask,snap}));assert.ok(snap.bias<.15,JSON.stringify(snap));});
 test(`${method}: a chrome rim brighter than grey paper stays inside the outline`,()=>{const mask=errors(trace(rim,method,false,200)),snap=errors(trace(rim,method,true,200));assert.ok(snap.rms<Math.min(.3,mask.rms*.85)&&Math.abs(snap.bias)<.12,JSON.stringify({mask,snap}));});
 test(`${method}: a rim beside its own shadow keeps the rim and drops the shadow`,()=>{const mask=errors(trace(rimShadow,method,false,200)),snap=errors(trace(rimShadow,method,true,200));assert.ok(snap.rms<mask.rms*.6&&Math.abs(snap.bias)<Math.max(.15,Math.abs(mask.bias)*.4),JSON.stringify({mask,snap}));});
 test(`${method}: a near-white highlight is not cut deeper than the visible dark edge`,()=>{const mask=errors(trace(nearWhite,method,false)),snap=errors(trace(nearWhite,method,true));assert.ok(snap.bias>mask.bias-.2,JSON.stringify({mask,snap}));});
}
test('Snapping can be disabled and keeps the same tools',()=>{const a=trace(clean,'edges',false),b=trace(clean,'edges',true);assert.equal(a.length,tools.length);assert.equal(b.length,tools.length);});
