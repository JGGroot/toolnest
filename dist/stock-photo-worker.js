import {rectifyStock} from './stock-photo-model.js?v=20261025-seg5';
self.onmessage=e=>{const {id,image,calibration}=e.data;try{const result=rectifyStock(image,calibration);self.postMessage({id,result},[result.data.buffer]);}catch(error){self.postMessage({id,error:error.message});}};
