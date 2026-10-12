import assert from 'node:assert/strict';
import {surfaceArea,validatePolygon} from '../dist/terrain-area.mjs';
import {pageLayout,pngPrintDensity} from '../dist/export-layout.mjs';
const square=[{x:1,z:1},{x:9,z:1},{x:9,z:9},{x:1,z:9}],tri=[[0,1,2],[0,2,3]],idx=[0,1,2,1,3,2];
for(const slope of [0,1,2]){
  const pos=[0,0,0,10,10*slope,0,0,0,10,10,10*slope,10];
  const r=surfaceArea(square,tri,pos,idx);assert.ok(Math.abs(r.planar-64)<1e-6);assert.ok(Math.abs(r.surface-64*Math.sqrt(1+slope*slope))<1e-6);
  const reverse=square.toReversed();assert.ok(Math.abs(surfaceArea(reverse,tri,pos,idx).surface-r.surface)<1e-6);
}
assert.throws(()=>validatePolygon([square[0],square[2],square[1],square[3]]),/cruza/);
assert.throws(()=>surfaceArea(square,tri,[0,0,0,10,0,0,0,0,10,10,0,10],[0,1,2]),/sem dados/);
const concave=[{x:1,z:1},{x:9,z:1},{x:9,z:5},{x:5,z:5},{x:5,z:9},{x:1,z:9}];
const concaveResult=surfaceArea(concave,[[0,1,3],[1,2,3],[0,3,5],[3,4,5]],[0,0,0,10,0,0,0,0,10,10,0,10],idx);
assert.equal(concaveResult.planar,48);assert.ok(Math.abs(concaveResult.surface-48)<1e-6);
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRf8AAAAASUVORK5CYII=','base64');
const printable=pngPrintDensity(png),printableTwice=pngPrintDensity(printable);
assert.deepEqual(printableTwice,printable);const density=Buffer.from(printable).indexOf('pHYs');assert.equal(new DataView(printable.buffer).getUint32(density+4),5906);assert.equal(printable[density+12],1);
for(const [w,h] of [[1600,700],[500,1300]]){const p=pageLayout(w,h,true);assert.ok(Math.abs(p.pageWidth/p.pageHeight-297/210)<1e-5);assert.ok(p.left>=5.99&&p.bottom>=14);assert.ok(Math.abs(p.width/p.height-w/h)<1e-6);assert.ok(Math.abs(p.width-(p.pageWidth-12))<1e-6||Math.abs(p.height-(p.pageHeight-32))<1e-6);}
console.log('Área plana/inclinada, orientação, interseção, NoData e A4: OK');
