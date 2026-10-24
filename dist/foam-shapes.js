import clip from './vendor/polygon-clipping.js';
import {uid,clone,extent,posed,moveShape,normalizePaths,zonesFor,shapeArea} from './foam-model.js?v=20261025-shd1';
// Generators and edits for parametric cutouts (see validSpec in foam-model.js) and for
// operations that combine or repeat tools.
// Closed centripetal Catmull-Rom spline through the clicked points, sampled finely enough for cutting.
export function splinePoints(points,steps=24){const n=points.length,out=[],P=i=>points[(i+n)%n];for(let i=0;i<n;i++){const p0=P(i-1),p1=P(i),p2=P(i+1),p3=P(i+2),d=(a,b)=>Math.max(1e-6,Math.hypot(b[0]-a[0],b[1]-a[1])**.5),t1=d(p0,p1),t2=t1+d(p1,p2),t3=t2+d(p2,p3);for(let k=0;k<steps;k++){const t=t1+(t2-t1)*k/steps,L=(a,b,ta,tb)=>[0,1].map(j=>((tb-t)*a[j]+(t-ta)*b[j])/(tb-ta)),A1=L(p0,p1,0,t1),A2=L(p1,p2,t1,t2),A3=L(p2,p3,t2,t3),B1=L(A1,A2,0,t2),B2=L(A2,A3,t1,t3);out.push(L(B1,B2,t1,t2));}}return out;}
export function roundedRect(w,h,r){r=Math.max(0,Math.min(r,w/2,h/2));if(!r)return [[0,0],[w,0],[w,h],[0,h]];const pts=[],seg=24;for(const [cx,cy,a0] of [[w-r,r,-90],[w-r,h-r,0],[r,h-r,90],[r,r,180]])for(let k=0;k<=seg;k++){const a=(a0+90*k/seg)*Math.PI/180;pts.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}return pts.filter((p,i)=>!i||Math.hypot(p[0]-pts[i-1][0],p[1]-pts[i-1][1])>1e-9);}
export function ellipse(w,h){const n=4*Math.max(18,Math.ceil(Math.PI*Math.max(w,h)/6));return Array.from({length:n},(_,k)=>{const a=k/n*2*Math.PI;return [w/2+w/2*Math.cos(a),h/2+h/2*Math.sin(a)];});}
export function specRing(spec){if(spec.type==='rect')return roundedRect(spec.w,spec.h,spec.r||0);if(spec.type==='slot')return roundedRect(spec.w,spec.h,Math.min(spec.w,spec.h)/2);if(spec.type==='ellipse')return ellipse(spec.w,spec.h);if(spec.type==='spline')return splinePoints(spec.points);return spec.points.map(p=>[...p]);}
// Outline and spec in the tool's own coordinates, with the outline's bounding box at 0,0.
export function fromSpec(spec){const ring=specRing(spec),b=extent([[ring]]),shift=[b.minX,b.minY];return {shape:normalizePaths([ring]),spec:spec.points?{...spec,points:spec.points.map(([x,y])=>[x-shift[0],y-shift[1]])}:{...spec},shift};}
export const posePoint=(t,p)=>posed(t,[[[p]]])[0][0][0];
const centre=t=>{const b=extent(posed(t));return [(b.minX+b.maxX)/2,(b.minY+b.maxY)/2];};
// Rebuild a tool from new parameters. `anchor` is a point in its current local coordinates
// that stays fixed on the layout (a node that is not being dragged); otherwise the centre stays.
export function reshapeTool(t,spec,anchor){const next=fromSpec(spec),[sx,sy]=next.shift,out={...t,shape:next.shape,spec:next.spec,zones:t.zones.map(z=>({...z,shape:moveShape(z.shape,-sx,-sy)}))},before=anchor?posePoint(t,anchor):centre(t),after=anchor?posePoint(out,[anchor[0]-sx,anchor[1]-sy]):centre(out);out.x+=before[0]-after[0];out.y+=before[1]-after[1];return out;}
// Index of the control-polygon edge nearest p; a new node goes after it.
export function nearestEdge(points,p){let best=0,dist=Infinity;points.forEach((a,i)=>{const b=points[(i+1)%points.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1))),d=Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy);if(d<dist){dist=d;best=i;}});return best;}
const bake=(shape,zones)=>{const b=extent(shape);return {x:b.minX,y:b.minY,rotation:0,shape:moveShape(shape,-b.minX,-b.minY),zones:zones.map(z=>({...z,shape:moveShape(z.shape,-b.minX,-b.minY)}))};};
// Merge tools into one pocket at the shallowest depth; deeper members become depth regions.
export function mergeTools(tools){if(tools.length<2)throw Error('Select at least two items to merge.');const shape=clip.union(...tools.map(t=>posed(t)));if(!shape.length)throw Error('Merged outline is empty.');const depth=Math.min(...tools.map(t=>t.depth)),zones=tools.flatMap(t=>[...(t.depth>depth?[{id:uid(),depth:t.depth,shape:posed(t)}]:[]),...zonesFor(t).map(z=>({id:uid(),depth:z.depth,shape:posed(t,z.shape)}))]);if(zones.length>24)throw Error('Merged pocket would need more than 24 depth regions. Merge fewer items.');return {id:uid(),name:tools.map(t=>t.name).join(' + ').slice(0,60),depth,...bake(shape,zones)};}
// Cut the other items out of the base; the base keeps its name, depth and regions.
export function subtractTools(base,cutters){const shape=clip.difference(posed(base),...cutters.map(t=>posed(t)));if(shapeArea(shape)<1)throw Error('Nothing would be left of '+base.name+'.');const out={...clone(base),...bake(shape,base.zones.map(z=>({...z,shape:posed(base,z.shape)})))};delete out.spec;delete out.libraryId;return out;}
// Copies of a group in a grid of columns × rows with edge-to-edge gaps; the original is cell 0,0.
export function arrayCopies(group,{columns,rows,gapX,gapY}){const boxes=group.map(t=>extent(posed(t))),w=Math.max(...boxes.map(b=>b.maxX))-Math.min(...boxes.map(b=>b.minX)),h=Math.max(...boxes.map(b=>b.maxY))-Math.min(...boxes.map(b=>b.minY)),out=[];for(let r=0;r<rows;r++)for(let c=0;c<columns;c++){if(!r&&!c)continue;const lock=group.length>1?uid():undefined;for(const t of group){const copy={...clone(t),id:uid(),x:t.x+c*(w+gapX),y:t.y+r*(h+gapY)};if(lock)copy.lock=lock;else delete copy.lock;out.push(copy);}}return out;}
// "10, 12.5, 17@38, 0.875in" → diameters (and optional depths) in mm.
export function parseLength(s){const m=/^(\d*\.?\d+)\s*(mm|in|")?$/i.exec(s.trim());if(!m)return NaN;return +m[1]*(m[2]&&m[2].toLowerCase()!=='mm'?25.4:1);}
export function parseSockets(text){const items=text.split(/[,;\n]+/).map(s=>s.trim()).filter(Boolean).map(token=>{const [size,depth]=token.split('@'),d=parseLength(size);if(!(d>=2&&d<=300))throw Error(`"${token}" is not a diameter of 2–300 mm.`);const item={d,label:size.trim()};if(depth!==undefined){item.depth=parseLength(depth);if(!(item.depth>0))throw Error(`"${token}" has an invalid depth.`);}return item;});if(!items.length)throw Error('Enter at least one socket diameter.');if(items.length>60)throw Error('Maximum 60 sockets per row.');return items;}
// A row of circular pockets, edge to edge `gap` apart, centred on one line or aligned along their tops or bottoms.
export function socketRow(items,{gap=8,clearance=.5,depth=25,align='centre'}={}){const sizes=items.map(i=>i.d+clearance),tallest=Math.max(...sizes);let x=0;return items.map((item,k)=>{const D=sizes[k],y=align==='top'?0:align==='bottom'?tallest-D:(tallest-D)/2,{shape,spec}=fromSpec({type:'ellipse',w:D,h:D}),t={id:uid(),name:`Socket Ø${/^[\d.]+$/.test(item.label)?item.label+' mm':item.label}`.slice(0,60),x,y,rotation:0,depth:item.depth||depth,shape,spec,zones:[]};x+=D+gap;return t;});}
// Interactive sketch tools. Two-click tools take a first point then a second point (or typed sizes);
// a slot takes its centre line then its width; lines and splines collect points until closed.
export const SKETCH_TOOLS={
 rect:{label:'Rectangle',name:'Rectangle',hint:'Click two corners'},
 crect:{label:'Center rectangle',name:'Rectangle',hint:'Click the centre, then a corner'},
 circle:{label:'Circle',name:'Circle',hint:'Click the centre, then the edge'},
 ellipse:{label:'Ellipse',name:'Ellipse',hint:'Click the centre, then a corner of its box'},
 slot:{label:'Slot',name:'Slot',hint:'Click both end centres, then the width'},
 line:{label:'Line',name:'Polygon',hint:'Click corners; click the first point, double-click or Enter to close'},
 spline:{label:'Spline',name:'Spline',hint:'Click points; click the first point, double-click or Enter to close'}};
export function sketchFields(tool,n){if(!n||tool==='spline')return [];if(tool==='circle')return [['d','Ø']];if(tool==='slot')return n===1?[['l','L']]:[['w','W']];if(tool==='line')return [['len','L'],['ang','∠']];return [['w','W'],['h','H']];}
const deg=Math.PI/180;
// Snap a direction to the nearest 45° when within 4°, unless a typed angle overrides it.
function direction(a,p,typedAngle,snap){let ang=typedAngle!==undefined?typedAngle:-Math.atan2(p[1]-a[1],p[0]-a[0])/deg;if(typedAngle===undefined&&snap){const near=Math.round(ang/45)*45;if(Math.abs(near-ang)<4)ang=near;}return ang;}
export function sketchStep(tool,pts,p,typed={},{radius=0,snap=true}={}){
 const a=pts[0],dx=p[0]-(a?.[0]??0),dy=p[1]-(a?.[1]??0),n=pts.length;
 if(!n)return {live:{},preview:[]};
 if(tool==='rect'){const w=typed.w??Math.abs(dx),h=typed.h??Math.abs(dy),sx=Math.sign(dx)||1,sy=Math.sign(dy)||1;return {live:{w,h},shape:{spec:{type:'rect',w,h,r:radius},centre:[a[0]+sx*w/2,a[1]+sy*h/2],rotation:0}};}
 if(tool==='crect'||tool==='ellipse'){const w=typed.w??2*Math.abs(dx),h=typed.h??2*Math.abs(dy);return {live:{w,h},shape:{spec:tool==='crect'?{type:'rect',w,h,r:radius}:{type:'ellipse',w,h},centre:[...a],rotation:0}};}
 if(tool==='circle'){const d=typed.d??2*Math.hypot(dx,dy);return {live:{d},shape:{spec:{type:'ellipse',w:d,h:d},centre:[...a],rotation:0}};}
 if(tool==='slot'){if(n===1){const ang=direction(a,p,undefined,snap),l=typed.l??Math.hypot(dx,dy),point=[a[0]+l*Math.cos(ang*deg),a[1]-l*Math.sin(ang*deg)];return {live:{l},point,preview:[a,point]};}
  const b=pts[1],l=Math.hypot(b[0]-a[0],b[1]-a[1]),ux=(b[0]-a[0])/(l||1),uy=(b[1]-a[1])/(l||1),w=typed.w??2*Math.abs((p[0]-a[0])*uy-(p[1]-a[1])*ux);return {live:{w},shape:{spec:{type:'slot',w:l+w,h:w},centre:[(a[0]+b[0])/2,(a[1]+b[1])/2],rotation:Math.atan2(uy,ux)/deg}};}
 const last=pts.at(-1);if(tool==='line'){const ang=direction(last,p,typed.ang,snap),len=typed.len??Math.hypot(p[0]-last[0],p[1]-last[1]),point=[last[0]+len*Math.cos(ang*deg),last[1]-len*Math.sin(ang*deg)];return {live:{len,ang},point,preview:[...pts,point]};}
 const all=[...pts,p];return {live:{},point:p,preview:all.length>2?splinePoints(all,12):all,closed:all.length>2};
}
// World outline of a sketched shape: its spec ring centred on `centre` and turned by `rotation` degrees.
export function placedRing({spec,centre,rotation}){const ring=specRing(spec),b=extent([[ring]]),cx=(b.minX+b.maxX)/2,cy=(b.minY+b.maxY)/2,c=Math.cos(rotation*deg),s=Math.sin(rotation*deg);return ring.map(([x,y])=>[(x-cx)*c-(y-cy)*s+centre[0],(x-cx)*s+(y-cy)*c+centre[1]]);}
// A tool whose posed bounding box is centred on `centre`.
export function sketchedTool({spec,centre,rotation},fields){const {shape,spec:local}=fromSpec(spec),t={id:uid(),x:0,y:0,rotation:((rotation%360)+360)%360,shape,spec:local,zones:[],...fields},b=extent(posed(t));t.x=centre[0]-b.maxX/2;t.y=centre[1]-b.maxY/2;return t;}
// Scale a tool in its own (unrotated) axes about its centre on the layout; regions and shape
// parameters scale with it.
export function scaleTool(t,sx,sy){const b0=extent(posed(t)),cx=(b0.minX+b0.maxX)/2,cy=(b0.minY+b0.maxY)/2,S=shape=>shape.map(poly=>poly.map(r=>r.map(([x,y])=>[x*sx,y*sy]))),out={...t,shape:S(t.shape),zones:t.zones.map(z=>({...z,shape:S(z.shape)}))};
 if(t.spec)out.spec=t.spec.points?{...t.spec,points:t.spec.points.map(([x,y])=>[x*sx,y*sy])}:{...t.spec,w:t.spec.w*sx,h:t.spec.h*sy,...(t.spec.r!==undefined?{r:t.spec.r*Math.min(sx,sy)}:{})};
 const b1=extent(posed({...out,x:0,y:0}));out.x=cx-b1.maxX/2;out.y=cy-b1.maxY/2;return out;}
// Mirror a tool across the screen's vertical ('x') or horizontal ('y') axis. Flipping its own axis and
// negating the rotation gives the same result at any rotation.
export function mirrorTool(t,axis){const b=extent(t.shape),k=axis==='x'?0:1,size=k?b.maxY:b.maxX,flipPoint=p=>{const q=[...p];q[k]=size-q[k];return q;},flip=shape=>shape.map(poly=>poly.map(r=>r.map(flipPoint).reverse()));
 return {...t,shape:flip(t.shape),zones:t.zones.map(z=>({...z,shape:flip(z.shape)})),...(t.spec?.points?{spec:{...t.spec,points:t.spec.points.map(flipPoint)}}:{}),rotation:(360-t.rotation)%360};}
