import {prepareCapture} from './capture-model.js?v=20261022-curves2';
self.onmessage=e=>{const {id,image,settings}=e.data;try{const result=prepareCapture(image,settings);self.postMessage({id,result},[result.rect.data.buffer]);}catch(error){self.postMessage({id,error:error.message});}};
