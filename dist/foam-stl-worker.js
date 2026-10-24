import {buildSTL} from './foam-stl.js?v=20261024-seg1';
self.onmessage=e=>{try{const buffer=buildSTL(e.data);self.postMessage({buffer},[buffer]);}catch(e){self.postMessage({error:e.message});}};
