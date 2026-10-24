import {contours,refinePaths,PAPERS,polygonArea,simplify} from './vision.js?v=20261025-tch1';
export function pointToImage(p,rect){const s=rect.scale||rect.width/PAPERS[rect.paper||'a4'][0],[ox,oy]=rect.origin||[0,0];return [(p.x-ox)*s,(p.y-oy)*s];}
export function imageToPoint(p,rect){const s=rect.scale||rect.width/PAPERS[rect.paper||'a4'][0],[ox,oy]=rect.origin||[0,0];return {x:p[0]/s+ox,y:p[1]/s+oy};}
export function normalizedPrompts(points,rect){return points.map(p=>{const [x,y]=pointToImage(p,rect);if(x<0||y<0||x>=rect.width||y>=rect.height)throw Error('Tap inside the photographed area.');return {x:x/rect.width,y:y/rect.height,label:p.label};});}
export function insidePath(p,poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
export function promptTarget(tools,p,selected,negative=false){if(negative)return tools[selected]?.tap?selected:-1;return tools.findIndex(t=>t.tap&&insidePath(p,t.points));}
export function validPrompts(tap){return tap&&['mediapipe','sam'].includes(tap.engine)&&Array.isArray(tap.points)&&tap.points.length>0&&tap.points.length<=64&&tap.points.some(p=>p.label===1)&&tap.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=3000&&Math.abs(p.y)<=3000&&(p.label===0||p.label===1));}
export function bestMask(scores){let best=0;for(let i=1;i<scores.length;i++)if(Number.isFinite(scores[i])&&(!Number.isFinite(scores[best])||scores[i]>scores[best]))best=i;return best;}
// Nearest-neighbour resampling preserves a binary region. The model's own edge is kept (edge snapping
// pulled points onto chrome reflections and shadow edges, hopping in and out of it); cast shadow is
// trimmed from the photo instead.
export function maskToPaths(result,rect,paper='a4',options={}){const {snapEdges=false,trimShadow:trim=true,bound=3}=options;const {mask,width,height}=result;if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width*height!==mask?.length||width*height>5e6)throw Error('Invalid segmentation mask.');const w=rect.width,h=rect.height,s=rect.scale||w/PAPERS[paper][0],[ox,oy]=rect.origin||[0,0],full=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;full[i]=rect.data[i*4+3]&&mask[Math.min(height-1,Math.floor((y+.5)*height/h))*width+Math.min(width-1,Math.floor((x+.5)*width/w))]>.5?1:0;}
 const near=result.bound?rasterize(result.bound,w,h):null;if(near&&bound>0)clipNear(full,w,h,near,bound*s);const cell=result.view?result.view.window[2]/result.view.width:w/width,paths=contours(trim?trimShadow(full,rect,s,{...options.shadow,outline:near}):full,w,h,s,options.minArea??20).filter(p=>!p.some(([x,y])=>x*s<2||y*s<2||x*s>w-2||y*s>h-2)).map(p=>snapEdges?p:smoothRing(p,.6*Math.max(1,cell)/s));
 return refinePaths(paths,rect,s,{...options,snapEdges}).map(p=>p.map(([x,y])=>[x+ox,y+oy])).filter(p=>!options.points||options.points.filter(q=>q.label===1).some(q=>insidePath(q,p))).sort((a,b)=>polygonArea(b)-polygonArea(a));}
// The mask is upscaled from the model's crop, so its edge is a staircase of `cell` photo pixels. A Gaussian
// over the resampled ring (sigma in mm, about half a step) irons the stairs flat without rounding real corners
// more than a step.
export function smoothRing(poly,sigma){if(!(sigma>0)||poly.length<4)return poly;const step=sigma/3,seg=poly.map((a,i)=>Math.hypot(poly[(i+1)%poly.length][0]-a[0],poly[(i+1)%poly.length][1]-a[1])),length=seg.reduce((a,b)=>a+b,0),n=Math.max(8,Math.ceil(length/step)),pts=[];let e=0,base=0;
 for(let i=0;i<n;i++){const d=i*length/n;while(e<poly.length-1&&base+seg[e]<d)base+=seg[e++];const t=(d-base)/(seg[e]||1),a=poly[e],b=poly[(e+1)%poly.length];pts.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
 const r=Math.ceil(3*sigma/(length/n)),g=Array.from({length:2*r+1},(_,k)=>Math.exp(-(((k-r)*length/n)**2)/(2*sigma*sigma))),total=g.reduce((a,b)=>a+b,0);
 return simplify(pts.map((_,i)=>{let x=0,y=0;for(let k=-r;k<=r;k++){const q=pts[(i+k+n)%n];x+=q[0]*g[k+r];y+=q[1]*g[k+r];}return [x/total,y/total];}),.03);}
// A single tap's region may not stray more than `r` pixels beyond the Smart edges outline that chose the
// object: the model sometimes takes in a patch of plain paper between handles, which no shadow test removes.
// A chamfer distance from the outline's raster (1 inside) bounds it.
export function clipNear(mask,w,h,ref,r){const d=new Float32Array(w*h);for(let i=0;i<d.length;i++)d[i]=ref[i]?0:1e9;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;if(!d[i])continue;let v=d[i];if(x>0)v=Math.min(v,d[i-1]+1);if(y>0){v=Math.min(v,d[i-w]+1);if(x>0)v=Math.min(v,d[i-w-1]+1.4);if(x<w-1)v=Math.min(v,d[i-w+1]+1.4);}d[i]=v;}
 for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){const i=y*w+x;if(!d[i])continue;let v=d[i];if(x<w-1)v=Math.min(v,d[i+1]+1);if(y<h-1){v=Math.min(v,d[i+w]+1);if(x<w-1)v=Math.min(v,d[i+w+1]+1.4);if(x>0)v=Math.min(v,d[i+w-1]+1.4);}d[i]=v;}
 for(let i=0;i<mask.length;i++)if(mask[i]&&d[i]>r)mask[i]=0;return mask;}
// A cast shadow is the paper beside the tool, only darker: the same colour balance and smooth. Peel such
// pixels from the outside in, at most `depth` mm. A tool's dark rim, coloured grips and chrome highlights
// fail the test and stop the peel. Pixels as bright as the paper are left too: peeling them also ate
// chrome reflecting the sheet (tuned on the sample set against the Gemini silhouettes), except outside the
// Smart edges `outline` (a raster, 1 inside) of a single tap, where plain paper is far likelier than chrome. The paper is measured per cell in a ring 2–5 mm outside the region,
// since lighting varies across the sheet.
export function trimShadow(mask,rect,s,{depth=2.5,dark=.5,light=.93,tint=.035,rough=.15,ring=[2,5],cell=16,maxShare=.3,outline=null,paperLight=1.05}={}){const w=rect.width,h=rect.height,d=rect.data;let x0=w,y0=h,x1=-1,y1=-1;
 for(let i=0;i<mask.length;i++)if(mask[i]){const x=i%w,y=(i/w)|0;if(x<x0)x0=x;if(x>x1)x1=x;if(y<y0)y0=y;if(y>y1)y1=y;}if(x1<0)return mask;
 const R=Math.ceil(ring[1]*s),bx=Math.max(0,x0-R-1),by=Math.max(0,y0-R-1),bw=Math.min(w-1,x1+R+1)-bx+1,bh=Math.min(h-1,y1+R+1)-by+1,n=bw*bh,m=new Uint8Array(n),dist=new Int16Array(n).fill(-1),q=new Int32Array(n),at=k=>((by+(k/bw|0))*w+bx+k%bw)*4,near=k=>{const x=k%bw,y=k/bw|0;return [x>0?k-1:-1,x<bw-1?k+1:-1,y>0?k-bw:-1,y<bh-1?k+bw:-1];};
 let t=0,area=0;for(let k=0;k<n;k++)if(mask[at(k)/4]){m[k]=1;dist[k]=0;q[t++]=k;area++;}
 for(let i=0;i<t;i++){const k=q[i];if(dist[k]<R)for(const j of near(k))if(j>=0&&dist[j]<0){dist[j]=dist[k]+1;q[t++]=j;}}
 // 3×3 mean colour within the region (or outside it, for the ring); JPEG noise would otherwise decide single pixels.
 const colour=k=>{const x=k%bw,y=k/bw|0;let r=0,g=0,b=0,c=0;for(let v=Math.max(0,y-1);v<=Math.min(bh-1,y+1);v++)for(let u=Math.max(0,x-1);u<=Math.min(bw-1,x+1);u++){const i=at(v*bw+u);if(!d[i+3]||m[v*bw+u]!==m[k])continue;r+=d[i];g+=d[i+1];b+=d[i+2];c++;}return c?[r/c,g/c,b/c]:null;};
 const C=Math.max(8,Math.round(cell*s)),cw=Math.ceil(bw/C),cells=Array.from({length:cw*Math.ceil(bh/C)},()=>[]),all=[];
 for(let k=0;k<n;k++)if(dist[k]>=ring[0]*s&&d[at(k)+3]){const i=at(k),v=[d[i],d[i+1],d[i+2]];cells[((k/bw|0)/C|0)*cw+((k%bw)/C|0)].push(v);all.push(v);}
 const level=list=>{const ys=list.map(v=>v[0]+v[1]+v[2]).sort((a,b)=>a-b),y=ys[Math.floor(ys.length*.8)],lit=list.filter(v=>v[0]+v[1]+v[2]>=ys[Math.floor(ys.length/2)]),sum=lit.reduce((a,v)=>[a[0]+v[0],a[1]+v[1],a[2]+v[2]],[0,0,0]),z=sum[0]+sum[1]+sum[2]||1;return {y,c:[sum[0]/z,sum[1]/z,sum[2]/z]};};
 if(all.length<50)return mask;const global=level(all),papers=cells.map(c=>c.length>=40?level(c):global);
 const like=(k,v=colour(k))=>{if(!v)return false;const p=papers[((k/bw|0)/C|0)*cw+((k%bw)/C|0)],y=v[0]+v[1]+v[2],ratio=y/p.y;return ratio>=dark&&ratio<=(outline?.[at(k)/4]===0?paperLight:light)&&Math.abs(v[0]/y-p.c[0])+Math.abs(v[1]/y-p.c[1])+Math.abs(v[2]/y-p.c[2])<=tint;};
 // Shadow brightness changes slowly; a sharp step to a neighbour still in the region is the tool's edge
 // or its texture (knurling, engraving), so the peel stops there. Texture is judged on single
 // pixels, since the 3×3 mean would blur it into a shadow-like grey.
 const shadow=k=>{if(!like(k))return false;const p=papers[((k/bw|0)/C|0)*cw+((k%bw)/C|0)];const raw=j=>{const i=at(j);return d[i+3]?[d[i],d[i+1],d[i+2]]:null;},o=raw(k),z=o[0]+o[1]+o[2];return near(k).every(j=>{if(j<0||!m[j])return true;const c=raw(j);return !c||Math.abs(c[0]+c[1]+c[2]-z)/p.y<=rough;});};
 const peel=new Int16Array(n);let removed=0;t=0;for(let k=0;k<n;k++)if(m[k]&&near(k).some(j=>j<0||!m[j])&&shadow(k)){m[k]=0;peel[k]=1;q[t++]=k;removed++;}
 const D=Math.round(depth*s);for(let i=0;i<t;i++){const k=q[i];if(peel[k]>=D)continue;for(const j of near(k))if(j>=0&&m[j]&&shadow(j)){m[j]=0;peel[j]=peel[k]+1;q[t++]=j;removed++;}}
 if(!removed||removed>maxShare*area)return mask;
 // Opening by one pixel drops hairs left between peeled pixels; it can only remove.
 const er=new Uint8Array(n);for(let k=0;k<n;k++)er[k]=m[k]&&near(k).every(j=>j>=0&&m[j])?1:0;const out=mask.slice();for(let k=0;k<n;k++)if(mask[at(k)/4])out[at(k)/4]=m[k]&&(er[k]||near(k).some(j=>j>=0&&er[j]))?1:0;return out;}
// ---- Choosing the tool from model output. Each candidate mask is reduced to the connected region under
// the tap; regions that cover most of the view or touch three of its edges are the sheet or the table.
// Of the rest, whole objects (not touching the view's edge) win, then the larger one, so SAM's "whole
// tool" answer beats its "handle only" answer.
export function componentAt(mask,w,h,x,y,reach=Math.max(2,Math.round(Math.max(w,h)*.02))){let start=-1;x=Math.round(x);y=Math.round(y);for(let r=0;r<=reach&&start<0;r++)for(let dy=-r;dy<=r&&start<0;dy++)for(let dx=-r;dx<=r;dx++){const u=x+dx,v=y+dy;if(u>=0&&v>=0&&u<w&&v<h&&mask[v*w+u]){start=v*w+u;break;}}
 if(start<0)return null;const out=new Uint8Array(w*h),queue=new Int32Array(w*h);let tail=0,count=0,minX=w,minY=h,maxX=0,maxY=0;out[start]=1;queue[tail++]=start;
 for(let head=0;head<tail;head++){const p=queue[head],px=p%w,py=(p/w)|0;count++;if(px<minX)minX=px;if(px>maxX)maxX=px;if(py<minY)minY=py;if(py>maxY)maxY=py;for(const n of [px>0?p-1:-1,px<w-1?p+1:-1,py>0?p-w:-1,py<h-1?p+w:-1])if(n>=0&&mask[n]&&!out[n]){out[n]=1;queue[tail++]=n;}}
 const edges=(minX===0)+(minY===0)+(maxX===w-1)+(maxY===h-1);return {mask:out,count,share:count/(w*h),box:[minX,minY,maxX+1,maxY+1],edges};}
export function pickCandidate(candidates,w,h,at,{maxShare=.85,prefer=null,outline=null}={}){const found=candidates.map(c=>componentAt(c.mask,w,h,at[0],at[1])).filter(c=>c&&c.share<=maxShare&&c.edges<3);if(outline){const ref=rasterize(outline,w,h);found.sort((a,b)=>maskIoU(b.mask,ref)-maskIoU(a.mask,ref));}else if(prefer)found.sort((a,b)=>boxIoU(b.box,prefer)-boxIoU(a.box,prefer));else found.sort((a,b)=>(a.edges>0)-(b.edges>0)||b.count-a.count);return found[0]||null;}
// Pixel agreement with the classical outline: the model supplies the edges, the outline picks which answer.
export function rasterize(poly,w,h){const out=new Uint8Array(w*h);for(let y=0;y<h;y++){const cy=y+.5,xs=[];for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>cy)!==(b[1]>cy))xs.push(a[0]+(cy-a[1])*(b[0]-a[0])/(b[1]-a[1]));}xs.sort((p,q)=>p-q);for(let k=0;k+1<xs.length;k+=2)for(let x=Math.max(0,Math.ceil(xs[k]-.5));x<Math.min(w,Math.ceil(xs[k+1]-.5));x++)out[y*w+x]=1;}return out;}
export function maskIoU(a,b){let i=0,u=0;for(let k=0;k<a.length;k++){if(a[k]&&b[k])i++;if(a[k]||b[k])u++;}return u?i/u:0;}
// Interior points spread along an outline's long axis: the most interior point of each of `n` bands.
// SAM given one tap often returns just a jaw or a handle; taps along the whole tool return the tool.
export function spreadPoints(poly,n=5){const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]),long=Math.max(...xs)-Math.min(...xs)>=Math.max(...ys)-Math.min(...ys),along=long?xs:ys,across=long?ys:xs,lo=Math.min(...along),hi=Math.max(...along),a0=Math.min(...across),a1=Math.max(...across),out=[];
 const inside=(x,y)=>insidePath({x,y},poly),edge=(x,y)=>Math.min(...poly.map((a,i)=>{const b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);}));
 for(let k=0;k<n;k++){const from=lo+(hi-lo)*k/n,to=lo+(hi-lo)*(k+1)/n,step=Math.max(1,(to-from)/10,(a1-a0)/24);let best=null;for(let u=from+step/2;u<to;u+=step)for(let v=a0+step/2;v<a1;v+=step){const [x,y]=long?[u,v]:[v,u];if(!inside(x,y))continue;const d=edge(x,y);if(!best||d>best.d)best={x,y,d};}if(best)out.push([best.x,best.y]);}return out;}
// The nearest point at least `depth` inside an outline (or as deep as it gets, if thinner), searched within
// `reach` of p; units are the outline's. A finger lands on a tool's edge as often as on the tool.
export function nudgeInside(poly,p,depth,reach=depth*4){const edge=(x,y)=>Math.min(...poly.map((a,i)=>{const b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy);})),inside=(x,y)=>insidePath({x,y},poly);
 if(inside(p.x,p.y)&&edge(p.x,p.y)>=depth)return p;const step=depth/4,found=[];for(let y=p.y-reach;y<=p.y+reach;y+=step)for(let x=p.x-reach;x<=p.x+reach;x+=step)if(inside(x,y))found.push({x,y,d:edge(x,y),far:Math.hypot(x-p.x,y-p.y)});
 if(!found.length)return p;const need=Math.min(depth,Math.max(...found.map(f=>f.d))*.8),best=found.filter(f=>f.d>=need).sort((a,b)=>a.far-b.far)[0];return {...p,x:best.x,y:best.y};}
export function boxIoU(a,b){const w=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0])),h=Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1])),i=w*h,u=(a[2]-a[0])*(a[3]-a[1])+(b[2]-b[0])*(b[3]-b[1])-i;return u>0?i/u:0;}
// The classical outline under (or within 6 mm of) a tap, as a pixel box in the rectified image.
export function proposalBox(rect,tap){const s=rect.scale||rect.width/PAPERS[rect.paper||'a4'][0],[ox,oy]=rect.origin||[0,0],near=(p,q)=>Math.min(...p.map((a,i)=>{const b=p[(i+1)%p.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((q.x-a[0])*dx+(q.y-a[1])*dy)/(dx*dx+dy*dy||1)));return Math.hypot(q.x-a[0]-t*dx,q.y-a[1]-t*dy);}));const p=(rect.proposals||[]).find(p=>insidePath(tap,p))||(rect.proposals||[]).find(p=>near(p,tap)<6);if(!p)return null;const px=p.map(v=>[(v[0]-ox)*s,(v[1]-oy)*s]),xs=px.map(v=>v[0]),ys=px.map(v=>v[1]),box=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];box.outline=px;return box;}
// The zoomed view around a region (pixel box in the rectified image), with a margin and a minimum size.
export function zoomWindow(box,rect,{margin=.25,minMm=40}={}){const s=rect.scale||rect.width/PAPERS[rect.paper||'a4'][0],cx=(box[0]+box[2])/2,cy=(box[1]+box[3])/2,size=Math.max((box[2]-box[0])*(1+2*margin),(box[3]-box[1])*(1+2*margin),minMm*s),w=Math.min(rect.width,Math.max(box[2]-box[0]+30*s,size)),h=Math.min(rect.height,Math.max(box[3]-box[1]+30*s,size)),x=Math.max(0,Math.min(rect.width-w,cx-w/2)),y=Math.max(0,Math.min(rect.height-h,cy-h/2));return [Math.round(x),Math.round(y),Math.round(w),Math.round(h)];}
