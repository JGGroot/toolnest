"""Measure PDF page boxes and actual vector paths; rasterize for CV checks."""
from pathlib import Path
import fitz,json
results=[]
for paper,dimensions in [('a4',(210,297)),('letter',(215.9,279.4))]:
 for name in [f'print-{paper}.pdf',f'print-browser-{paper}-desktop.pdf',f'print-browser-{paper}-phone.pdf',f'print-app-{paper}-phone.pdf']:
  doc=fitz.open(Path('tests')/name)
  assert len(doc)==1,(name,len(doc))
  page=doc[0];w,h=dimensions
  assert abs(page.rect.width*25.4/72-w)<.15,(name,page.rect)
  assert abs(page.rect.height*25.4/72-h)<.15,(name,page.rect)
  drawings=page.get_drawings()
  # Collect solid black marker modules. Their union must give four 20 mm squares.
  expected=[(8,8),(w-28,8),(8,h-28),(w-28,h-28)]
  groups=[[] for _ in expected]
  for d in drawings:
   if not d['fill'] or max(d['fill'])>.2:continue
   for item in d['items']:
    if item[0]!='re':continue
    r=item[1];x,y=r.x0*25.4/72,r.y0*25.4/72
    if not (2.3<r.width*25.4/72<2.7 and 2.3<r.height*25.4/72<2.7):continue
    for i,(ex,ey) in enumerate(expected):
     if ex-.2<=x<ex+20 and ey-.2<=y<ey+20:groups[i].append(r)
  for i,modules in enumerate(groups):
   assert modules,(name,i)
   box=fitz.Rect(modules[0])
   for r in modules[1:]:box|=r
   ex,ey=expected[i]
   assert abs(box.width*25.4/72-20)<.15,(name,i,box)
   assert abs(box.height*25.4/72-20)<.15,(name,i,box)
   assert abs(box.x0*25.4/72-ex)<.15,(name,i,box)
   assert abs(box.y0*25.4/72-ey)<.15,(name,i,box)
  reference=[]
  for d in drawings:
   for item in d['items']:
    if item[0]=='l':
     p,q=item[1:]
     if abs(p.y-q.y)<.01 and abs(abs(p.x-q.x)*25.4/72-50)<.15:reference.append(abs(p.x-q.x)*25.4/72)
  assert reference,(name,'No 50 mm reference line')
  pix=page.get_pixmap(matrix=fitz.Matrix(2,2),alpha=False);pix.save(Path('tests')/name.replace('.pdf','.png'))
  results.append({'file':name,'pages':len(doc),'page_mm':[page.rect.width*25.4/72,page.rect.height*25.4/72],'reference_mm':reference[0],'markers':4})
for name in ['print-download.pdf','print-modal-download.pdf','print-letter-download.pdf']:assert len(fitz.open(Path('tests')/name))==1
Path('tests/print-report.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
