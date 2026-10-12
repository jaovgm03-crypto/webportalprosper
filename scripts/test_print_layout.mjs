import assert from 'node:assert/strict';
import {pageLayout} from '../dist/export-layout.mjs';
for(const orientation of ['landscape','portrait'])for(const marginMm of [0,2,5,10,15]){
 const settings={orientation,marginMm},page=pageLayout(1,1,settings),m=marginMm*72/25.4;
 const width=page.pageWidth-2*m,height=page.pageHeight-2*m-32;
 const fit=pageLayout(width*3,height*3,settings);
 assert.ok(Math.abs(fit.left-m)<1e-8);
 assert.ok(Math.abs(fit.bottom-(m+14))<1e-8);
 assert.ok(Math.abs(fit.width-width)<1e-8);
 assert.ok(Math.abs(fit.height-height)<1e-8);
 assert.ok(Math.abs(fit.width/fit.height-width/height)<1e-10);
}
console.log('A4: both orientations and all margins fill the print frame without distortion.');
