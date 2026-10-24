import {vectorCutPaths} from './cut-geometry.js?v=20261025-pho1';
import {fairOutline,cleanRing,roundCorners,hasCrossings} from './outline.js?v=20261025-pho1';
import {edgeSilhouette} from './segmentation.js?v=20261025-pho1';
import Clipper from './vendor/clipper.js';
// All geometry is expressed in millimetres. No image leaves the browser.
export const PAPERS={a4:[210,297],letter:[215.9,279.4]};
export const CODES=[
'100101011110110001001011101100010110',
'111000010101101011001100110010100111',
'101110001011110100011001100010111001',
'110011101000010110111001001101100010'];
export function markerBits(id){const a=Array.from({length:8},()=>Array(8).fill(1));for(let y=1;y<7;y++)for(let x=1;x<7;x++)a[y][x]=+CODES[id][(y-1)*6+x-1];return a;}
export function markerCorners(id,paper='a4'){const [w,h]=PAPERS[paper],s=20,x=id%2?w-28:8,y=id>1?h-28:8;return [[x,y],[x+s,y],[x+s,y+s],[x,y+s]];}
export function solve(A,b){A=A.map((r,i)=>[...r,b[i]]);const n=b.length;for(let i=0;i<n;i++){let j=i;for(let k=i+1;k<n;k++)if(Math.abs(A[k][i])>Math.abs(A[j][i]))j=k;[A[i],A[j]]=[A[j],A[i]];if(Math.abs(A[i][i])<1e-12)throw Error('Calibration is degenerate. Retake with all four squares visible.');let v=A[i][i];for(let k=i;k<=n;k++)A[i][k]/=v;for(let j=0;j<n;j++)if(i!==j){v=A[j][i];for(let k=i;k<=n;k++)A[j][k]-=v*A[i][k];}}return A.map(r=>r[n]);}
export function homography(src,dst){if(src.length<4||src.length!==dst.length)throw Error('At least four point pairs required.');const rows=[],b=[];src.forEach(([x,y],i)=>{const [u,v]=dst[i];rows.push([x,y,1,0,0,0,-u*x,-u*y],[0,0,0,x,y,1,-v*x,-v*y]);b.push(u,v);});const ata=Array.from({length:8},()=>Array(8).fill(0)),atb=Array(8).fill(0);for(let r=0;r<rows.length;r++)for(let i=0;i<8;i++){atb[i]+=rows[r][i]*b[r];for(let j=0;j<8;j++)ata[i][j]+=rows[r][i]*rows[r][j];}return [...solve(ata,atb),1];}
export function project(h,[x,y]){const d=h[6]*x+h[7]*y+h[8];return [(h[0]*x+h[1]*y+h[2])/d,(h[3]*x+h[4]*y+h[5])/d];}
export function gray(image){const out=new Uint8Array(image.width*image.height);for(let i=0;i<out.length;i++)out[i]=Math.round(image.data[i*4]*.299+image.data[i*4+1]*.587+image.data[i*4+2]*.114);return out;}
function cross(o,a,b){return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);}
function hull(points){points.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);const a=[],b=[];for(const p of points){while(a.length>1&&cross(a.at(-2),a.at(-1),p)<=0)a.pop();a.push(p);}for(const p of points.reverse()){while(b.length>1&&cross(b.at(-2),b.at(-1),p)<=0)b.pop();b.push(p);}a.pop();b.pop();return a.concat(b);}
function quad(points){const h=hull(points);while(h.length>4){let k=0,m=Infinity;for(let i=0;i<h.length;i++){const v=Math.abs(cross(h[(i+h.length-1)%h.length],h[i],h[(i+1)%h.length]));if(v<m){m=v;k=i;}}h.splice(k,1);}return h;}
export function polygonArea(p){return p.reduce((a,v,i)=>{const n=p[(i+1)%p.length];return a+v[0]*n[1]-n[0]*v[1];},0)/2;}
function decode(g,w,h,q,threshold){const H=homography([[0,0],[8,0],[8,8],[0,8]],q),values=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++){let sum=0;for(const dx of [-.15,0,.15])for(const dy of [-.15,0,.15]){const [u,v]=project(H,[x+.5+dx,y+.5+dy]);sum+=g[Math.max(0,Math.min(h-1,Math.round(v)))*w+Math.max(0,Math.min(w-1,Math.round(u)))];}values.push(sum/9);}
// Decode each square against its own illumination, including squares in shadow.
const sorted=[...values].sort((a,b)=>a-b),black=sorted[8],white=sorted[58];if(white-black<30)return null;threshold=(black+white)/2;
const a=Array.from({length:8},(_,y)=>values.slice(y*8,y*8+8).map(v=>v<threshold?1:0));let border=0;for(let i=0;i<8;i++)border+=a[0][i]+a[7][i]+a[i][0]+a[i][7];if(border<30)return null;let rot=a,best=null;for(let r=0;r<4;r++){const bits=rot.slice(1,7).map(row=>row.slice(1,7).join('')).join('');for(let id=0;id<4;id++){let err=0;for(let i=0;i<36;i++)err+=bits[i]!==CODES[id][i];if(err<=2&&(!best||err<best.err))best={id,err,corners:Array.from({length:4},(_,i)=>q[(i+4-r)%4])};}rot=rot[0].map((_,x)=>rot.map(row=>row[x]).reverse());}return best;}
// Fit physical black/white transitions rather than the centres of border pixels.
// Sampling many locations along each edge reduces perspective-dependent corner bias.
function refineQuad(g,w,h,q){
 const sample=(x,y)=>{const ix=Math.floor(x),iy=Math.floor(y);if(ix<0||iy<0||ix+1>=w||iy+1>=h)return 255;const dx=x-ix,dy=y-iy,k=iy*w+ix;return g[k]*(1-dx)*(1-dy)+g[k+1]*dx*(1-dy)+g[k+w]*(1-dx)*dy+g[k+w+1]*dx*dy;};
 const lines=[];
 for(let i=0;i<4;i++){const a=q[i],b=q[(i+1)%4],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy),nx=dy/len,ny=-dx/len,pts=[];
 for(let j=0;j<25;j++){const t=.15+.7*j/24,x=a[0]+dx*t,y=a[1]+dy*t,values=[];let peak=0,at=0;for(let k=0;k<=24;k++){const d=-3+k*.25,v=sample(x+nx*(d+.5),y+ny*(d+.5))-sample(x+nx*(d-.5),y+ny*(d-.5));values.push(v);if(v>peak){peak=v;at=k;}}
 if(peak<25)continue;let sum=0,total=0;for(let k=Math.max(0,at-3);k<=Math.min(24,at+3);k++){const v=Math.max(0,values[k]);sum+=(-3+k*.25)*v;total+=v;}const d=sum/total;pts.push([x+nx*d,y+ny*d]);}
 if(pts.length<8)return q;const cx=pts.reduce((s,p)=>s+p[0],0)/pts.length,cy=pts.reduce((s,p)=>s+p[1],0)/pts.length;let xx=0,yy=0,xy=0;for(const p of pts){xx+=(p[0]-cx)**2;yy+=(p[1]-cy)**2;xy+=(p[0]-cx)*(p[1]-cy);}const angle=.5*Math.atan2(2*xy,xx-yy),n=[-Math.sin(angle),Math.cos(angle)];lines.push([n[0],n[1],n[0]*cx+n[1]*cy]);}
 const out=[];for(let i=0;i<4;i++){const a=lines[(i+3)%4],b=lines[i],d=a[0]*b[1]-a[1]*b[0];if(Math.abs(d)<.05)return q;out.push([(a[2]*b[1]-a[1]*b[2])/d,(a[0]*b[2]-a[2]*b[0])/d]);}return out;
}
export function detectMarkers(image){const {width:w,height:h}=image,g=gray(image),found=new Map();
// Multiple thresholds tolerate exposure changes without treating dark tool bodies as markers.
let local=null;for(const threshold of [100,150,195,0]){if(!threshold){const stride=w+1,integral=new Float64Array((w+1)*(h+1));for(let y=0;y<h;y++){let sum=0;for(let x=0;x<w;x++){sum+=g[y*w+x];integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+sum;}}local=new Float32Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const l=Math.max(0,x-25),r=Math.min(w,x+26),t=Math.max(0,y-25),b=Math.min(h,y+26);local[y*w+x]=(integral[b*stride+r]-integral[t*stride+r]-integral[b*stride+l]+integral[t*stride+l])/((r-l)*(b-t))-10;}}const dark=i=>g[i]<(threshold||local[i]);const seen=new Uint8Array(w*h),queue=new Int32Array(w*h);for(let i=0;i<g.length;i++){if(seen[i]||!dark(i))continue;let head=0,tail=1;queue[0]=i;seen[i]=1;const points=[];let minX=w,minY=h,maxX=0,maxY=0;while(head<tail){const p=queue[head++],x=p%w,y=(p/w)|0;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);let edge=false;for(const d of [-1,1,-w,w]){const n=p+d;if(n<0||n>=g.length||(d===-1&&x===0)||(d===1&&x===w-1)){edge=true;continue;}if(!dark(n)){edge=true;continue;}if(!seen[n]){seen[n]=1;queue[tail++]=n;}}if(edge)points.push([x,y]);}
const bw=maxX-minX,bh=maxY-minY;if(tail<60||bw<12||bh<12||bw> w*.38||bh>h*.38||bw/bh>4||bh/bw>4)continue;const q=quad(points);if(q.length!==4||Math.abs(polygonArea(q))<100)continue;try{const d=decode(g,w,h,refineQuad(g,w,h,q),threshold);if(d&&(!found.has(d.id)||d.err<found.get(d.id).err))found.set(d.id,d);}catch{}}
if(found.size===4)break;}return [...found.values()].sort((a,b)=>a.id-b.id);}
function fitCalibration(markers,paper){if(markers.length!==4)throw Error(`Found ${markers.length} of 4 calibration squares. Keep every square visible, remove glare, and use the matching printed sheet.`);const world=markers.flatMap(m=>markerCorners(m.id,paper)),pixels=markers.flatMap(m=>m.corners);const H=homography(world,pixels),inverse=homography(pixels,world);let sum=0,max=0;for(let i=0;i<world.length;i++){const p=project(inverse,pixels[i]),e=Math.hypot(p[0]-world[i][0],p[1]-world[i][1]);sum+=e*e;max=Math.max(max,e);}const rms=Math.sqrt(sum/world.length);return {markers,H,inverse,rms,max,paper};}
export function calibrate(image,paper='a4'){const cal=fitCalibration(detectMarkers(image),paper);if(cal.rms>1)throw Error(`Calibration residual is ${cal.rms.toFixed(2)} mm. Flatten the paper, reduce camera tilt, and retake.`);return cal;}
export function calibrationFromMarkers(markers,preferred='a4'){const fits=Object.keys(PAPERS).map(p=>fitCalibration(markers,p)).sort((a,b)=>a.rms-b.rms),best=fits[0],requested=fits.find(c=>c.paper===preferred)||best;const cal=best.rms<requested.rms*.8&&requested.rms-best.rms>.12?best:requested;if(cal.rms>1)throw Error(`Calibration residual is ${cal.rms.toFixed(2)} mm. Flatten the sheet and retake.`);return {...cal,detectedPaper:cal.paper!==preferred,alternatives:fits.map(c=>({paper:c.paper,rms:c.rms}))};}
export function autoCalibrate(image,preferred='a4'){return calibrationFromMarkers(detectMarkers(image),preferred);}
export function warp(image,H,width,height,scale=3){const w=Math.round(width*scale),h=Math.round(height*scale),data=new Uint8ClampedArray(w*h*4),src=image.data;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const [u,v]=project(H,[x/scale,y/scale]),ix=Math.floor(u),iy=Math.floor(v),j=(y*w+x)*4;if(ix<0||iy<0||ix+1>=image.width||iy+1>=image.height){data.fill(255,j,j+4);continue;}const dx=u-ix,dy=v-iy,k=(iy*image.width+ix)*4;for(let c=0;c<3;c++)data[j+c]=src[k+c]*(1-dx)*(1-dy)+src[k+4+c]*dx*(1-dy)+src[k+image.width*4+c]*(1-dx)*dy+src[k+image.width*4+4+c]*dx*dy;data[j+3]=255;}return {width:w,height:h,data};}
function distancePoint(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);}
function rdp(p,e){if(p.length<3)return p;let d=0,k=0;for(let i=1;i<p.length-1;i++){const v=distancePoint(p[i],p[0],p.at(-1));if(v>d){d=v;k=i;}}if(d<=e)return [p[0],p.at(-1)];return [...rdp(p.slice(0,k+1),e).slice(0,-1),...rdp(p.slice(k),e)];}
export function simplify(p,e=.2){let k=0;for(let i=1;i<p.length;i++)if(p[i][0]>p[k][0])k=i;const a=p.slice(k).concat(p.slice(0,k));const n=Math.floor(a.length/2);return rdp(a.slice(0,n+1),e).slice(0,-1).concat(rdp(a.slice(n).concat([a[0]]),e).slice(0,-1));}
export function smooth(p,passes=1){for(let k=0;k<passes;k++){const a=[];for(let i=0;i<p.length;i++){const v=p[i],n=p[(i+1)%p.length];a.push([.75*v[0]+.25*n[0],.75*v[1]+.25*n[1]],[.25*v[0]+.75*n[0],.25*v[1]+.75*n[1]]);}p=a;}return p;}
export function smoothOutline(poly,passes=1,mode='round',options={}){
 if(mode==='fair')return fairOutline(poly,{strength:passes,radius:options.radius??.75,maxDeviation:options.maxDeviation??.35});
 passes=Math.max(0,Math.min(5,Math.round(passes)));if(!passes)return poly;
 if(mode==='round')return roundCorners(poly,(options.radius??.75)*(.4+.6*passes));
 if(mode==='relax'){const points=[];let remainder=0;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],length=Math.hypot(b[0]-a[0],b[1]-a[1]);for(let d=remainder;d<length;d+=.4)points.push([a[0]+(b[0]-a[0])*d/(length||1),a[1]+(b[1]-a[1])*d/(length||1)]);remainder=(remainder-length)%.4;if(remainder<0)remainder+=.4;}if(points.length<3)return poly;const radius=passes;return points.map((_,i)=>{let x=0,y=0,total=0;for(let j=-radius;j<=radius;j++){const p=points[(i+j+points.length)%points.length],w=radius+1-Math.abs(j);x+=p[0]*w;y+=p[1]*w;total+=w;}return [x/total,y/total];});}
 let p=poly;for(let k=0;k<passes;k++){if(p.length>2048)p=simplify(p,.035);const out=[];for(let i=0;i<p.length;i++){const a=p[(i+p.length-1)%p.length],b=p[i],c=p[(i+1)%p.length],u=[b[0]-a[0],b[1]-a[1]],v=[c[0]-b[0],c[1]-b[1]],cos=(u[0]*v[0]+u[1]*v[1])/(Math.hypot(...u)*Math.hypot(...v)||1);if(cos<.57){out.push(b);continue;}out.push([b[0]*.75+a[0]*.25,b[1]*.75+a[1]*.25],[b[0]*.75+c[0]*.25,b[1]*.75+c[1]*.25]);}p=out;}return p;
}
export function contours(mask,w,h,scale=1,minArea=12){const edges=new Map(),key=(x,y)=>y*(w+1)+x;function edge(x,y,u,v){const k=key(x,y);if(!edges.has(k))edges.set(k,[]);edges.get(k).push(key(u,v));}for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const p=y*w+x;if(!mask[p])continue;if(!mask[p-w])edge(x,y,x+1,y);if(!mask[p+1])edge(x+1,y,x+1,y+1);if(!mask[p+w])edge(x+1,y+1,x,y+1);if(!mask[p-1])edge(x,y+1,x,y);}const paths=[];while(edges.size){const start=edges.keys().next().value;let k=start;const p=[];let guard=0;do{p.push([(k%(w+1))/scale,Math.floor(k/(w+1))/scale]);const next=edges.get(k);if(!next)break;const n=next.pop();if(!next.length)edges.delete(k);k=n;}while(k!==start&&guard++<w*h*4);if(k===start&&p.length>3&&polygonArea(p)>minArea)paths.push(simplify(p,.15));}return paths.sort((a,b)=>polygonArea(b)-polygonArea(a));}
// Edge-aware outline refinement. Mask boundaries sit on pixel cracks, slightly
// outside the object after gap closing, and follow a cast shadow or a specular
// highlight whenever one breaks the tool edge. Each sample looks along its normal
// for edges of the contour's own polarity in log brightness (a shadow scales
// illumination, so its edge is weaker than the tool's). Deep inward moves need a
// shadow-like band: darker than the background, lighter than the tool. A
// highlight looks like background and is never cut away. Dynamic programming
// around the closed ring picks one continuous edge instead of hopping between the
// tool and shadow edges, then sub-pixel offsets are lightly median filtered.
function blurGray(image){const {width:w,height:h,data}=image,n=w*h,g=new Float32Array(n),t=new Float32Array(n),o=new Float32Array(n),k=[.0625,.25,.375,.25,.0625];for(let i=0;i<n;i++)g[i]=data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let j=-2;j<=2;j++)v+=g[y*w+Math.max(0,Math.min(w-1,x+j))]*k[j+2];t[y*w+x]=v;}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let j=-2;j<=2;j++)v+=t[Math.max(0,Math.min(h-1,y+j))*w+x]*k[j+2];o[y*w+x]=v;}return {g:o,w,h};}
function sample({g,w,h},x,y){x=Math.max(0,Math.min(w-1.001,x-.5));y=Math.max(0,Math.min(h-1.001,y-.5));const i=Math.floor(x),j=Math.floor(y),fx=x-i,fy=y-j,p=j*w+i;return (g[p]*(1-fx)+g[p+1]*fx)*(1-fy)+(g[p+w]*(1-fx)+g[p+w+1]*fx)*fy;}
export function snapToEdges(poly,field,scale,{inward=3.5,outward=2,step=.4,minEdge=.06,shadowRatio=.88,jump=1.2}={}){
 if(poly.length<8)return poly;const seg=poly.map((a,i)=>Math.hypot(poly[(i+1)%poly.length][0]-a[0],poly[(i+1)%poly.length][1]-a[1])),length=seg.reduce((a,b)=>a+b,0),count=Math.max(16,Math.ceil(length/step)),pts=[];let edge=0,base=0;
 for(let i=0;i<count;i++){const d=i*length/count;while(edge<poly.length-1&&base+seg[edge]<d)base+=seg[edge++];const t=(d-base)/(seg[edge]||1),a=poly[edge],b=poly[(edge+1)%poly.length];pts.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
 // Measure from a gently smoothed base so pixel-staircase corners do not tilt normals.
 {const raw=pts.map(p=>[...p]),r=8;for(let i=0;i<raw.length;i++){let x=0,y=0,t=0;for(let j=-r;j<=r;j++){const q=raw[(i+j+raw.length)%raw.length],g=Math.exp(-j*j/18);x+=q[0]*g;y+=q[1]*g;t+=g;}pts[i]=[x/t,y/t];}}
 // With y pointing down, a positive-area ring has its interior on the left normal [-dy,dx].
 const n=pts.length,out=polygonArea(pts)>0?-1:1,dt=.25,lo=Math.round(-(inward+.6)*scale/dt),hi=Math.round((outward+.6)*scale/dt),mm=k=>k*dt/scale,at=t=>Math.round(t*scale/dt)-lo,normals=pts.map((_,i)=>{const a=pts[(i+n-2)%n],b=pts[(i+2)%n],dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy)||1;return [-dy/l*out,dx/l*out];});
 const profiles=pts.map((p,i)=>{const x=p[0]*scale,y=p[1]*scale,[nx,ny]=normals[i],v=new Float32Array(hi-lo+1);for(let k=lo;k<=hi;k++)v[k-lo]=sample(field,x+nx*k*dt,y+ny*k*dt);return v;});
 let polarity=0;for(const v of profiles){for(let k=at(.6);k<=at(1.2);k++)polarity+=v[k];for(let k=at(-1.2);k<=at(-.6);k++)polarity-=v[k];}polarity=Math.sign(polarity)||1;
 // Two same-polarity edges along one normal enclose a band. A band clearly darker
 // than the background is a cast shadow (keep the inner edge); one almost as bright
 // as the background but brighter than the tool is a highlight (keep the outer edge).
 const size=hi-lo+1,L=new Float32Array(size),v=new Float32Array(size),sum=new Float64Array(size+1),mean=(_,a,b)=>{const i=Math.max(0,at(a)),j=Math.min(size-1,at(b));return j>=i?(sum[j+1]-sum[i])/(j-i+1):NaN;};
 // Typical paper level beyond the samples and tool level inside them. A sample whose
 // far end is much darker is looking across a notch at another part of the tool.
 const far=profiles.map(raw=>{let t=0,c=0;for(let k=at(outward+.1);k<=Math.min(raw.length-1,at(outward+.6));k++){t+=polarity*Math.log(10+raw[k]);c++;}return t/c;}).sort((a,b)=>a-b),usual=far[Math.floor(far.length*.75)],dark=profiles.map(raw=>{let m=Infinity;for(let k=0;k<=at(-1);k++)m=Math.min(m,polarity*Math.log(10+raw[k]));return m;}).sort((a,b)=>a-b)[Math.floor(far.length/2)];
 const candidates=profiles.map(raw=>{for(let k=0;k<size;k++){v[k]=raw[k]*polarity;L[k]=polarity*Math.log(10+raw[k]);sum[k+1]=sum[k]+L[k];}const D=k=>(v[Math.min(v.length-1,k+4)]-v[Math.max(0,k-4)])/(8*dt),half=Math.max(1,Math.round(.5*scale/dt)),peaks=[];let bg=-Infinity;for(let t=0;t<=outward+.35;t+=.1)bg=Math.max(bg,mean(L,t,t+.25));
  for(let k=2;k<v.length-2;k++){const t=mm(k+lo);if(t<-inward||t>outward)continue;const d=D(k),dl=D(k-1),dr=D(k+1);if(d<=0||d<dl||d<=dr||d<.5)continue;const contrast=L[Math.min(L.length-1,k+half)]-L[Math.max(0,k-half)];if(contrast<minEdge)continue;
   const den=dl-2*d+dr,shift=den<0?Math.max(-.5,Math.min(.5,.5*(dl-dr)/den)):0;peaks.push({t:mm(k+lo+shift),s:contrast});}
  const kind=(a,b)=>{if(b.t-a.t<.8)return '';const band=mean(L,a.t+.45,b.t-.25),inner=mean(L,a.t-.5,a.t-.15);if(!(band>inner+.25))return '';return band<bg+Math.log(shadowRatio)?'shadow':band>bg-.12&&mean(L,b.t+.15,b.t+.5)>bg-.06?'highlight':'';};
  const keep=peaks.filter((p,i)=>!(i>0&&kind(peaks[i-1],p)==='shadow')&&!(i<peaks.length-1&&kind(p,peaks[i+1])==='highlight')&&(p.t>=-.45||p.s>.25&&(()=>{const band=mean(L,p.t+.45,-.25),inner=mean(L,p.t-.5,p.t-.15);return band<bg+Math.log(shadowRatio)&&band>inner+.25;})()));
  // Scan inward from the paper. Anything clearly brighter than the paper is still
  // tool (chrome). A soft, mid-grey gap followed inward by paper-bright pixels is a
  // shadow beside a bright rim (or paper seen through a slot): the outline belongs
  // outside that bright part. Both rules only ever keep more of the tool.
  const paper=mean(L,outward+.1,outward+.6);if(polarity>0&&paper>usual-.45&&paper<usual+.1){const W=t=>mean(L,t-.15,t+.15),step=dt/scale;let t=outward,gap=null,low=Infinity,edge=null;
   const bright=Math.max(paper,usual);for(;t>=-inward;t-=step){const v=W(t);if(gap===null){if(v>bright+.045){edge=t;break;}if(v<paper-.1)gap=t;}else{low=Math.min(low,v);if(v>=paper-.04){let tool=dark;for(let q=-inward;q<t;q+=step)tool=Math.min(tool,W(q));if(low>paper+Math.log(.55)&&low>tool+.25)edge=t;break;}}}
   if(edge!==null){let peak=edge,level=W(edge);for(let q=edge;q>=Math.max(-inward,edge-1);q-=step)if(W(q)>level){level=W(q);peak=q;}const goal=(level+(gap===null?paper:low))/2;let k=at(peak);while(k<at(outward+.5)&&L[k]>goal)k++;const te=mm(k+lo);if(te<outward+.5){const until=gap===null?te+.1:gap+.3;for(let i=keep.length-1;i>=0;i--)if(keep[i].t<until)keep.splice(i,1);keep.unshift({t:te,s:.6});}}}
  return keep.length?keep:[{t:0,s:0}];});
 const strengths=candidates.flatMap(c=>c[0].s?[Math.max(...c.map(e=>e.s))]:[]).sort((a,b)=>a-b);if(strengths.length<n*.5)return poly;const ref=strengths[Math.floor(strengths.length/2)];
 const unit=c=>-Math.min(1.5,c.s/ref)+(c.t>0?.15*(c.t/outward)**2:0);
 // Unroll twice around the ring and keep the second lap, so the seam is not special.
 const N=2*n,cost=[],back=[];cost[0]=candidates[0].map(unit);back[0]=candidates[0].map(()=>0);
 for(let i=1;i<N;i++){const prev=candidates[(i-1)%n],cur=candidates[i%n],pc=cost[i-1];cost[i]=[];back[i]=[];for(const c of cur){let best=Infinity,from=0;prev.forEach((p,j)=>{const d=Math.abs(c.t-p.t),v=pc[j]+jump*d+2*d*d;if(v<best){best=v;from=j;}});cost[i].push(best+unit(c));back[i].push(from);}}
 let j=cost[N-1].indexOf(Math.min(...cost[N-1]));const chosen=new Array(n);for(let i=N-1;i>=n;i--){chosen[i-n]=candidates[i%n][j].t;j=back[i][j];}
 // Shadows, rims and gap-closing bias change slowly along a tool, so the correction
 // is filtered over a few millimetres; shape detail stays in the base outline. Points
 // that disagree with the local median are outliers, not features.
 const span=Math.max(2,Math.round(1.8/step)),median=chosen.map((_,i)=>{const w=[];for(let k=-span;k<=span;k++)w.push(chosen[(i+k+n)%n]);return w.sort((a,b)=>a-b)[span];}),kept=chosen.map((v,i)=>Math.abs(v-median[i])>.3?median[i]:v),sigma=1/step,reach=Math.ceil(2.5*sigma);
 const smooth=chosen.map((_,i)=>{let t=0,c=0;for(let k=-reach;k<=reach;k++){const g=Math.exp(-k*k/(2*sigma*sigma));t+=kept[(i+k+n)%n]*g;c+=g;}return t/c;});
 // A pocket must enclose the tool. An edge position is the middle of a blurred
 // transition, so walk each point out until the photo just beyond it is paper:
 // not tool-dark (a light shadow passes) and not brighter than paper (chrome).
 // Then keep the push smooth
 // without letting it shrink.
 const lin=(i,a,b)=>{const v=profiles[i];let t=0,c=0;for(let k=Math.max(0,at(a));k<=Math.min(size-1,at(b));k++){t+=polarity*v[k];c++;}return c?t/c:NaN;},low=(i,a,b)=>{const v=profiles[i];let m=Infinity;for(let k=Math.max(0,at(a));k<=Math.min(size-1,at(b));k++)m=Math.min(m,polarity*v[k]);return m;},high=(i,a,b)=>{const v=profiles[i];let m=-Infinity;for(let k=Math.max(0,at(a));k<=Math.min(size-1,at(b));k++)m=Math.max(m,polarity*v[k]);return m;},toolLin=polarity*(Math.exp(polarity*dark)-10),paperLin=polarity*(Math.exp(polarity*usual)-10);
 const push=smooth.map((d0,i)=>{const paper=lin(i,outward+.1,outward+.6),tool=low(i,d0-1.5,d0-.2),limit=tool+.5*(paper-tool);if(!(paper-tool>(paperLin-toolLin)*.25))return 0;let d=d0;while(d<Math.min(outward+.4,d0+1.6)&&(low(i,d,d+.5)<limit||polarity>0&&high(i,d+.1,d+.5)>paper*1.06+3))d+=dt/scale;return d-d0;});
 const held=push.map((_,i)=>{let m=0;for(let k=-3;k<=3;k++)m=Math.max(m,push[(i+k+n)%n]);return m;}),result=pts.map((p,i)=>{let t=0,c=0;for(let k=-2;k<=2;k++){const g=Math.exp(-k*k/2);t+=held[(i+k+n)%n]*g;c+=g;}const d=smooth[i]+t/c;return [p[0]+normals[i][0]*d,p[1]+normals[i][1]*d];});
 return untangle(result,pts)??poly;
}
// Converging normals at concave corners can fold small loops into the ring. Keep
// the positively wound region, and reject any repair that changes the area grossly.
function untangle(ring,reference){
 ring=simplify(ring,.03);if(!hasCrossings(ring))return Math.sign(polygonArea(ring))===Math.sign(polygonArea(reference))?ring:null;
 const S=1e5,path=ring.map(([x,y])=>({X:Math.round(x*S),Y:Math.round(y*S)}));if(!Clipper.Clipper.Orientation(path))path.reverse();
 const parts=Clipper.Clipper.SimplifyPolygon(path,Clipper.PolyFillType.pftPositive).map(p=>p.map(q=>[q.X/S,q.Y/S])).sort((a,b)=>Math.abs(polygonArea(b))-Math.abs(polygonArea(a)));
 if(!parts.length)return null;let best=parts[0];const ratio=Math.abs(polygonArea(best))/Math.abs(polygonArea(reference));if(ratio<.7||ratio>1.3)return null;
 if(Math.sign(polygonArea(best))!==Math.sign(polygonArea(reference)))best=best.reverse();best=simplify(best,.03);return hasCrossings(best)?null:best;
}
export function refinePaths(paths,image,scale,options){if(options.snapEdges===false||!paths.length)return paths;const field=blurGray(image);return paths.map(p=>snapToEdges(p,field,scale)).sort((a,b)=>polygonArea(b)-polygonArea(a));}
// Rectify the sheet plus as much of the surrounding surface as the photo shows
// (up to EXTEND_MM on each side, at no less than 2 px/mm), so tools longer than the sheet can be traced
// while all four markers are visible. Alpha 0 marks pixels outside the photo.
// The result records its millimetre origin relative to the sheet's top-left.
const EXTEND_MM=400,EXTEND_PIXELS=4.5e6;
export function warpExtended(image,H,paper='a4',scale=3){
 const [pw,ph]=PAPERS[paper],sheet=[[0,0],[pw,0],[pw,ph],[0,ph]],inv=homography(sheet.map(p=>project(H,p)),sheet);
 const edge=[];for(let i=0;i<=16;i++){const t=i/16;edge.push([t*image.width,0],[t*image.width,image.height],[0,t*image.height],[image.width,t*image.height]);}
 const seen=edge.map(p=>project(inv,p)).filter(p=>p.every(Number.isFinite)),lo=v=>Math.max(-EXTEND_MM,Math.min(0,v)),clampX=v=>Math.min(pw+EXTEND_MM,Math.max(pw,v)),clampY=v=>Math.min(ph+EXTEND_MM,Math.max(ph,v));
 let x0=lo(Math.min(...seen.map(p=>p[0]))),y0=lo(Math.min(...seen.map(p=>p[1]))),x1=clampX(Math.max(...seen.map(p=>p[0]))),y1=clampY(Math.max(...seen.map(p=>p[1])));
 x0=Math.floor(x0);y0=Math.floor(y0);x1=Math.ceil(x1);y1=Math.ceil(y1);
 const s=Math.min(scale,Math.max(2,Math.sqrt(EXTEND_PIXELS/((x1-x0)*(y1-y0))))),w=Math.round((x1-x0)*s),h=Math.round((y1-y0)*s),data=new Uint8ClampedArray(w*h*4),src=image.data;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const [u,v]=project(H,[x0+x/s,y0+y/s]),ix=Math.floor(u),iy=Math.floor(v),j=(y*w+x)*4;if(!(ix>=0&&iy>=0&&ix+1<image.width&&iy+1<image.height)){data[j]=data[j+1]=data[j+2]=255;data[j+3]=0;continue;}const dx=u-ix,dy=v-iy,k=(iy*image.width+ix)*4;for(let c=0;c<3;c++)data[j+c]=src[k+c]*(1-dx)*(1-dy)+src[k+4+c]*dx*(1-dy)+src[k+image.width*4+c]*(1-dx)*dy+src[k+image.width*4+4+c]*dx*dy;data[j+3]=255;}
 return {width:w,height:h,data,origin:[x0,y0],scale:s,paper};
}
function extractExtended(image,paper,threshold,minArea,method,options){
 const [pw,ph]=PAPERS[paper],s=image.scale,[ox,oy]=image.origin,{width:w,height:h,data}=image,px=v=>v*s,X=v=>(v-ox)*s,Y=v=>(v-oy)*s;
 const valid=new Uint8Array(w*h);for(let i=0;i<valid.length;i++)valid[i]=data[i*4+3]?1:0;
 let mask;
 {
  const band=px(3),dots=px(1.2),paperEdges=[{axis:'x',at:X(0),band},{axis:'x',at:X(pw),band},{axis:'y',at:Y(0),band},{axis:'y',at:Y(ph),band}].map(l=>({...l,probe:Math.max(2,Math.round(px(1.5))),from:(l.axis==='x'?Y(0):X(0))-band,to:(l.axis==='x'?Y(ph):X(pw))+band})),lines=[];
  for(const [axis,at] of [['x',33],['x',pw-33],['y',33],['y',ph-33]])lines.push({axis,at:axis==='x'?X(at):Y(at),band:dots,from:axis==='x'?Y(33):X(33),to:axis==='x'?Y(ph-33):X(pw-33)});
  const blank=[0,1,2,3].map(id=>{const b=bounds(markerCorners(id,paper));return {left:Math.floor(X(b.minX-3)),right:Math.ceil(X(b.maxX+3)),top:Math.floor(Y(b.minY-3)),bottom:Math.ceil(Y(b.maxY+3))};});
  // Paint the printed dotted boundary out of a copy by blending across each band from both sides.
  // A faint line on white vanishes; a tool crossing it stays dark on both sides, and a
  // tool edge lying along it remains a strong dark-to-light ramp, so outlines never break.
  const clean=new Uint8ClampedArray(data);
  for(const l of lines){const vertical=l.axis==='x',a0=Math.max(0,Math.floor(l.at-l.band)-1),a1=Math.min((vertical?w:h)-1,Math.ceil(l.at+l.band)+1);if(a1-a0<2)continue;
   for(let b=Math.max(0,Math.floor(l.from));b<=Math.min((vertical?h:w)-1,Math.ceil(l.to));b++){const at=a=>4*(vertical?b*w+a:a*w+b),p0=at(a0),p1=at(a1);for(let a=a0+1;a<a1;a++){const t=(a-a0)/(a1-a0),q=at(a);for(let c=0;c<3;c++)clean[q+c]=data[p0+c]*(1-t)+data[p1+c]*t;}}}
  // The sheet margin carries printed text and the scale bar. A grey-level closing
  // there (max then min filter) removes dark strokes thinner than ~1.6 mm while
  // wide dark tool bodies keep their edges.
  {const r=Math.max(1,Math.round(.8*s)),g=new Float32Array(w*h),t=new Float32Array(w*h),u=new Float32Array(w*h);for(let i=0;i<w*h;i++)g[i]=clean[i*4]*.299+clean[i*4+1]*.587+clean[i*4+2]*.114;
   const pass=(src,dst,horizontal,max)=>{for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=max?-1:1e9;for(let k=-r;k<=r;k++){const xx=horizontal?Math.min(w-1,Math.max(0,x+k)):x,yy=horizontal?y:Math.min(h-1,Math.max(0,y+k)),q=src[yy*w+xx];v=max?Math.max(v,q):Math.min(v,q);}dst[y*w+x]=v;}};
   pass(g,t,true,true);pass(t,u,false,true);pass(u,t,true,false);pass(t,u,false,false);
   for(let y=0;y<h;y++)for(let x=0;x<w;x++){const mx=x/s+ox,my=y/s+oy;if(mx<0||my<0||mx>pw||my>ph||(mx>34.5&&mx<pw-34.5&&my>34.5&&my<ph-34.5))continue;const i=y*w+x,v=u[i];if(v>g[i]+.5)clean[i*4]=clean[i*4+1]=clean[i*4+2]=v;}}
  if(method==='edges')mask=edgeSilhouette({width:w,height:h,data:clean},{left:0,right:w,top:0,bottom:h},threshold,{...options,pixelsPerMm:s,valid,blank,suppress:paperEdges,floodFromBorder:true});
  else{
   // Brightness tracing covers the whole photographed area on a light surface. Markers are
   // ignored; anything dark that runs to the photo border (e.g. a dark table) is rejected below.
   // Photos vary in exposure and the surface around the sheet may be mid-grey (floor, bench),
   // so each cutoff is capped relative to the typical brightness of its own area: 75% of the
   // paper's median on the sheet, 60% of the surface's median off it.
   const g=gray({width:w,height:h,data:clean}),onSheet=i=>{const x=i%w,y=(i-x)/w,mx=x/s+ox,my=y/s+oy;return mx>=0&&my>=0&&mx<=pw&&my<=ph;};
   const median=sheet=>{const hist=new Uint32Array(256);let count=0;for(let i=0;i<g.length;i+=3)if(valid[i]&&onSheet(i)===sheet){hist[Math.min(255,g[i]|0)]++;count++;}if(!count)return 255;for(let v=0,seen=0;v<256;v++){seen+=hist[v];if(seen*2>=count)return v;}return 255;};
   const onCut=Math.min(threshold,median(true)*.75),offCut=Math.min(threshold,median(false)*.6);mask=new Uint8Array(g.length);for(let i=0;i<g.length;i++)mask[i]=valid[i]&&g[i]<(onSheet(i)?onCut:offCut)?1:0;
   for(const r of blank)for(let y=Math.max(0,r.top);y<Math.min(h,r.bottom);y++)for(let x=Math.max(0,r.left);x<Math.min(w,r.right);x++)mask[y*w+x]=0;
  }
 }
 const near=(x,y)=>{const cx=Math.round(x*s),cy=Math.round(y*s);for(let dy=-4;dy<=4;dy+=2)for(let dx=-4;dx<=4;dx+=2){const a=cx+dx,b=cy+dy;if(a<0||b<0||a>=w||b>=h||!valid[b*w+a])return true;}return false;};
 const inner=([x,y])=>x+ox>33.5&&x+ox<pw-33.5&&y+oy>33.5&&y+oy<ph-33.5;
 // Straight tools may have no vertex on the sheet, so sample along each edge.
 const crossesSheet=p=>p.some((a,i)=>{const b=p[(i+1)%p.length],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])));for(let k=0;k<=n;k++)if(inner([a[0]+(b[0]-a[0])*k/n,a[1]+(b[1]-a[1])*k/n]))return true;return false;});
 const paths=contours(mask,w,h,s,minArea).filter(p=>{const b=bounds(p),area=polygonArea(p);
  // A tool must start on the sheet, be fully in the photo, not be the sheet itself, and be
  // wider on average than printed lines (2·area/perimeter). Bounding-box fill would reject
  // long diagonal tools.
  const perimeter=p.reduce((t,a,i)=>{const c=p[(i+1)%p.length];return t+Math.hypot(c[0]-a[0],c[1]-a[1]);},0);
  return 2*area/perimeter>1.5&&crossesSheet(p)&&!p.some(([x,y])=>near(x,y))&&!(b.maxX-b.minX>pw*.95&&b.maxY-b.minY>ph*.95);});
 return refinePaths(paths,image,s,options).map(p=>p.map(([x,y])=>[x+ox,y+oy]));
}
export function extract(image,paper='a4',threshold=160,minArea=20,method='edges',options={}){if(image.origin)return extractExtended(image,paper,threshold,minArea,method,options);return refinePaths(extractMask(image,paper,threshold,minArea,method,options),image,image.width/PAPERS[paper][0],options);}
function extractMask(image,paper,threshold,minArea,method,options){if(method==='edges'){const [pw,ph]=PAPERS[paper],s=image.width/pw,roi={left:Math.ceil(33*s),right:Math.floor((pw-33)*s),top:Math.ceil(33*s),bottom:Math.floor((ph-33)*s)},mask=edgeSilhouette(image,roi,threshold,{...options,pixelsPerMm:s});return contours(mask,image.width,image.height,s,minArea).filter(p=>{const b=bounds(p),area=polygonArea(p);return area/((b.maxX-b.minX)*(b.maxY-b.minY))>.12&&b.minX>33.5&&b.maxX<pw-33.5&&b.minY>33.5&&b.maxY<ph-33.5;});}const [pw,ph]=PAPERS[paper],s=image.width/pw,g=gray(image),mask=new Uint8Array(g.length);for(let y=0;y<image.height;y++)for(let x=0;x<image.width;x++){if(x/s<33||x/s>pw-33||y/s<33||y/s>ph-33)continue;mask[y*image.width+x]=g[y*image.width+x]<threshold?1:0;}return contours(mask,image.width,image.height,s,minArea);}
function inside(p,poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
export function bounds(p){return {minX:Math.min(...p.map(v=>v[0])),maxX:Math.max(...p.map(v=>v[0])),minY:Math.min(...p.map(v=>v[1])),maxY:Math.max(...p.map(v=>v[1]))};}
// Worker messages clone arrays, so content keys let live grip edits reuse
// unchanged body refinement. Bound the cache; names and selections are irrelevant.
const refinementCache=new Map();
export function makeCutPaths(polys,fingers,paper,clearance=0,passes=1,options={}){
 const settings=JSON.stringify([passes,options.mode??'round',options.simplification??.18,options.radius??.75,options.maxDeviation??.35]);
 const refined=polys.map(p=>{
  const key=settings+JSON.stringify(p);let ring=refinementCache.get(key);
  if(!ring){ring=cleanRing(smoothOutline(simplify(p,options.simplification??.18),passes,options.mode??'round',options));refinementCache.set(key,ring);if(refinementCache.size>128)refinementCache.delete(refinementCache.keys().next().value);}
  return ring;
 });
 return vectorCutPaths(refined,fingers,PAPERS[paper],clearance);
}
export function pathD(p){return p.map((v,i)=>(i?'L':'M')+v.map(n=>n.toFixed(3)).join(' ')).join(' ')+' Z';}
export function exportSVG(paths,paper){const [w,h]=PAPERS[paper];return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><g fill="none" stroke="#000" stroke-width="0.1">${paths.map(p=>`<path d="${pathD(p)}"/>`).join('')}</g></svg>`;}
export function exportDXF(paths,paper){let a=['0','SECTION','2','HEADER','9','$INSUNITS','70','4','0','ENDSEC','0','SECTION','2','ENTITIES'];for(const p of paths){a.push('0','LWPOLYLINE','100','AcDbEntity','8','CUT','100','AcDbPolyline','90',String(p.length),'70','1');for(const [x,y] of p)a.push('10',x.toFixed(4),'20',(PAPERS[paper][1]-y).toFixed(4));}a.push('0','ENDSEC','0','EOF');return a.join('\n')+'\n';}
