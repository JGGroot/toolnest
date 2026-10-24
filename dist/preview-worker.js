import {computePreview} from './preview-model.js?v=20261025-fpk3';
let image=null;
self.onmessage=e=>{const m=e.data;if(m.type==='image'){image=m.image;return;}try{self.postMessage({id:m.id,result:computePreview(m.state,image,m.retrace)});}catch(error){self.postMessage({id:m.id,error:error.message});}};
