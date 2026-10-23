import {buildSTL} from './foam-stl.js?v=20261023-desk7';
self.onmessage=e=>{try{const buffer=buildSTL(e.data);self.postMessage({buffer},[buffer]);}catch(e){self.postMessage({error:e.message});}};
