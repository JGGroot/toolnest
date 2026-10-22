import {checkLayout} from './foam-model.js';

self.onmessage=({data:{id,tools,foam}})=>{
 try{self.postMessage({id,issues:checkLayout(tools,foam)});}
 catch(error){self.postMessage({id,error:error.message});}
};
