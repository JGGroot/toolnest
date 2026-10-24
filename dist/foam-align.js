import {extent,posed} from './foam-model.js?v=20261025-seg5';
// Layout helpers work on bounding boxes of posed tools. A "unit" is a set of tool
// indices that moves as one: a single tool, or every member of a locked group.
export function unitsFor(tools,indices){const units=new Map();for(const i of indices){const t=tools[i];if(!t)continue;const key=t.lock||'#'+t.id;if(!units.has(key))units.set(key,t.lock?tools.flatMap((o,k)=>o.lock===t.lock?[k]:[]):[i]);}return [...units.values()];}
export function boxOf(tools,indices){const boxes=indices.map(i=>extent(posed(tools[i])));return {minX:Math.min(...boxes.map(b=>b.minX)),minY:Math.min(...boxes.map(b=>b.minY)),maxX:Math.max(...boxes.map(b=>b.maxX)),maxY:Math.max(...boxes.map(b=>b.maxY))};}
// Align several units to their combined box, or a single unit to the frame (the usable foam area).
export function alignMoves(tools,units,mode,frame){const boxes=units.map(u=>boxOf(tools,u)),ref=units.length>1?{minX:Math.min(...boxes.map(b=>b.minX)),minY:Math.min(...boxes.map(b=>b.minY)),maxX:Math.max(...boxes.map(b=>b.maxX)),maxY:Math.max(...boxes.map(b=>b.maxY))}:frame;
 return units.map((indices,k)=>{const b=boxes[k];let dx=0,dy=0;if(mode==='left')dx=ref.minX-b.minX;else if(mode==='right')dx=ref.maxX-b.maxX;else if(mode==='hcenter')dx=(ref.minX+ref.maxX-b.minX-b.maxX)/2;else if(mode==='top')dy=ref.minY-b.minY;else if(mode==='bottom')dy=ref.maxY-b.maxY;else if(mode==='vcenter')dy=(ref.minY+ref.maxY-b.minY-b.maxY)/2;return {indices,dx,dy};});}
// Equal gaps between neighbouring units; the first and last stay put.
export function distributeMoves(tools,units,axis){const lo=axis==='x'?'minX':'minY',hi=axis==='x'?'maxX':'maxY',items=units.map(indices=>({indices,b:boxOf(tools,indices)})).sort((a,b)=>a.b[lo]-b.b[lo]);if(items.length<3)return [];const span=items.at(-1).b[hi]-items[0].b[lo],used=items.reduce((s,i)=>s+i.b[hi]-i.b[lo],0),gap=(span-used)/(items.length-1);let at=items[0].b[lo];return items.map(i=>{const d=at-i.b[lo];at+=i.b[hi]-i.b[lo]+gap;return {indices:i.indices,dx:axis==='x'?d:0,dy:axis==='x'?0:d};});}
export function applyMoves(tools,moves){for(const {indices,dx,dy} of moves)for(const i of indices){tools[i].x+=dx;tools[i].y+=dy;}}
// Guide targets for a drag: other tools' edges and centres, the tool-spacing distance
// beside them, and the foam's margin and centre lines.
export function snapTargets(tools,moving,foam){const targets=[],add=(axis,v,anchors,box,kind)=>targets.push({axis,v,anchors,box,kind}),frame={minX:0,minY:0,maxX:foam.width,maxY:foam.height};
 tools.forEach((t,i)=>{if(moving.has(i))return;const b=extent(posed(t));for(const [axis,lo,hi] of [['x','minX','maxX'],['y','minY','maxY']]){add(axis,b[lo],['min','max'],b,'edge');add(axis,b[hi],['min','max'],b,'edge');add(axis,(b[lo]+b[hi])/2,['mid'],b,'edge');if(foam.spacing>0){add(axis,b[hi]+foam.spacing,['min'],b,'gap');add(axis,b[lo]-foam.spacing,['max'],b,'gap');}}});
 add('x',foam.margin,['min'],frame,'foam');add('x',foam.width-foam.margin,['max'],frame,'foam');add('x',foam.width/2,['mid'],frame,'foam');add('y',foam.margin,['min'],frame,'foam');add('y',foam.height-foam.margin,['max'],frame,'foam');add('y',foam.height/2,['mid'],frame,'foam');return targets;}
const shifted=(b,dx,dy)=>({minX:b.minX+dx,minY:b.minY+dy,maxX:b.maxX+dx,maxY:b.maxY+dy});
// Snap a dragged box (its position before the drag plus dx, dy). Guides win over the grid
// within `threshold` mm; spacing guides only apply to neighbours beside the box.
export function snapDrag(box,dx,dy,targets,{threshold=2,grid=0,guides=true}={}){
 const snapAxis=(axis,d,other)=>{const lo=axis==='x'?'minX':'minY',hi=axis==='x'?'maxX':'maxY',olo=axis==='x'?'minY':'minX',ohi=axis==='x'?'maxY':'maxX',moved=axis==='x'?shifted(box,d,other):shifted(box,other,d),at={min:moved[lo],mid:(moved[lo]+moved[hi])/2,max:moved[hi]};let best=null;
  if(guides)for(const t of targets){if(t.axis!==axis||t.kind==='gap'&&(t.box[ohi]<moved[olo]||moved[ohi]<t.box[olo]))continue;for(const a of t.anchors){const delta=t.v-at[a];if(Math.abs(delta)<=threshold&&(!best||Math.abs(delta)<Math.abs(best)-1e-9))best=delta;}}
  if(best!==null)return d+best;if(grid>0){const v=box[lo]+d;return d+Math.round(v/grid)*grid-v;}return d;};
 const sx=snapAxis('x',dx,dy),sy=snapAxis('y',dy,sx),b=shifted(box,sx,sy),lines=[],seen=new Set();
 if(guides)for(const t of targets){const lo=t.axis==='x'?'minX':'minY',hi=t.axis==='x'?'maxX':'maxY',olo=t.axis==='x'?'minY':'minX',ohi=t.axis==='x'?'maxY':'maxX',at={min:b[lo],mid:(b[lo]+b[hi])/2,max:b[hi]};if(!t.anchors.some(a=>Math.abs(at[a]-t.v)<.01))continue;let line;
  if(t.kind==='gap'){if(t.box[ohi]<b[olo]||b[ohi]<t.box[olo])continue;const m=(Math.max(t.box[olo],b[olo])+Math.min(t.box[ohi],b[ohi]))/2,from=t.anchors[0]==='min'?t.box[hi]:t.box[lo];line=t.axis==='x'?[from,m,t.v,m]:[m,from,m,t.v];}
  else{const a=Math.min(t.box[olo],b[olo]),z=Math.max(t.box[ohi],b[ohi]);line=t.axis==='x'?[t.v,a,t.v,z]:[a,t.v,z,t.v];}
  const key=t.kind+line.map(n=>n.toFixed(2)).join();if(!seen.has(key)){seen.add(key);lines.push({kind:t.kind,line});}}
 return {dx:sx,dy:sy,guides:lines};
}
