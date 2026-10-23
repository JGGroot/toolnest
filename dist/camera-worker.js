import {analyzeFrame} from './camera-analysis.js?v=20261023-desk5';
let previous=null;
self.onmessage=e=>{const m=e.data;if(m.type==='reset'){previous=null;return;}try{const r=analyzeFrame(m.image,m.settings,m.frozen?null:previous,m.outline);if(!m.frozen)previous=r.sample;delete r.sample;self.postMessage({id:m.id,result:r});}catch(error){self.postMessage({id:m.id,error:error.message});}};
