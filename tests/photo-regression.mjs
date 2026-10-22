// Private photograph remains outside the project and is never bundled or published.
// TOOLNEST_PHOTO=/absolute/path/photo.jpg node tests/photo-regression.mjs
import assert from 'node:assert/strict';import {writeFileSync} from 'node:fs';
import sharp from '/opt/codex/cua_node/lib/node_modules/sharp/dist/index.mjs';
import {autoCalibrate,warp,PAPERS,extract,bounds,polygonArea,pathD} from '../dist/vision.js';
if(!process.env.TOOLNEST_PHOTO)throw Error('Set TOOLNEST_PHOTO to the local test image.');
function contains([x,y],poly){let c=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++){const a=poly[i],b=poly[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])c=!c;}return c;}
for(const brightness of [0,15,-15]){
 let input=sharp(process.env.TOOLNEST_PHOTO).rotate().ensureAlpha();if(brightness)input=input.linear(1,brightness);const {data,info}=await input.raw().toBuffer({resolveWithObject:true}),image={data,width:info.width,height:info.height},cal=autoCalibrate(image,'a4');assert.equal(cal.paper,'letter');assert.equal(cal.markers.length,4);assert.ok(cal.rms<.45);const rect=warp(image,cal.H,...PAPERS.letter),paths=extract(rect,'letter');assert.equal(paths.length,1);const b=bounds(paths[0]);assert.ok(b.minY>40&&b.minY<50);assert.ok(b.maxY>220&&b.maxY<235);assert.ok(b.minX>62&&b.maxX<145);assert.ok(polygonArea(paths[0])>7500&&polygonArea(paths[0])<10000);
 for(const p of [[77,210],[128,183],[107,160],[83,117]])assert.equal(paths.some(poly=>contains(p,poly)),true,`Tool point lost: ${p}`);
 for(const p of [[110,35],[70,35],[150,130]])assert.equal(paths.some(poly=>contains(p,poly)),false,`Shadow/background included: ${p}`);
 console.log(`Photo brightness ${brightness}: Letter auto-detected, RMS ${cal.rms.toFixed(3)} mm; one tool, shadow rejected.`);
 if(!brightness){const [w,h]=PAPERS.letter,svg=`<svg xmlns="http://www.w3.org/2000/svg" width="${rect.width}" height="${rect.height}" viewBox="0 0 ${w} ${h}"><g fill="#e85f2020" stroke="#e85f20" stroke-width=".6">${paths.map(p=>`<path d="${pathD(p)}"/>`).join('')}</g></svg>`;await sharp(rect.data,{raw:{width:rect.width,height:rect.height,channels:4}}).composite([{input:Buffer.from(svg)}]).png().toFile('/tmp/toolnest-photo-review.png');writeFileSync('/tmp/toolnest-photo-result.json',JSON.stringify({paper:cal.paper,rms:cal.rms,paths},null,2));}
}
