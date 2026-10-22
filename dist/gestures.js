// CSS-pixel viewport transforms; geometry stays in millimetres.
export const limitZoom=z=>Math.max(.75,Math.min(4,z));
export function pinchTransform(start,current,zoom,pan,center){
 const midpoint=p=>({x:(p[0].x+p[1].x)/2,y:(p[0].y+p[1].y)/2});
 const distance=p=>Math.hypot(p[1].x-p[0].x,p[1].y-p[0].y);
 const from=midpoint(start),to=midpoint(current),next=limitZoom(zoom*distance(current)/Math.max(1,distance(start))),ratio=next/zoom;
 return {zoom:next,pan:{x:to.x-center.x-(from.x-center.x-pan.x)*ratio,y:to.y-center.y-(from.y-center.y-pan.y)*ratio}};
}
export function boundedPan(pan,zoom,sheet,canvas){
 if(zoom<=1)return {x:0,y:0};
 const maxX=Math.max(0,(sheet.width*zoom-canvas.width)/2+80),maxY=Math.max(0,(sheet.height*zoom-canvas.height)/2+80);
 return {x:Math.max(-maxX,Math.min(maxX,pan.x)),y:Math.max(-maxY,Math.min(maxY,pan.y))};
}
