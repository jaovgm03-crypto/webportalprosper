import {readImportFile} from './import-file.mjs';
self.onmessage=async e=>{try{const text=await readImportFile(new Uint8Array(e.data.buffer),e.data.name);self.postMessage({text});}catch(error){self.postMessage({error:error.message});}};
