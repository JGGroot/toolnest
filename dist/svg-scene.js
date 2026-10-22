const NS='http://www.w3.org/2000/svg';

// Retain SVG elements across selection, inspector and preview updates. Direct
// drag transforms are reconciled against actual attributes on the next render.
export class SVGScene{
 constructor(root){this.root=root;this.entries=new WeakMap();}
 render(specs,parent=this.root){
  const previous=this.entries.get(parent)||new Map(),next=new Map();let cursor=parent.firstChild;
  for(const spec of specs){
   let entry=previous.get(spec.key);
   if(!entry||entry.tag!==spec.tag){entry={tag:spec.tag,node:document.createElementNS(NS,spec.tag)};}
   const node=entry.node,attrs=spec.attrs||{};
   for(const name of node.getAttributeNames())if(!(name in attrs))node.removeAttribute(name);
   for(const [name,value] of Object.entries(attrs))if(node.getAttribute(name)!==String(value))node.setAttribute(name,value);
   if(spec.children)this.render(spec.children,node);
   else if(spec.html!==undefined){if(entry.html!==spec.html){node.innerHTML=spec.html;entry.html=spec.html;}}
   else if(spec.text!==undefined&&node.textContent!==String(spec.text))node.textContent=spec.text;
   if(node!==cursor)parent.insertBefore(node,cursor);cursor=node.nextSibling;next.set(spec.key,entry);
  }
  while(cursor){const following=cursor.nextSibling;cursor.remove();cursor=following;}
  for(const [key,entry] of previous)if(next.get(key)!==entry)entry.node.remove();
  this.entries.set(parent,next);
 }
}

export function attr(node,name,value){if(node.getAttribute(name)!==String(value))node.setAttribute(name,value);}
export function text(node,value){if(node.textContent!==String(value))node.textContent=value;}
