// Closed-curve refinement with a physical bound relative to the input contour.
export function cleanRing(poly){const out=[];for(const p of poly){if(!Array.isArray(p)||p.length!==2||!p.every(Number.isFinite))throw Error('Outline contains invalid coordinates.');if(!out.length||Math.hypot(p[0]-out.at(-1)[0],p[1]-out.at(-1)[1])>1e-7)out.push([...p]);}if(out.length>1&&Math.hypot(out[0][0]-out.at(-1)[0],out[0][1]-out.at(-1)[1])<1e-7)out.pop();if(out.length<3)throw Error('Outline has fewer than three distinct points.');return out;}
export function nearestOnRing(point,poly){let best=null,d2=Infinity;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((point[0]-a[0])*dx+(point[1]-a[1])*dy)/(dx*dx+dy*dy||1))),p=[a[0]+dx*t,a[1]+dy*t],d=(point[0]-p[0])**2+(point[1]-p[1])**2;if(d<d2){d2=d;best=p;}}return {point:best,distance:Math.sqrt(d2)};}
export function resampleClosed(poly,step=.35){const p=cleanRing(poly),lengths=p.map((a,i)=>Math.hypot(a[0]-p[(i+1)%p.length][0],a[1]-p[(i+1)%p.length][1])),total=lengths.reduce((a,b)=>a+b,0),count=Math.max(8,Math.min(4096,Math.ceil(total/step))),out=[];let edge=0,base=0;for(let i=0;i<count;i++){const d=i*total/count;while(edge<lengths.length-1&&base+lengths[edge]<d){base+=lengths[edge++];}const t=(d-base)/(lengths[edge]||1),a=p[edge],b=p[(edge+1)%p.length];out.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}return {points:out,step:total/count};}
const area=p=>p.reduce((a,v,i)=>a+v[0]*p[(i+1)%p.length][1]-p[(i+1)%p.length][0]*v[1],0)/2;
export function hasCrossings(poly){const cross=(a,b,c)=>(b[0]-a[0])*(c[1]-a[1])-(b[1]-a[1])*(c[0]-a[0]);for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];for(let j=i+2;j<poly.length;j++){if(i===0&&j===poly.length-1)continue;const c=poly[j],d=poly[(j+1)%poly.length];if(Math.max(a[0],b[0])<Math.min(c[0],d[0])||Math.max(c[0],d[0])<Math.min(a[0],b[0])||Math.max(a[1],b[1])<Math.min(c[1],d[1])||Math.max(c[1],d[1])<Math.min(a[1],b[1]))continue;if(cross(a,b,c)*cross(a,b,d)<-1e-12&&cross(c,d,a)*cross(c,d,b)<-1e-12)return true;}}return false;}
export function fairOutline(poly,{radius=.75,maxDeviation=.35,strength=2}={}){
 const original=cleanRing(poly);if(radius<=0||maxDeviation<=0||strength<=0)return original;
 const {points,step}=resampleClosed(original),total=points.length*step,sigma=Math.max(.1,Math.min(3,radius))*(.45+Math.min(5,strength)*.17),reach=Math.min(Math.floor(points.length/4),Math.ceil(sigma*2.5/(step||1))),limit=Math.max(.01,Math.min(1.5,maxDeviation));
 // Keep an anchor at every original vertex as well as uniformly sampled points.
 // Bounding each corresponding anchor's movement also bounds the segments between them.
 let distance=0;const anchors=original.map((p,i)=>{const a={p,d:distance};distance+=Math.hypot(p[0]-original[(i+1)%original.length][0],p[1]-original[(i+1)%original.length][1]);return a;});points.forEach((p,i)=>anchors.push({p,d:i*step}));anchors.sort((a,b)=>a.d-b.d);const distinct=anchors.filter((a,i)=>!i||a.d-anchors[i-1].d>1e-7);
 const output=distinct.map(({p,d})=>{let x=0,y=0,sum=0;const center=Math.round(d/step);for(let j=-reach;j<=reach;j++){const at=center+j,delta=at*step-d,q=points[((at%points.length)+points.length)%points.length],w=Math.exp(-delta*delta/(2*sigma*sigma));x+=q[0]*w;y+=q[1]*w;sum+=w;}const q=[x/sum,y/sum],dx=q[0]-p[0],dy=q[1]-p[1],length=Math.hypot(dx,dy),factor=length>limit?limit/length:1;return [p[0]+dx*factor,p[1]+dy*factor];});
 if(Math.sign(area(original))!==Math.sign(area(output))||Math.abs(area(output))<.1||hasCrossings(output))return original;const ring=cleanRing(output),reduced=ring.filter((b,i)=>{const a=ring[(i+ring.length-1)%ring.length],c=ring[(i+1)%ring.length],cross=(b[0]-a[0])*(c[1]-b[1])-(b[1]-a[1])*(c[0]-b[0]),dot=(b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1]);return Math.abs(cross)>1e-10||dot<0;});return reduced.length>=3?reduced:ring;
}

// Tangent quadratic corner arcs with an explicit chord-error bound. Long
// straight edges stay straight; unlike low-pass Chaikin polygons, rounded
// corners do not depend on how many vertices happened to be extracted.
export function roundCorners(poly,radius=1,tolerance=.005){
 const ring=cleanRing(poly),out=[];
 for(let i=0;i<ring.length;i++){
  const a=ring[(i+ring.length-1)%ring.length],b=ring[i],c=ring[(i+1)%ring.length],la=Math.hypot(a[0]-b[0],a[1]-b[1]),lc=Math.hypot(c[0]-b[0],c[1]-b[1]);
  const trim=Math.min(radius,la*.45,lc*.45),u=[b[0]+(a[0]-b[0])*trim/la,b[1]+(a[1]-b[1])*trim/la],v=[b[0]+(c[0]-b[0])*trim/lc,b[1]+(c[1]-b[1])*trim/lc];
  const bend=Math.hypot(u[0]-2*b[0]+v[0],u[1]-2*b[1]+v[1]);
  if(bend<1e-8){out.push(b);continue;}
  const steps=Math.max(2,Math.ceil(Math.sqrt(bend/(4*tolerance))));
  for(let j=0;j<=steps;j++){const t=j/steps,q=1-t;out.push([q*q*u[0]+2*q*t*b[0]+t*t*v[0],q*q*u[1]+2*q*t*b[1]+t*t*v[1]]);}
 }
 const result=cleanRing(out);return hasCrossings(result)?ring:result;
}
