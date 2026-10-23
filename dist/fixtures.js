import {PAPERS,markerBits,markerCorners,homography,project} from './vision.js?v=20261023-desk2';
export const DEMO_TOOLS=[
[[48,54],[55,47],[64,45],[71,49],[62,55],[65,63],[74,64],[77,54],[81,62],[79,72],[69,80],[66,82],[67,178],[70,184],[69,193],[62,199],[54,196],[50,189],[52,181],[56,177],[55,82],[46,76],[42,66]],
[[104,64],[107,51],[114,46],[116,64],[122,77],[123,90],[139,174],[139,190],[133,193],[127,187],[117,119],[111,120],[106,185],[101,193],[95,191],[93,182],[105,92],[104,81],[96,66],[94,49],[101,52]],
[[151,58],[159,57],[162,65],[159,72],[159,131],[165,137],[168,145],[167,195],[162,204],[150,204],[145,197],[145,145],[148,137],[153,132],[153,72],[150,65]]
];
function contains(x,y,p){let c=false;for(let i=0,j=p.length-1;i<p.length;j=i++){if((p[i][1]>y)!==(p[j][1]>y)&&x<(p[j][0]-p[i][0])*(y-p[i][1])/(p[j][1]-p[i][1])+p[i][0])c=!c;}return c;}
export function makeFixture({paper='a4',width=840,height=1060,quad=[[105,45],[740,110],[785,975],[40,1010]],noise=0,missing=-1,shading=0,tools=DEMO_TOOLS}={}){const [pw,ph]=PAPERS[paper],H=homography([[0,0],[pw,0],[pw,ph],[0,ph]],quad),inv=homography(quad,[[0,0],[pw,0],[pw,ph],[0,ph]]),data=new Uint8ClampedArray(width*height*4),bits=[0,1,2,3].map(markerBits),corners=[0,1,2,3].map(id=>markerCorners(id,paper));let seed=42;for(let y=0;y<height;y++)for(let x=0;x<width;x++){const [u,v]=project(inv,[x,y]);let col=[192,187,177];if(u>=0&&v>=0&&u<pw&&v<ph){col=[249,248,244];let marker=false;for(let id=0;id<4;id++){const [mx,my]=corners[id][0];if(id!==missing&&u>=mx&&u<mx+20&&v>=my&&v<my+20){marker=true;col=bits[id][Math.floor((v-my)/2.5)][Math.floor((u-mx)/2.5)]?[20,22,21]:[249,248,244];}}if(!marker){for(let k=0;k<tools.length;k++)if(contains(u,v,tools[k])){const shine=Math.sin(u*1.3)*8;if(k===0)col=[89+shine,97+shine,98+shine];else if(k===1&&v>105)col=[42,65,61];else if(k===2&&v>135)col=[165+shine,66+shine,33+shine];else col=[62+shine,70+shine,70+shine];break;}}}
seed=(seed*1664525+1013904223)>>>0;const n=((seed/4294967296)-.5)*noise+shading*(x/width-.5);const i=(y*width+x)*4;for(let c=0;c<3;c++)data[i+c]=col[c]+n;data[i+3]=255;}return {width,height,data,H,quad,paper};}
export const TEST_CASES=[
{name:'Straight on',quad:[[100,50],[730,50],[730,941],[100,941]]},
{name:'Perspective · left',quad:[[200,80],[700,180],[790,990],[35,900]]},
{name:'Perspective · right',quad:[[70,170],[770,55],[660,1000],[180,940]]},
{name:'Rotated 90°',quad:[[760,220],[760,805],[50,805],[50,220]]},
{name:'Rotated 270°',quad:[[55,805],[55,220],[765,220],[765,805]]},
{name:'Rotated 180°',quad:[[750,990],[100,945],[65,90],[740,45]]},
{name:'Uneven light + noise',quad:[[130,80],[735,125],[775,985],[45,1000]],noise:24,shading:75},
{name:'Severe perspective',quad:[[270,160],[650,215],[790,970],[40,980]]},
{name:'Missing marker',quad:[[100,50],[730,50],[730,941],[100,941]],missing:2,expectReject:true}
];
export function evaluateCalibration(calibration,fixture){const [w,h]=PAPERS[fixture.paper];let sum=0,max=0,n=0;for(let y=40;y<h-35;y+=15)for(let x=35;x<w-30;x+=15){const p=project(calibration.inverse,project(fixture.H,[x,y])),e=Math.hypot(p[0]-x,p[1]-y);sum+=e*e;max=Math.max(max,e);n++;}return {rms:Math.sqrt(sum/n),max,n};}
