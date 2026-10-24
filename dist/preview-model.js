import {extract,makeCutPaths,bounds} from './vision.js?v=20261025-fpk3';
export const DEFAULT_SETTINGS={clearance:-1,smoothing:1,smoothingMode:'fair',curveRadius:.75,maxDeviation:.35,simplification:.18,threshold:160,brightnessThreshold:160,traceMethod:'edges',weakRatio:.4,gapMm:1,minToolArea:20};
export function traceKey(s){return JSON.stringify([s.paper,s.traceMethod,s.traceMethod==='dark'?s.brightnessThreshold:s.threshold,s.weakRatio,s.gapMm,s.minToolArea]);}
export function traceOptions(s){return {weakRatio:s.weakRatio,gapMm:s.gapMm};}
function center(poly){const b=bounds(poly);return [(b.minX+b.maxX)/2,(b.minY+b.maxY)/2];}
function nearest(p,poly){let best=null,distance=Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1))),q=[a[0]+t*dx,a[1]+t*dy],d=Math.hypot(p[0]-q[0],p[1]-q[1]);if(d<distance){distance=d;best=q;}}return {point:best,distance};}
export function computePreview(s,image,retrace=false){
 let tools=s.tools,fingers=s.fingers,selected=s.selected,toolMap=null;
 const warnings=[];
 if(retrace&&image&&s.traceMethod!=='tap'){
  const paths=extract(image,s.paper,s.traceMethod==='dark'?s.brightnessThreshold:s.threshold,s.minToolArea,s.traceMethod,traceOptions(s)),usedOld=new Set(),usedNew=new Set(),mapping=new Map(),pairs=[];
  paths.forEach((points,i)=>{const c=center(points),b=bounds(points);s.tools.forEach((t,j)=>{const p=center(t.points),old=bounds(t.points),d=Math.hypot(p[0]-c[0],p[1]-c[1]),limit=Math.max(12,Math.hypot(old.maxX-old.minX,old.maxY-old.minY)*.35);if(d<limit)pairs.push({i,j,d});});});
  for(const {i,j} of pairs.sort((a,b)=>a.d-b.d)){if(usedOld.has(j)||usedNew.has(i))continue;mapping.set(j,i);usedOld.add(j);usedNew.add(i);}
  const reverse=new Map([...mapping].map(([a,b])=>[b,a]));tools=paths.map((points,i)=>({points,name:reverse.has(i)?s.tools[reverse.get(i)].name:`Tool ${i+1}`}));
  fingers=s.fingers.filter(f=>mapping.has(f.tool)).map(f=>{const tool=mapping.get(f.tool),n=nearest([f.x,f.y],tools[tool].points);return {...f,tool,...(n.distance>f.r-1?{x:n.point[0],y:n.point[1]}:{})};});
  if(fingers.length<s.fingers.length)warnings.push(`${s.fingers.length-fingers.length} grip(s) removed because their tool was not found.`);
  toolMap=[...mapping];selected=mapping.get(s.selected)??Math.min(Math.max(0,selected),Math.max(0,tools.length-1));
 }
 const paths=tools.length?makeCutPaths(tools.map(t=>t.points),fingers,s.paper,s.clearance,s.smoothing,{mode:s.smoothingMode,simplification:s.simplification,radius:s.curveRadius,maxDeviation:s.maxDeviation}):[];
 return {tools,fingers,selected,toolMap,paths,warnings,traceKey:traceKey(s)};
}
