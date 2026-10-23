import {checkLayout} from './foam-model.js?v=20261023-desk1';
let model=null;
self.onmessage=({data})=>{
 const {id}=data;
 try{
  if(data.tools)model={tools:data.tools,foam:data.foam};
  else if(data.keepout!==undefined)model.foam.keepouts[data.keepout].shape=data.shape;
  else Object.assign(model.tools[data.index],{x:data.x,y:data.y});
  self.postMessage({id,issues:checkLayout(model.tools,model.foam)});
 }catch(error){self.postMessage({id,error:error.message});}
};
