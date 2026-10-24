import {PAPERS,markerBits,markerCorners} from './vision.js?v=20261024-scan2';
import {TARGET,targetCorners} from './foam-scan.js?v=20261024-scan2';
const NS='http://www.w3.org/2000/svg';
const paperName=paper=>paper==='letter'?'US Letter':'A4';
function page(paper){if(!PAPERS[paper])throw Error('Unsupported paper size');return PAPERS[paper];}
export function calibrationSVG(paper){const [w,h]=page(paper);let markers='';for(let id=0;id<4;id++){const [x,y]=markerCorners(id,paper)[0];markers+=`<rect x="${x-1.5}" y="${y-1.5}" width="23" height="23" fill="white"/>`;markerBits(id).forEach((row,j)=>row.forEach((v,i)=>{if(v)markers+=`<rect x="${x+i*2.5}" y="${y+j*2.5}" width="2.5" height="2.5" fill="black"/>`;}));}
return `<svg xmlns="${NS}" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="white"/>${markers}<rect x="33" y="33" width="${w-66}" height="${h-66}" rx="2" fill="none" stroke="#bbb" stroke-width=".18" stroke-dasharray="1.5 2"/><g font-family="Arial, sans-serif" fill="#666" text-anchor="middle"><text x="${w/2}" y="17" font-size="3.5" font-weight="bold">TOOLNEST / ${paperName(paper).toUpperCase()}</text><text x="${w/2}" y="23" font-size="2.4">Matching paper · 100% / Actual size · No fit to page</text><text x="${w/2}" y="${h-19}" font-size="2.3">Place tools inside the dotted area. Keep all four codes clear.</text><text x="${w/2}" y="${h-8}" font-size="2.3">Check this line measures exactly 50 mm before photographing.</text></g><path d="M${w/2-25} ${h-14}h50m-50 -1.5v3m50 -3v3" fill="none" stroke="#333" stroke-width=".2"/></svg>`;
}
// A one-page vector PDF has an explicit physical page box, independent of the
// browser's CSS layout, zoom, viewport, font loading, and pagination rules.
export function calibrationPDF(paper){
 const [w,h]=page(paper),pt=72/25.4,n=v=>(v*pt).toFixed(5),ops=[];
 function rect(x,y,width,height){ops.push(`${n(x)} ${n(h-y-height)} ${n(width)} ${n(height)} re f`);}
 function text(value,x,y,mmSize){const safe=value.replace(/[\\()]/g,'\\$&');const estimatedWidth=value.length*mmSize*.51;ops.push(`BT /F1 ${n(mmSize)} Tf ${n(x-estimatedWidth/2)} ${n(h-y)} Td (${safe}) Tj ET`);}
 ops.push('0 g');for(let id=0;id<4;id++){const [x,y]=markerCorners(id,paper)[0];markerBits(id).forEach((row,j)=>row.forEach((v,i)=>{if(v)rect(x+i*2.5,y+j*2.5,2.5,2.5);}));}
 ops.push(`0.72 G ${n(.18)} w [${n(1.5)} ${n(2)}] 0 d ${n(33)} ${n(33)} ${n(w-66)} ${n(h-66)} re S [] 0 d 0.3 g`);
 text(`TOOLNEST / ${paperName(paper).toUpperCase()}`,w/2,17,3.5);text('Matching paper | 100% / Actual size | No fit to page',w/2,23,2.4);text('Place tools inside the dotted area. Keep all four codes clear.',w/2,h-19,2.3);text('Check this line measures exactly 50 mm before photographing.',w/2,h-8,2.3);
 ops.push(`0.2 G ${n(.2)} w ${n(w/2-25)} ${n(14)} m ${n(w/2+25)} ${n(14)} l ${n(w/2-25)} ${n(12.5)} m ${n(w/2-25)} ${n(15.5)} l ${n(w/2+25)} ${n(12.5)} m ${n(w/2+25)} ${n(15.5)} l S`);
 return pdfFile(w,h,ops);
}
function pdfFile(w,h,ops){const pt=72/25.4,n=v=>(v*pt).toFixed(5),content=ops.join('\n')+'\n',objects=[
 '<< /Type /Catalog /Pages 2 0 R /ViewerPreferences << /PrintScaling /None >> >>',
 '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
 `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${n(w)} ${n(h)}] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>`,
 '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
 `<< /Length ${content.length} >>\nstream\n${content}endstream`
 ];let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${o}\nendobj\n`;});const xref=pdf.length;pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;return new TextEncoder().encode(pdf);
}

// Scale target: two 80 × 50 mm cards with the coded squares in their corners (cut either out). Laid on
// the foam or a scanner glass, it gives the photo's scale; see foam-scan.js.
export function targetPDF(paper='a4'){const [w,h]=page(paper),pt=72/25.4,n=v=>(v*pt).toFixed(5),ops=[],{width:cw,height:ch,size}=TARGET,cell=size/8;
 function rect(x,y,width,height){ops.push(`${n(x)} ${n(h-y-height)} ${n(width)} ${n(height)} re f`);}
 function text(value,x,y,mm){const estimated=value.length*mm*.51;ops.push(`BT /F1 ${n(mm)} Tf ${n(x-estimated/2)} ${n(h-y)} Td (${value.replace(/[\\()]/g,'\\$&')}) Tj ET`);}
 text('TOOLNEST / SCALE TARGET',w/2,22,3.5);text('Print at 100% / Actual size. Check the line measures 50 mm, then cut out a card.',w/2,29,2.4);
 for(const top of [45,45+ch+20]){const left=w/2-cw/2;ops.push(`0.6 G ${n(.2)} w [${n(1.2)} ${n(1.5)}] 0 d ${n(left)} ${n(h-top-ch)} ${n(cw)} ${n(ch)} re S [] 0 d 0 g`);for(let id=0;id<4;id++){const [[x,y]]=targetCorners(id);markerBits(id).forEach((row,j)=>row.forEach((v,i)=>{if(v)rect(left+x+i*cell,top+y+j*cell,cell,cell);}));}ops.push('0.35 g');text('TOOLNEST SCALE',w/2,top+ch/2+1,2.6);ops.push('0 g');}
 const lineY=45+2*ch+40;ops.push(`0.2 G ${n(.25)} w ${n(w/2-25)} ${n(h-lineY)} m ${n(w/2+25)} ${n(h-lineY)} l ${n(w/2-25)} ${n(h-lineY-1.5)} m ${n(w/2-25)} ${n(h-lineY+1.5)} l ${n(w/2+25)} ${n(h-lineY-1.5)} m ${n(w/2+25)} ${n(h-lineY+1.5)} l S 0.3 g`);text('50 mm',w/2,lineY+5,2.4);
 text('Lay a card flat on the foam surface (or on the scanner glass beside the foam) with all four squares visible.',w/2,lineY+16,2.3);text('Toolnest finds it automatically and measures the foam from the corners you tap.',w/2,lineY+22,2.3);
 return pdfFile(w,h,ops);}
export function calibrationPrintHTML(paper){const [w,h]=page(paper);return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Toolnest ${paperName(paper)} calibration</title><style>@page{size:${w}mm ${h}mm;margin:0}*{box-sizing:border-box}html,body{margin:0!important;padding:0!important;border:0!important;width:100%;height:100%;overflow:hidden;font-size:0;line-height:0;background:white}svg{display:block;position:fixed;top:0;left:0;width:${w}mm!important;height:${h}mm!important;max-width:none!important;max-height:none!important;break-inside:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact}</style></head><body>${calibrationSVG(paper)}</body></html>`;}
