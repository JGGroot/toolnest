import {detectMarkers,homography,project,contours,simplify,polygonArea} from './vision.js?v=20261025-tch1';
import {fairOutline,cleanRing} from './outline.js?v=20261025-tch1';
// Scale for foam photos and flatbed scans, and pocket detection on an aligned foam photo.

// ---- Scale target: a small printed card with the four coded squares (15 mm, 1.875 mm cells) in its
// corners. Square ids follow the tool sheet: 0 top left, 1 top right, 2 bottom left, 3 bottom right.
export const TARGET={width:80,height:50,size:15,inset:4};
export function targetCorners(id){const {width:w,height:h,size:s,inset:m}=TARGET,x=id%2?w-m-s:m,y=id>1?h-m-s:m;return [[x,y],[x+s,y],[x+s,y+s],[x,y+s]];}
// Fit the card's plane from its 16 square corners. `inverse` maps image pixels to card millimetres.
export function fitTarget(markers){if(markers.length!==4)return null;const world=markers.flatMap(m=>targetCorners(m.id)),pixels=markers.flatMap(m=>m.corners),H=homography(world,pixels),inverse=homography(pixels,world);let sum=0;for(let i=0;i<world.length;i++){const p=project(inverse,pixels[i]);sum+=(p[0]-world[i][0])**2+(p[1]-world[i][1])**2;}const rms=Math.sqrt(sum/world.length);return rms<=.6?{H,inverse,rms}:null;}
export const findTarget=image=>fitTarget(detectMarkers(image));
// Width and length of the foam outlined by four corners (TL, TR, BR, BL), measured on the target's plane:
// the mean of opposite edges.
export function measureCorners(corners,toMm){const p=corners.map(toMm),d=(a,b)=>Math.hypot(b[0]-a[0],b[1]-a[1]);return {width:(d(p[0],p[1])+d(p[3],p[2]))/2,height:(d(p[0],p[3])+d(p[1],p[2]))/2};}
// A flatbed scan has no perspective: millimetres are pixels divided by pixels-per-millimetre.
export const scanToMm=pxPerMm=>p=>[p[0]/pxPerMm,p[1]/pxPerMm];

// ---- Scan resolution stored in the file: JPEG (JFIF density or EXIF XResolution) and PNG (pHYs).
// Returns dots per inch, or null when the file does not say.
export function readScanDPI(buffer){const b=new DataView(buffer),n=b.byteLength;
 if(n>8&&b.getUint32(0)===0x89504e47){for(let i=8;i+12<=n;){const len=b.getUint32(i),type=String.fromCharCode(b.getUint8(i+4),b.getUint8(i+5),b.getUint8(i+6),b.getUint8(i+7));if(type==='pHYs'&&b.getUint8(i+16)===1)return b.getUint32(i+8)*.0254;if(type==='IDAT')break;i+=12+len;}return null;}
 if(n<4||b.getUint16(0)!==0xffd8)return null;let jfif=null;
 for(let i=2;i+4<=n;){if(b.getUint8(i)!==0xff)break;const marker=b.getUint8(i+1),len=b.getUint16(i+2);if(marker===0xda)break;
  if(marker===0xe0&&len>=14&&b.getUint32(i+4)===0x4a464946){const units=b.getUint8(i+11),x=b.getUint16(i+12);if(units===1&&x)jfif=x;else if(units===2&&x)jfif=x*2.54;}
  if(marker===0xe1&&b.getUint32(i+4)===0x45786966){const t=i+10,le=b.getUint16(t)===0x4949,u16=o=>b.getUint16(t+o,le),u32=o=>b.getUint32(t+o,le),ifd=u32(4);let res=null,unit=2;for(let k=0;k<u16(ifd);k++){const e=ifd+2+k*12,tag=u16(e);if(tag===0x011a){const o=u32(e+8);res=u32(o)/u32(o+4);}if(tag===0x0128)unit=u16(e+8);}if(res)return unit===3?res*2.54:res;}
  i+=2+len;}
 return jfif;}
// Cameras usually write 72 or 96 dpi; anything at least 150 dpi is offered as a likely scan.
export const likelyScanDPI=dpi=>Number.isFinite(dpi)&&dpi>=150&&dpi<=4800;

// ---- Foam corners in a photo: the foam is the large region under the photo's centre that differs from
// the table, whose colour is read from the photo's edges (Otsu threshold on the distance to it). Its
// corners (TL, TR, BR, BL) start as the region's extreme points along the two diagonals. On rounded
// corners those sit on the arc, inside the true corner, so each is then refined where straight-line fits
// to its two sides meet. Works on a reduced copy; returns corners in the image's pixels, or null.
export function findFoamCorners(image,maxSide=640){const k=Math.min(1,maxSide/Math.max(image.width,image.height)),w=Math.max(8,Math.round(image.width*k)),h=Math.max(8,Math.round(image.height*k)),n=w*h,src=image.data,rgb=new Float32Array(n*3);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(Math.min(image.height-1,Math.floor((y+.5)/k))*image.width+Math.min(image.width-1,Math.floor((x+.5)/k)))*4,o=(y*w+x)*3;rgb[o]=src[i];rgb[o+1]=src[i+1];rgb[o+2]=src[i+2];}
 const edge=[];for(let x=0;x<w;x++)edge.push(x,(h-1)*w+x);for(let y=0;y<h;y++)edge.push(y*w,y*w+w-1);const median=c=>{const v=edge.map(p=>rgb[p*3+c]).sort((a,b)=>a-b);return v[v.length>>1];},bg=[0,1,2].map(median);
 const dist=new Float32Array(n),hist=new Float64Array(256);for(let p=0;p<n;p++){const d=Math.min(255,Math.hypot(rgb[p*3]-bg[0],rgb[p*3+1]-bg[1],rgb[p*3+2]-bg[2]));dist[p]=d;hist[d|0]++;}
 let sum=0;for(let t=0;t<256;t++)sum+=t*hist[t];let best=0,cut=40,wB=0,sB=0;for(let t=0;t<256;t++){wB+=hist[t];if(!wB)continue;const wF=n-wB;if(!wF)break;sB+=t*hist[t];const mB=sB/wB,mF=(sum-sB)/wF,v=wB*wF*(mB-mF)**2;if(v>best){best=v;cut=t;}}cut=Math.max(25,cut);
 // Close small gaps (writing, glare) before taking the region under the centre.
 let mask=new Uint8Array(n);for(let p=0;p<n;p++)mask[p]=dist[p]>cut?1:0;const r=Math.max(1,Math.round(Math.min(w,h)*.01));mask=erode(dilate(mask,w,h,r),w,h,r);
 const seen=new Uint8Array(n),queue=new Int32Array(n);let start=-1;for(let rr=0;rr<Math.min(w,h)/4&&start<0;rr+=2)for(const [dx,dy] of [[0,0],[rr,0],[-rr,0],[0,rr],[0,-rr]]){const p=((h>>1)+dy)*w+(w>>1)+dx;if(mask[p]){start=p;break;}}if(start<0)return null;
 let tail=0,count=0;seen[start]=1;queue[tail++]=start;const ext=[[Infinity,0],[-Infinity,0],[-Infinity,0],[Infinity,0]];
 for(let head=0;head<tail;head++){const p=queue[head],x=p%w,y=p/w|0;count++;const a=x+y,b=x-y;if(a<ext[0][0])ext[0]=[a,p];if(b>ext[1][0])ext[1]=[b,p];if(a>ext[2][0])ext[2]=[a,p];if(b<ext[3][0])ext[3]=[b,p];for(const q of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(q>=0&&mask[q]&&!seen[q]){seen[q]=1;queue[tail++]=q;}}
 if(count<n*.05||count>n*.97)return null;const rough=ext.map(([,p])=>[(p%w)+.5,(p/w|0)+.5]),rim=[];
 for(let p=0;p<n;p++){if(!seen[p])continue;const x=p%w,y=p/w|0;if(x===0||y===0||x===w-1||y===h-1||!seen[p-1]||!seen[p+1]||!seen[p-w]||!seen[p+w])rim.push([x+.5,y+.5]);}
 // Each snap searches near the current sides, so repeat until the corners settle.
 let corners=fitSides(rough,rim).map(([x,y])=>[x/k,y/k]);for(let pass=0;pass<3;pass++){const next=refineCorners(image,corners,1/k,bg),moved=Math.max(...next.map((p,i)=>Math.hypot(p[0]-corners[i][0],p[1]-corners[i][1])));corners=next;if(moved<1)break;}return corners;}
// Each corner from the two sides that meet there: a total-least-squares line through the boundary
// 6–30% along each side from that corner (past any rounding, and short enough that lens bow near the
// photo's edge barely bends it), fitted twice (the second time keeping points within 1.5 px of the
// first line, so notches and pockets do not tilt it), then intersected. A corner that would move further
// than a tenth of its shorter side keeps its extreme point.
function fitSides(rough,edge){const side=(a,b,from,to)=>{const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy);if(L<8)return null;const ux=dx/L,uy=dy/L,band=Math.max(3,L*.06);let pts=edge.filter(([x,y])=>{const t=((x-a[0])*ux+(y-a[1])*uy)/L,d=Math.abs((x-a[0])*uy-(y-a[1])*ux);return t>from&&t<to&&d<band;}),line=null;
  for(let pass=0;pass<2;pass++){if(pts.length<6)return null;line=fitLine(pts);if(!pass)pts=pts.filter(([x,y])=>Math.abs((x-line.cx)*line.nx+(y-line.cy)*line.ny)<1.5);}return line;};
 return rough.map((c,i)=>{const prev=rough[(i+3)%4],next=rough[(i+1)%4],a=side(prev,c,.7,.94),b=side(c,next,.06,.3),p=a&&b&&meet(a,b),short=Math.min(Math.hypot(c[0]-prev[0],c[1]-prev[1]),Math.hypot(c[0]-next[0],c[1]-next[1]));return p&&Math.hypot(p[0]-c[0],p[1]-c[1])<=short*.1?p:c;});}
// Full-resolution edge snap: along each side near each corner, the strongest colour step within 2% of
// the side's length across it whose outer side is more like the table than its inner side (so the sharp
// foam-to-table edge, not a soft shadow beside it nor a pocket reaching the edge) is taken as the edge; lines through those points are intersected again. A corner that would move more than 3% of
// its shorter side keeps the reduced-copy answer.
function refineCorners(image,corners,px,bg){const {width:w,height:h,data}=image,at=(x,y)=>{x=Math.max(0,Math.min(w-1,Math.round(x)));y=Math.max(0,Math.min(h-1,Math.round(y)));return (y*w+x)*4;};
 const edgePoints=(a,b,from,to)=>{const dx=b[0]-a[0],dy=b[1]-a[1],L=Math.hypot(dx,dy),ux=dx/L,uy=dy/L,nx=-uy,ny=ux,r=Math.max(6,Math.round(L*.02)),pts=[],steps=48;
  // Mean colour of three samples along the side, at offset d across it.
  const colour=(x,y,d)=>{const c=[0,0,0];for(const s of [-2,0,2]){const i=at(x+ux*s+nx*d,y+uy*s+ny*d);c[0]+=data[i];c[1]+=data[i+1];c[2]+=data[i+2];}return c;};
  for(let k=0;k<=steps;k++){const t=from+(to-from)*k/steps,x=a[0]+dx*t,y=a[1]+dy*t,cs=[];for(let d=-r-2;d<=r+2;d++)cs.push(colour(x,y,d));let best=0,off=null;for(let d=-r;d<=r;d++){const p=cs[d+r],q=cs[d+r+4],g=Math.hypot(q[0]-p[0],q[1]-p[1],q[2]-p[2]),table=c=>Math.hypot(c[0]/3-bg[0],c[1]/3-bg[1],c[2]/3-bg[2]);if(g>best&&table(p)<table(q)){best=g;off=d;}}if(off!==null&&best>30)pts.push([x+nx*off,y+ny*off]);}return pts;};
 const line=pts=>{if(pts.length<8)return null;let l=fitLine(pts);const keep=pts.filter(([x,y])=>Math.abs((x-l.cx)*l.nx+(y-l.cy)*l.ny)<Math.max(2,px*1.5));return keep.length<8?null:fitLine(keep);};
 return corners.map((c,i)=>{const prev=corners[(i+3)%4],next=corners[(i+1)%4],a=line(edgePoints(prev,c,.7,.94)),b=line(edgePoints(c,next,.06,.3)),p=a&&b&&meet(a,b),short=Math.min(Math.hypot(c[0]-prev[0],c[1]-prev[1]),Math.hypot(c[0]-next[0],c[1]-next[1]));return p&&Math.hypot(p[0]-c[0],p[1]-c[1])<=short*.03?p:c;});}
function fitLine(pts){let cx=0,cy=0;for(const [x,y] of pts){cx+=x;cy+=y;}cx/=pts.length;cy/=pts.length;let sxx=0,sxy=0,syy=0;for(const [x,y] of pts){sxx+=(x-cx)**2;sxy+=(x-cx)*(y-cy);syy+=(y-cy)**2;}const angle=Math.atan2(2*sxy,sxx-syy)/2;return {cx,cy,nx:-Math.sin(angle),ny:Math.cos(angle)};}
function meet(a,b){const det=a.nx*b.ny-a.ny*b.nx;if(Math.abs(det)<1e-6)return null;const ca=a.nx*a.cx+a.ny*a.cy,cb=b.nx*b.cx+b.ny*b.cy;return [(ca*b.ny-a.ny*cb)/det,(a.nx*cb-ca*b.nx)/det];}

// ---- Pockets in an aligned two-tone foam photo. The aligned photo covers exactly the foam's top
// surface, so its border is top surface; pockets are what clusters as the other colour.
export function foamColours(image){const {width:w,height:h,data}=image,band=Math.max(2,Math.round(Math.min(w,h)*.02)),step=Math.max(1,Math.round(Math.sqrt(w*h/120000))),mean=(pts)=>{const s=[0,0,0];for(const i of pts){s[0]+=data[i];s[1]+=data[i+1];s[2]+=data[i+2];}return s.map(v=>v/Math.max(1,pts.length));};
 const border=[],all=[];for(let y=0;y<h;y+=step)for(let x=0;x<w;x+=step){const i=(y*w+x)*4;all.push(i);if(x<band||y<band||x>=w-band||y>=h-band)border.push(i);}
 const dist=(i,c)=>(data[i]-c[0])**2+(data[i+1]-c[1])**2+(data[i+2]-c[2])**2;let surface=mean(border),far=all[0];for(const i of all)if(dist(i,surface)>dist(far,surface))far=i;let pocket=[data[far],data[far+1],data[far+2]];
 // Two-means, keeping the surface cluster seeded by the border.
 for(let k=0;k<10;k++){const a=[],b=[];for(const i of all)(dist(i,surface)<=dist(i,pocket)?a:b).push(i);if(!b.length)break;surface=mean(a);pocket=mean(b);}
 return {surface,pocket,contrast:Math.sqrt((surface[0]-pocket[0])**2+(surface[1]-pocket[1])**2+(surface[2]-pocket[2])**2)};}
// Sensitivity -1…1 moves the boundary between the two colours: higher finds more pocket.
export function pocketMask(image,{surface,pocket},sensitivity=0){const {width:w,height:h,data}=image,mask=new Uint8Array(w*h),d2=(i,c)=>Math.sqrt((data[i]-c[0])**2+(data[i+1]-c[1])**2+(data[i+2]-c[2])**2),gap=Math.sqrt((surface[0]-pocket[0])**2+(surface[1]-pocket[1])**2+(surface[2]-pocket[2])**2),bias=-sensitivity*gap*.5;for(let p=0;p<w*h;p++){const i=p*4;mask[p]=d2(i,surface)-d2(i,pocket)>bias?1:0;}return mask;}
// Square-kernel erosion/dilation, separable, radius in pixels.
function morph(mask,w,h,r,grow){if(r<1)return mask;const tmp=new Uint8Array(w*h),out=new Uint8Array(w*h),hit=grow?1:0;
 for(let y=0;y<h;y++){let count=0;const row=y*w,val=x=>mask[row+x]===hit?1:0;for(let x=0;x<=Math.min(w-1,r);x++)count+=val(x);for(let x=0;x<w;x++){tmp[row+x]=grow?(count?1:0):(count?0:1);const add=x+r+1,drop=x-r;if(add<w)count+=val(add);if(drop>=0)count-=val(drop);}}
 for(let x=0;x<w;x++){let count=0;const val=y=>tmp[y*w+x]===hit?1:0;for(let y=0;y<=Math.min(h-1,r);y++)count+=val(y);for(let y=0;y<h;y++){out[y*w+x]=grow?(count?1:0):(count?0:1);const add=y+r+1,drop=y-r;if(add<h)count+=val(add);if(drop>=0)count-=val(drop);}}
 return out;}
export const erode=(m,w,h,r)=>morph(m,w,h,r,false),dilate=(m,w,h,r)=>morph(m,w,h,r,true);
// Areas to ignore, such as the scale card lying on the foam.
function grow(poly,mm){const cx=poly.reduce((a,p)=>a+p[0],0)/poly.length,cy=poly.reduce((a,p)=>a+p[1],0)/poly.length;return poly.map(([x,y])=>{const d=Math.hypot(x-cx,y-cy)||1;return [x+(x-cx)/d*mm,y+(y-cy)/d*mm];});}
function clearPolygon(mask,w,h,poly){const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]),inside=(x,y)=>{let yes=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++)if((poly[i][1]>y)!==(poly[j][1]>y)&&x<(poly[j][0]-poly[i][0])*(y-poly[i][1])/(poly[j][1]-poly[i][1])+poly[i][0])yes=!yes;return yes;};for(let y=Math.max(0,Math.floor(Math.min(...ys)));y<=Math.min(h-1,Math.ceil(Math.max(...ys)));y++)for(let x=Math.max(0,Math.floor(Math.min(...xs)));x<=Math.min(w-1,Math.ceil(Math.max(...xs)));x++)if(inside(x+.5,y+.5))mask[y*w+x]=0;}
// Detect pockets in an aligned photo of a foam `widthMm` × `heightMm`. Returns outlines in foam
// millimetres (largest first). `shrinkMm` pulls outlines in, to offset pocket walls seen at an angle.
export function detectPockets(image,widthMm,colours,{sensitivity=0,shrinkMm=0,minArea=40,swap=false,exclude=[]}={}){const {width:w,height:h}=image,scale=w/widthMm,px=mm=>Math.max(0,Math.round(mm*scale));
 const c=swap?{surface:colours.pocket,pocket:colours.surface}:colours;let mask=pocketMask(image,c,sensitivity);for(const quad of exclude)clearPolygon(mask,w,h,grow(quad,3).map(([x,y])=>[x*scale,y*scale]));
 // Remove speckle and close hairline gaps (about 0.6 mm), then apply the requested shrink.
 const r=Math.max(1,px(.6));mask=dilate(erode(mask,w,h,r),w,h,r);mask=erode(dilate(mask,w,h,r),w,h,r);if(shrinkMm>0)mask=erode(mask,w,h,px(shrinkMm));
 const outline=ring=>{let p=cleanRing(ring);try{p=fairOutline(p,{radius:1.2,maxDeviation:.4,strength:2});}catch{}return simplify(cleanRing(p),.08);},inBounds=p=>p.every(([x,y])=>x>=-1&&y>=-1&&x<=widthMm+1&&y<=h/scale+1);
 const rings=contours(mask,w,h,scale,minArea).map(outline).filter(p=>p.length>=3&&Math.abs(polygonArea(p))>=minArea&&inBounds(p));
 // Islands: top surface the foam's outer surface can't reach (raised areas inside a pocket). Each
 // becomes a hole in the pocket around it, so it is cut around rather than removed.
 const holes=rings.map(()=>[]),islandMin=Math.max(4,minArea/4);for(const ring of contours(islandMask(mask,w,h),w,h,scale,islandMin).map(outline)){if(ring.length<3||Math.abs(polygonArea(ring))<islandMin)continue;const k=rings.findIndex(outer=>ring.every(p=>insideRing(p,outer)));if(k>=0)holes[k].push(ring);}
 const closed=p=>[...p.map(q=>[...q]),[...p[0]]];
 return rings.map((p,k)=>({shape:[[closed(p),...holes[k].map(closed)]],area:Math.abs(polygonArea(p))-holes[k].reduce((a,q)=>a+Math.abs(polygonArea(q)),0),islands:holes[k].length}));}
function insideRing([x,y],ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++)if((ring[i][1]>y)!==(ring[j][1]>y)&&x<(ring[j][0]-ring[i][0])*(y-ring[i][1])/(ring[j][1]-ring[i][1])+ring[i][0])yes=!yes;return yes;}
// Surface pixels (mask 0) not connected, through other surface pixels, to the image border.
function islandMask(mask,w,h){const reached=new Uint8Array(w*h),queue=new Int32Array(w*h);let tail=0;const seed=p=>{if(!mask[p]&&!reached[p]){reached[p]=1;queue[tail++]=p;}};for(let x=0;x<w;x++){seed(x);seed((h-1)*w+x);}for(let y=0;y<h;y++){seed(y*w);seed(y*w+w-1);}
 for(let head=0;head<tail;head++){const p=queue[head],x=p%w;if(x>0)seed(p-1);if(x<w-1)seed(p+1);if(p>=w)seed(p-w);if(p<w*(h-1))seed(p+w);}
 const out=new Uint8Array(w*h);for(let p=0;p<w*h;p++)out[p]=!mask[p]&&!reached[p]?1:0;return out;}
