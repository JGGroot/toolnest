import Clipper from './vendor/clipper.js';

// Integer boolean/offset operations at 0.00001 mm precision. Curve chords are
// bounded to 0.005 mm, independently of the photograph's cleanup settings.
const SCALE=100000,CHORD_ERROR=.005;
const encode=ring=>ring.map(([x,y])=>({X:Math.round(x*SCALE),Y:Math.round(y*SCALE)}));
function combine(subject,clip,type=Clipper.ClipType.ctUnion){
 const engine=new Clipper.Clipper(),out=[];
 engine.AddPaths(subject,Clipper.PolyType.ptSubject,true);
 if(clip)engine.AddPaths(clip,Clipper.PolyType.ptClip,true);
 engine.Execute(type,out,Clipper.PolyFillType.pftNonZero,Clipper.PolyFillType.pftNonZero);
 return out;
}
export function circleRing({x,y,r}){
 if(![x,y,r].every(Number.isFinite)||r<=0)throw Error('Invalid finger cutout.');
 const count=Math.max(32,Math.ceil(Math.PI/Math.acos(1-Math.min(CHORD_ERROR/r,1))));
 return Array.from({length:count},(_,i)=>{const angle=2*Math.PI*i/count;return [x+r*Math.cos(angle),y+r*Math.sin(angle)];});
}
let bodyCache=null;
export function vectorCutPaths(polys,fingers,[width,height],clearance){
 if(!polys.length)return [];
 const reusable=bodyCache&&bodyCache.clearance===clearance&&bodyCache.polys.length===polys.length&&bodyCache.polys.every((p,i)=>p===polys[i]);
 let paths;
 if(reusable)paths=bodyCache.paths;
 else{
  paths=combine(polys.map(p=>{const ring=encode(p);if(!Clipper.Clipper.Orientation(ring))ring.reverse();return ring;}));
  if(Math.abs(clearance)>1e-7){
   const offset=new Clipper.ClipperOffset(2,CHORD_ERROR*SCALE),out=[];
   offset.AddPaths(paths,Clipper.JoinType.jtRound,Clipper.EndType.etClosedPolygon);
   offset.Execute(out,clearance*SCALE);paths=out;
  }
  bodyCache={clearance,polys:polys.slice(),paths};
 }
 // Add circular grips AFTER refining and offsetting the body. Never simplify
 // the resulting circle or run a smoothing pass across its intersection joins.
 if(fingers.length)paths=combine(paths.concat(fingers.map(f=>encode(circleRing(f)))));
 paths=combine(paths,[encode([[0,0],[width,0],[width,height],[0,height]])],Clipper.ClipType.ctIntersection);
 // Tool pockets are silhouettes; enclosed holes in the photographed body do
 // not leave uncut islands. This matches the trace extractor's outer rings.
 return paths.filter(p=>Clipper.Clipper.Area(p)>4*SCALE*SCALE).map(p=>p.map(({X,Y})=>[X/SCALE,Y/SCALE])).sort((a,b)=>Math.abs(area(b))-Math.abs(area(a)));
}
function area(p){return p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-b[0]*a[1];},0)/2;}
