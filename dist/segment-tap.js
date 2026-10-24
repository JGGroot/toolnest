import {pointToImage,imageToPoint,pickCandidate,zoomWindow,proposalBox,nudgeInside} from './segment-model.js?v=20261025-tch1';
// Two passes per tap. The model first sees the whole rectified photo (downscaled) to find which object
// was tapped; it then sees just that object, cropped from the full-resolution photo, so the mask is
// sharper and the model is not tempted to answer "the sheet".
// Only small crops (at most 1024 px) are sent to the model worker.
const views=new WeakMap();
function canvasOf(rect){let c=views.get(rect);if(!c){c=new OffscreenCanvas(rect.width,rect.height);const data=new Uint8ClampedArray(rect.data);for(let i=3;i<data.length;i+=4)if(!data[i]){data[i-3]=data[i-2]=data[i-1]=255;data[i]=255;}c.getContext('2d').putImageData(new ImageData(data,rect.width,rect.height),0,0);views.set(rect,c);}return c;}
const crops=new WeakMap();
function crop(rect,[x,y,w,h],size=1024){const key=`${x},${y},${w},${h}`;let cache=crops.get(rect);if(!cache)crops.set(rect,cache=new Map());if(cache.has(key))return cache.get(key);const k=Math.min(1,size/Math.max(w,h)),c=new OffscreenCanvas(Math.max(2,Math.round(w*k)),Math.max(2,Math.round(h*k))),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(canvasOf(rect),x,y,w,h,0,0,c.width,c.height);const view={image:ctx.getImageData(0,0,c.width,c.height),x,y,w,h};cache.set(key,view);return view;}
export async function segmentTap(segmenter,rect,points){let taps=points.map(p=>{const [x,y]=pointToImage(p,rect);return {x,y,label:p.label};});const positive=taps.filter(p=>p.label===1),s=rect.scale;let anchor=positive.at(-1)||positive[0];
 const ask=async(view,box)=>{const inside=taps.filter(p=>p.x>=view.x&&p.y>=view.y&&p.x<view.x+view.w&&p.y<view.y+view.h).map(p=>({x:(p.x-view.x)/view.w,y:(p.y-view.y)/view.h,label:p.label})),r=await segmenter.segment(view.image,inside,box);return r;};
 const at=(view,r)=>[(anchor.x-view.x)/view.w*r.width,(anchor.y-view.y)/view.h*r.height];
 // Pass 1: which object? The classical trace's outline under the tap answers this best; without one the
 // model looks at the whole photo.
 const anchorMm=points.filter(p=>p.label===1).at(-1),proposal=proposalBox(rect,anchorMm),whole=crop(rect,[0,0,rect.width,rect.height]),first=proposal?null:await ask(whole),coarse=first&&pickCandidate(first.candidates,first.width,first.height,at(whole,first),{maxShare:.3});
 // A lone tap on or just off a tool's edge (easy with a finger) would ask the model for the paper or the
 // shadow: move it at least 3 mm inside the outline it is next to.
 let prompts=points;if(proposal&&taps.length===1){anchor=nudgeInside(proposal.outline,anchor,3*s);taps=[anchor];prompts=[{...imageToPoint([anchor.x,anchor.y],rect),label:1}];}
 let box=proposal||(coarse?[coarse.box[0]/first.width*rect.width,coarse.box[1]/first.height*rect.height,coarse.box[2]/first.width*rect.width,coarse.box[3]/first.height*rect.height]:[anchor.x-60*s,anchor.y-60*s,anchor.x+60*s,anchor.y+60*s]);const known=!!(proposal||coarse);
 for(const p of positive)box=[Math.min(box[0],p.x-5*s),Math.min(box[1],p.y-5*s),Math.max(box[2],p.x+5*s),Math.max(box[3],p.y+5*s)];
 // Pass 2: zoom in, growing the window if the tool runs off its edge.
 let win=zoomWindow(box,rect),result=null;
 for(let attempt=0;attempt<3;attempt++){const view=crop(rect,win),hint=known?[(box[0]-view.x)/view.w,(box[1]-view.y)/view.h,(box[2]-view.x)/view.w,(box[3]-view.y)/view.h]:null,r=await ask(view,null),prefer=hint&&[hint[0]*r.width,hint[1]*r.height,hint[2]*r.width,hint[3]*r.height],outline=proposal?.outline?.map(([x,y])=>[(x-view.x)/view.w*r.width,(y-view.y)/view.h*r.height]),pick=pickCandidate(r.candidates,r.width,r.height,at(view,r),{prefer,outline});
  if(pick)result={pick,r,view};const whole=win[2]>=rect.width&&win[3]>=rect.height;if(!pick||pick.edges===0||whole)break;const b=pick.box,grow=[view.x+b[0]/r.width*view.w,view.y+b[1]/r.height*view.h,view.x+b[2]/r.width*view.w,view.y+b[3]/r.height*view.h];win=zoomWindow(grow,rect,{margin:.4});}
 if(!result&&coarse)result={pick:coarse,r:first,view:whole};if(!result)return {mask:new Uint8Array(rect.width*rect.height),width:rect.width,height:rect.height,timing:first?.timing,view:null};
 // The chosen region, placed back into the full rectified image.
 const {pick,r,view}=result,full=new Uint8Array(rect.width*rect.height);for(let y=0;y<view.h;y++){const my=Math.min(r.height-1,Math.floor((y+.5)/view.h*r.height));for(let x=0;x<view.w;x++){if(pick.mask[my*r.width+Math.min(r.width-1,Math.floor((x+.5)/view.w*r.width))])full[(view.y+y)*rect.width+view.x+x]=1;}}
 return {mask:full,width:rect.width,height:rect.height,timing:r.timing,prompts,bound:proposal&&points.length===1?proposal.outline:null,view:{taps:taps.map(p=>[p.x,p.y,p.label]),window:[view.x,view.y,view.w,view.h],mask:pick.mask,width:r.width,height:r.height,source:proposal?'outline':coarse?'model':'window'}};}
