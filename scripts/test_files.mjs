import assert from 'node:assert/strict';
import fs from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {zipStore,readKmz,crc32,KMZ_LIMITS} from '../dist/kmz-archive.mjs';
import {importFormat,readImportFile} from '../dist/import-file.mjs';
import {featureFolder,groundOverlay,kmlDocument,geometryKml,boundsOverlap} from '../dist/kml-features.mjs';
const out='tmp/files-tests';fs.mkdirSync(out,{recursive:true});
const fixture={type:'FeatureCollection',features:[
  {type:'Feature',properties:{Nome:'Ponto de campo <teste>',Descrição:'<img src="https://example.invalid/track" onerror="alert(1)">',Cota:952.5},geometry:{type:'Point',coordinates:[-42.9416,-19.3893,952.5]}},
  {type:'Feature',properties:{Nome:'Linha de campo'},geometry:{type:'LineString',coordinates:[[-42.942,-19.389],[-42.941,-19.39]]}},
  {type:'Feature',properties:{Nome:'Polígono com ilha'},geometry:{type:'Polygon',coordinates:[ [[-42.943,-19.391],[-42.94,-19.391],[-42.94,-19.387],[-42.943,-19.387],[-42.943,-19.391]], [[-42.9425,-19.3905],[-42.9425,-19.39],[-42.942,-19.39],[-42.942,-19.3905],[-42.9425,-19.3905]] ]}}
]};
const source=kmlDocument([featureFolder('Arquivo de campo',fixture,{color:'#176ca4',fill:true,fillOpacity:.25})]);
const stored=zipStore([{name:'doc.kml',data:source}]);assert.equal(await readKmz(stored),source);
const multi=zipStore([{name:'doc.kml',data:source},{name:'images/sample.png',data:new Uint8Array([1,2,3])}]);assert.equal(await readKmz(multi),source);
const save=(name,data)=>fs.writeFileSync(`${out}/${name}`,data);
save('campo.kmz',stored);save('campo.geojson',JSON.stringify(fixture));
save('campo.kml',source);
assert.equal(importFormat('CAMPO.KML',100),'kml');
assert.equal(importFormat('CAMPO.KMZ',100),'kmz');
assert.throws(()=>importFormat('campo.zip',100),/KML ou KMZ/);
assert.throws(()=>importFormat('campo.kml',KMZ_LIMITS.kmlBytes+1),/16 MB/);
assert.throws(()=>importFormat('campo.kmz',KMZ_LIMITS.fileBytes+1),/32 MB/);
assert.equal(await readImportFile(new TextEncoder().encode(source),'campo.kml'),source);
assert.equal(await readImportFile(stored,'campo.kmz'),source);
assert.equal(await readImportFile(Buffer.from('\ufeff'+source,'utf16le'),'campo.kml'),source);
const utf16be=Buffer.from('\ufeff'+source,'utf16le').swap16();
assert.equal(await readImportFile(utf16be,'campo.kml'),source);
await assert.rejects(()=>readImportFile(new Uint8Array([0xc3,0x28]),'campo.kml'),/UTF/);
// An independent deflate ZIP builder exercises typical Google Earth archives.
function deflated(text,declared){const data=new TextEncoder().encode(text),payload=deflateRawSync(data),name=new TextEncoder().encode('doc.kml'),size=declared??data.length,c=30+name.length+payload.length,e=c+46+name.length,out=new Uint8Array(e+22),v=new DataView(out.buffer),u16=(o,n)=>v.setUint16(o,n,true),u32=(o,n)=>v.setUint32(o,n,true);u32(0,0x04034b50);u16(4,20);u16(8,8);u32(14,crc32(data));u32(18,payload.length);u32(22,size);u16(26,name.length);out.set(name,30);out.set(payload,30+name.length);u32(c,0x02014b50);u16(c+4,20);u16(c+6,20);u16(c+10,8);u32(c+16,crc32(data));u32(c+20,payload.length);u32(c+24,size);u16(c+28,name.length);out.set(name,c+46);u32(e,0x06054b50);u16(e+8,1);u16(e+10,1);u32(e+12,e-c);u32(e+16,c);return out;}
const compressed=deflated(source);assert.equal(await readKmz(compressed),source);save('campo-comprimido.kmz',compressed);
const crcBad=stored.slice();crcBad[60]^=1;await assert.rejects(()=>readKmz(crcBad),/integridade/);save('corrompido.kmz',crcBad);
await assert.rejects(()=>readKmz(new Uint8Array(30)),/válido/);
await assert.rejects(()=>readKmz(stored.slice(0,-3)),/válido/);
await assert.rejects(()=>readKmz(zipStore([{name:'a.kml',data:source},{name:'b.kml',data:source}])));
assert.throws(()=>zipStore([{name:'../doc.kml',data:source}]));
await assert.rejects(()=>readKmz(stored,{...KMZ_LIMITS,fileBytes:10}));
await assert.rejects(()=>readKmz(stored,{...KMZ_LIMITS,expandedBytes:10}));
await assert.rejects(()=>readKmz(stored,{...KMZ_LIMITS,kmlBytes:10}));
const bomb=deflated('A'.repeat(300000),10);await assert.rejects(()=>readKmz(bomb),/descompactar/);save('tamanho-falso.kmz',bomb);
const encrypted=stored.slice();new DataView(encrypted.buffer).setUint16(6,1,true);await assert.rejects(()=>readKmz(encrypted),/inconsistente/);
assert.equal(boundsOverlap([-43,-20,-42,-19],[-45,-24,-44,-23]),false);
assert.equal(boundsOverlap([-43,-20,-42,-19],[-42.5,-19.5,-41,-18]),true);
for(const type of ['MultiPoint','MultiLineString','MultiPolygon','GeometryCollection']){
 const base=type==='MultiPoint'?fixture.features[0].geometry:type==='MultiLineString'?fixture.features[1].geometry:fixture.features[2].geometry;
 assert.match(geometryKml(type==='GeometryCollection'?{type,geometries:[base]}:{type,coordinates:[base.coordinates]}),/<MultiGeometry>/);
}
const invalids={
 'fora-da-mina.kmz':kmlDocument([featureFolder('Outra cidade',{type:'FeatureCollection',features:[{type:'Feature',properties:{Nome:'Ponto em outra cidade'},geometry:{type:'Point',coordinates:[-46.633,-23.55]}}]})]),
 'xml-invalido.kmz':'<kml><Placemark></kml>',
 'coordenada-invalida.kmz':'<kml><Placemark><Point><coordinates>999,91</coordinates></Point></Placemark></kml>',
 'entidade-externa.kmz':'<!DOCTYPE kml [<!ENTITY xxe SYSTEM "file:///C:/Windows/win.ini">]><kml><Placemark><name>&xxe;</name><Point><coordinates>-42,-19</coordinates></Point></Placemark></kml>',
 'conexao-externa.kmz':'<kml><NetworkLink><Link><href>https://example.invalid/data</href></Link></NetworkLink></kml>',
 'sem-feicoes.kmz':'<kml><GroundOverlay><Icon><href>image.png</href></Icon></GroundOverlay></kml>'
};for(const [name,kml] of Object.entries(invalids)){save(name,zipStore([{name:'doc.kml',data:kml}]));save(name.replace('.kmz','.kml'),kml);}
const manifest=JSON.parse(fs.readFileSync('dist/data/manifest.json')),catalogue=JSON.parse(fs.readFileSync('dist/data/kmz-orthophotos.json'));
const folders=[];
for(const ref of manifest.references){const data=JSON.parse(fs.readFileSync('dist/'+ref.url));folders.push(featureFolder(ref.label,data,ref));}
const contours=JSON.parse(fs.readFileSync('dist/data/2026_09/contours.geojson'));folders.push(featureFolder('Curvas de Nível 1m · Setembro 2026',contours,{color:'#000000'}));
save('referencias-curvas.kmz',zipStore([{name:'doc.kml',data:kmlDocument(folders)}]));
save('referencias-curvas.kml',kmlDocument(folders));
const ortho=catalogue['2026_09'];folders.push(groundOverlay('Ortofoto · Setembro 2026','images/ortofoto.png',ortho.bounds));
save('pacote-setembro.kmz',zipStore([{name:'doc.kml',data:kmlDocument(folders)},{name:'images/ortofoto.png',data:fs.readFileSync('dist/'+ortho.url)}]));
for(const [month,rec] of Object.entries(catalogue)){assert.equal(fs.statSync('dist/'+rec.url).size,rec.bytes);assert.ok(rec.bounds[0][0]<rec.bounds[1][0]);assert.ok(rec.bounds[0][1]<rec.bounds[1][1]);}
console.log('KMZ: arquivos armazenados/comprimidos, CRC, limites reais/declarados, arquivos truncados e múltiplas geometrias passaram. Fixtures e pacote setembro criados em tmp/files-tests.');
