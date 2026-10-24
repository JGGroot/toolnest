import {contours,refinePaths,PAPERS,polygonArea} from './vision.js?v=20261024-seg1';
export function pointToImage(p,rect){const s=rect.scale||rect.width/PAPERS[rect.paper||'a4'][0],[ox,oy]=rect.origin||[0,0];return [(p.x-ox)*s,(p.y-oy)*s];}
export function imageToPoint(p,rect){const s=rect.scale||rect.width/PAPERS[rect.paper||'a4'][0],[ox,oy]=rect.origin||[0,0];return {x:p[0]/s+ox,y:p[1]/s+oy};}
export function normalizedPrompts(points,rect){return points.map(p=>{const [x,y]=pointToImage(p,rect);if(x<0||y<0||x>=rect.width||y>=rect.height)throw Error('Tap inside the photographed area.');return {x:x/rect.width,y:y/rect.height,label:p.label};});}
export function insidePath(p,poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>p.y)!==(b[1]>p.y)&&p.x<(b[0]-a[0])*(p.y-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
export function promptTarget(tools,p,selected,negative=false){if(negative)return tools[selected]?.tap?selected:-1;return tools.findIndex(t=>t.tap&&insidePath(p,t.points));}
export function validPrompts(tap){return tap&&['mediapipe','sam'].includes(tap.engine)&&Array.isArray(tap.points)&&tap.points.length>0&&tap.points.length<=64&&tap.points.some(p=>p.label===1)&&tap.points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&Math.abs(p.x)<=3000&&Math.abs(p.y)<=3000&&(p.label===0||p.label===1));}
export function bestMask(scores){let best=0;for(let i=1;i<scores.length;i++)if(Number.isFinite(scores[i])&&(!Number.isFinite(scores[best])||scores[i]>scores[best]))best=i;return best;}
// Nearest-neighbour resampling preserves a binary region; snapping uses the original photo.
export function maskToPaths(result,rect,paper='a4',options={}){const {mask,width,height}=result;if(!Number.isInteger(width)||!Number.isInteger(height)||width<2||height<2||width*height!==mask?.length||width*height>5e6)throw Error('Invalid segmentation mask.');const w=rect.width,h=rect.height,s=rect.scale||w/PAPERS[paper][0],[ox,oy]=rect.origin||[0,0],full=new Uint8Array(w*h);
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=y*w+x;full[i]=rect.data[i*4+3]&&mask[Math.min(height-1,Math.floor((y+.5)*height/h))*width+Math.min(width-1,Math.floor((x+.5)*width/w))]>.5?1:0;}
 const paths=contours(full,w,h,s,options.minArea??20).filter(p=>!p.some(([x,y])=>x*s<2||y*s<2||x*s>w-2||y*s>h-2));
 return refinePaths(paths,rect,s,options).map(p=>p.map(([x,y])=>[x+ox,y+oy])).filter(p=>!options.points||options.points.filter(q=>q.label===1).some(q=>insidePath(q,p))).sort((a,b)=>polygonArea(b)-polygonArea(a));}
