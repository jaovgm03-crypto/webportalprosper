import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {measure,selfIntersects,validateFinished} from '../dist/measurement-math.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../dist');
const context={module:{exports:{}}};vm.createContext(context);vm.runInContext(fs.readFileSync(path.join(root,'vendor/geographiclib-geodesic.min.js'),'utf8'),context);const geo=context.module.exports;
const equator=measure(geo,[{lat:0,lng:0},{lat:0,lng:1}],'distance');assert.ok(Math.abs(equator.distance-111319.49079327357)<1e-6);
const box=[{lat:0,lng:0},{lat:0,lng:1},{lat:1,lng:1},{lat:1,lng:0}];const area=measure(geo,box,'area');assert.ok(Math.abs(area.area-12308778361.469452)<.01);assert.ok(Math.abs(measure(geo,[...box].reverse(),'area').area-area.area)<.01);assert.equal(selfIntersects(box),false);
const crossed=[box[0],box[2],box[1],box[3]];assert.equal(selfIntersects(crossed),true);assert.throws(()=>validateFinished(crossed,'area'));assert.throws(()=>validateFinished(box.slice(0,2),'area'));assert.throws(()=>measure(geo,[{lat:NaN,lng:0}],'distance'));
const manifest=JSON.parse(fs.readFileSync(path.join(root,'data/manifest.json'),'utf8'));
let vertices=0,points=0;
for(const m of manifest.months){
 const folder=path.join(root,'data',m.id);let n=0;
 for(const chunk of m.cloudChunks){const p=fs.readFileSync(path.join(folder,chunk.positions)),c=fs.readFileSync(path.join(folder,chunk.colors));assert.equal(p.length,chunk.count*12);assert.equal(c.length,chunk.count*3);const floats=new Float32Array(p.buffer,p.byteOffset,p.length/4);for(const v of floats)assert.ok(Number.isFinite(v));n+=chunk.count;}
 assert.equal(n,m.pointCount);assert.equal(n,m.fullPointCount);points+=n;
 const s=m.surface;const p=fs.readFileSync(path.join(folder,'surface-positions.bin')),idx=fs.readFileSync(path.join(folder,'surface-indices.bin'));assert.equal(p.length,s.vertexCount*12);assert.equal(idx.length,s.indexCount*4);assert.equal(s.indexCount%3,0);const indices=new Uint32Array(idx.buffer,idx.byteOffset,idx.length/4);for(const i of indices)assert.ok(i<s.vertexCount);vertices+=s.vertexCount;
 const contours=JSON.parse(fs.readFileSync(path.join(folder,'contours.geojson'),'utf8'));assert.equal(contours.features.length,m.contourCount);for(const f of contours.features){assert.ok(Number.isInteger(f.id));assert.ok('ID' in f.properties);assert.ok('ELEV' in f.properties);assert.equal(typeof f.properties.ELEV,'number');}
 // CSV masses have variable precision, as supplied by the surveyor.
 assert.ok(Math.abs(m.volume*m.density-m.tonnes)<1e-5);for(const name of ['ortho-web.png','terrain-web.png','surface-texture.jpg'])assert.ok(fs.statSync(path.join(folder,name)).size>100);
 for(const kind of ['ortho','terrain']){const [[s,w],[n,e]]=m[kind+'WebBounds'];assert.ok(s<n&&w<e);assert.ok(s>-20&&n<-19&&w>-43&&e<-42);}
}
assert.equal(new Set(manifest.months.map(m=>m.id)).size,manifest.months.length);
assert.ok(manifest.months.some(m=>m.id==='2026_09'));
assert.equal(manifest.rasterDisplayCRS,'EPSG:3857');
assert.equal(manifest.references.length,6);
for(const id of ['reserva_legal','servidao_ambiental_perpetua']){const r=manifest.references.find(r=>r.id===id);assert.equal(r.defaultVisible,false);assert.equal(r.fillOpacity,.5);}
for(const r of manifest.references){const data=JSON.parse(fs.readFileSync(path.join(root,r.url),'utf8'));assert.equal(data.features.length,r.featureCount);assert.ok(data.features.every(f=>Object.keys(f.properties).length>0));}
const html=fs.readFileSync(path.join(root,'index.html'),'utf8');for(const match of html.matchAll(/(?:src|href)="([^"]+)"/g)){const ref=match[1];if(ref.startsWith('#')||ref.includes('://'))continue;assert.ok(fs.existsSync(path.join(root,ref)),ref);}
assert.ok(!/ACERVO DE LEVANTAMENTOS|O terreno, ao longo|BASE DO PILOTO|data-view/.test(html));
console.log(JSON.stringify({checks:'passed',surveys:manifest.months.length,fullPoints:points,surfaceVertices:vertices,references:manifest.references.map(r=>[r.id,r.featureCount]),measurements:'WGS84 distance, area, winding, invalid coordinates and crossing rejection',attributes:'Source attributes preserved; ID and ELEV present in all months'},null,2));
