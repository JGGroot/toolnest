// Compact edge-based silhouette extraction. Slow illumination changes do not
// define foreground; closed, connected object edges do. All work stays local.
export function edgeSilhouette(image,roi,sensitivity=160,options={}){
 const {width:w,height:h,data}=image,n=w*h,g=new Float32Array(n),tmp=new Float32Array(n),blur=new Float32Array(n),kernel=[.0625,.25,.375,.25,.0625];
 for(let i=0;i<n;i++)g[i]=data[i*4]*.299+data[i*4+1]*.587+data[i*4+2]*.114;
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let k=-2;k<=2;k++)v+=g[y*w+Math.max(0,Math.min(w-1,x+k))]*kernel[k+2];tmp[y*w+x]=v;}
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){let v=0;for(let k=-2;k<=2;k++)v+=tmp[Math.max(0,Math.min(h-1,y+k))*w+x]*kernel[k+2];blur[y*w+x]=v;}
 const mag=new Float32Array(n),direction=new Uint8Array(n),high=Math.max(12,50+(160-sensitivity)*.6),low=high*Math.max(.1,Math.min(.85,options.weakRatio??.4));
 for(let y=roi.top+1;y<roi.bottom-1;y++)for(let x=roi.left+1;x<roi.right-1;x++){const p=y*w+x,dx=blur[p-w+1]+2*blur[p+1]+blur[p+w+1]-blur[p-w-1]-2*blur[p-1]-blur[p+w-1],dy=blur[p+w-1]+2*blur[p+w]+blur[p+w+1]-blur[p-w-1]-2*blur[p-w]-blur[p-w+1],ax=Math.abs(dx),ay=Math.abs(dy);mag[p]=ax+ay;direction[p]=ay<ax*.4142?0:ay>ax*2.4142?2:dx*dy>0?1:3;}
 const edge=new Uint8Array(n),weak=new Uint8Array(n),queue=new Int32Array(n);let head=0,tail=0;
 for(let y=roi.top+2;y<roi.bottom-2;y++)for(let x=roi.left+2;x<roi.right-2;x++){const p=y*w+x,m=mag[p],d=direction[p],offset=d===0?1:d===1?w+1:d===2?w:w-1;if(m<low||m<mag[p-offset]||m<=mag[p+offset])continue;weak[p]=1;if(m>=high){edge[p]=1;queue[tail++]=p;}}
 while(head<tail){const p=queue[head++];for(const d of [-w-1,-w,-w+1,-1,1,w-1,w,w+1]){const q=p+d;if(q>=0&&q<n&&weak[q]&&!edge[q]){edge[q]=1;queue[tail++]=q;}}}
 const radius=Math.max(0,Math.round((options.gapMm??1)*(options.pixelsPerMm??3))),closed=morph(morph(edge,w,h,radius,true),w,h,radius,false),outside=new Uint8Array(n);head=0;tail=1;queue[0]=0;outside[0]=1;
 while(head<tail){const p=queue[head++],x=p%w;for(const d of [-1,1,-w,w]){if(d===-1&&x===0||d===1&&x===w-1)continue;const q=p+d;if(q>=0&&q<n&&!closed[q]&&!outside[q]){outside[q]=1;queue[tail++]=q;}}}
 const mask=new Uint8Array(n);for(let y=roi.top+3;y<roi.bottom-3;y++)for(let x=roi.left+3;x<roi.right-3;x++){const p=y*w+x;mask[p]=!outside[p]?1:0;}
 // Remove thin edge fragments and shadow branches while preserving narrow tool features.
 const opened=morph(morph(mask,w,h,1,false),w,h,1,true);
 return opened;
}
function morph(mask,w,h,r,dilate){const stride=w+1,integral=new Int32Array((w+1)*(h+1)),out=new Uint8Array(w*h);for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=mask[y*w+x];integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;}}
 for(let y=r;y<h-r;y++)for(let x=r;x<w-r;x++){const l=x-r,t=y-r,b=y+r+1,right=x+r+1,count=integral[b*stride+right]-integral[t*stride+right]-integral[b*stride+l]+integral[t*stride+l];out[y*w+x]=dilate?(count>0?1:0):(count===(2*r+1)**2?1:0);}return out;
}
