import {parseKml} from '/dist/kml-features.mjs';
import {readKmz} from '/dist/kmz-archive.mjs';
import {createTemporaryLayers} from '/dist/temporary-layers.js';
const result=document.querySelector('#result'),lines=[];let passed=0,failed=0;
const assert=(value,message)=>{if(!value)throw Error(message);};
async function test(name,fn){try{await fn();passed++;lines.push('OK — '+name);}catch(e){failed++;lines.push('FALHOU — '+name+': '+e.message);}result.textContent=lines.join('\n')+`\n\n${passed} passaram; ${failed} falharam.`;}
const file=async name=>new File([await (await fetch('/tmp/files-tests/'+name)).arrayBuffer()],name);
const parse=async name=>parseKml(await readKmz(new Uint8Array(await (await file(name)).arrayBuffer())));
await test('Importação de KMZ com deflate, atributos e anel interno',async()=>{const r=await parse('campo-comprimido.kmz');assert(r.data.features.length===3,'contagem');assert(r.data.features[2].geometry.coordinates.length===2,'ilha');assert(r.data.features[0].properties.Descrição.includes('<img'),'texto original');assert(r.data.features[0].geometry.coordinates.length===2,'2D');});
for(const name of ['xml-invalido.kmz','coordenada-invalida.kmz','entidade-externa.kmz','conexao-externa.kmz','sem-feicoes.kmz','corrompido.kmz','tamanho-falso.kmz']){
  await test('Recusa: '+name,async()=>{let rejected=false;try{await parse(name);}catch{rejected=true;}assert(rejected,'arquivo inválido aceito');});
}
await test('Referências e todas as curvas de setembro exportadas e reimportadas',async()=>{const r=await parse('referencias-curvas.kmz');assert(r.data.features.length===850,'contagem');assert(r.data.features.some(f=>f.properties.ELEV==='760'),'cotas');});
const manifest=await(await fetch('/dist/data/manifest.json')).json();
const temporary=createTemporaryLayers({months:manifest.months,notice:()=>{},isMeasuring:()=>false,addMeasurePoint:()=>{}});
const mapA=L.map('mapA').fitBounds(manifest.months.at(-1).orthoWebBounds),mapB=L.map('mapB').fitBounds(manifest.months[0].orthoWebBounds);
const detachA=temporary.attach({map:mapA,month:manifest.months.at(-1)}),detachB=temporary.attach({map:mapB,month:manifest.months[0]});
await test('Worker real e camadas temporárias nos dois meses, sem alterar enquadramento',async()=>{const a=mapA.getBounds().toBBoxString(),b=mapB.getBounds().toBBoxString();await temporary.load(await file('campo-comprimido.kmz'));assert(temporary.files.length===1,'sessão');assert(a===mapA.getBounds().toBBoxString()&&b===mapB.getBounds().toBBoxString(),'enquadramento mudou');let ca=0,cb=0;mapA.eachLayer(l=>{if(l instanceof L.GeoJSON)ca++;});mapB.eachLayer(l=>{if(l instanceof L.GeoJSON)cb++;});assert(ca===1&&cb===1,'camada ausente em algum mês');});
await test('Atributos com HTML apresentados somente como texto',async()=>{let point;mapA.eachLayer(l=>{if(l.feature?.geometry.type==='Point')point=l;});point.fire('click',{latlng:point.getLatLng()});assert(document.querySelectorAll('.leaflet-popup img').length===0,'imagem externa inserida');assert(document.querySelector('.leaflet-popup').textContent.includes('<img'),'atributos perdidos');mapA.closePopup();mapA.stop();});
await test('Arquivo de outra cidade aceito com indicação fora da cobertura',async()=>{const a=mapA.getBounds().toBBoxString();const r=await temporary.load(await file('fora-da-mina.kmz'));assert(r.outside,'aviso ausente');assert(a===mapA.getBounds().toBBoxString(),'deslocou mapa');});
await test('Alternar visibilidade e remover dos dois mapas',async()=>{const list=document.querySelector('.temporaryList');list.querySelector('input').click();assert(temporary.files[0].visible===false,'visibilidade');let ca=0;mapA.eachLayer(l=>{if(l instanceof L.GeoJSON)ca++;});assert(ca===1,'camada não ocultada');list.querySelector('button[aria-label^="Remover"]').click();assert(temporary.files.length===1,'remoção');});
await test('Cancelar não incorpora arquivo',async()=>{const controller=new AbortController();controller.abort();let canceled=false;try{await temporary.load(await file('campo.kmz'),controller.signal);}catch{canceled=true;}assert(canceled&&temporary.files.length===1,'cancelamento');});
await test('KML simples com os mesmos atributos e geometrias do KMZ',async()=>{const r=await temporary.load(await file('campo.kml'));assert(r.data.features.length===3,'feições');assert(r.data.features[2].geometry.coordinates.length===2,'ilha');});
for(const name of ['xml-invalido.kml','coordenada-invalida.kml','entidade-externa.kml','conexao-externa.kml','sem-feicoes.kml']){
 await test('Recusa KML: '+name,async()=>{const count=temporary.files.length;let rejected=false;try{await temporary.load(await file(name));}catch{rejected=true;}assert(rejected&&temporary.files.length===count,'arquivo inválido incorporado');});
}
detachA();detachB();mapA.remove();mapB.remove();
await test('Contraste de vértices e informações de medição nos temas claro e escuro',async()=>{
 const frame=document.createElement('iframe');frame.title='Amostra de estilos do portal';frame.style.cssText='width:600px;height:250px';
 const loaded=new Promise(resolve=>frame.onload=resolve);
 frame.srcdoc='<link rel="stylesheet" href="/dist/style.css"><link rel="stylesheet" href="/dist/portal-refinements.css"><link rel="stylesheet" href="/dist/portal-brand.css"><div class="profileCard"><details class="planVertices" open><summary>Vértices e cotas</summary><table><tr><td><button>V1</button></td><td><button aria-pressed="true">V2</button></td></tr></table></details><div class="popupHead">Curva de nível · Setembro 2026</div><span class="popupTag master">Curva mestra</span><span class="measureTypeTag area">Área</span><div class="measureHud"><span class="hudHint">Medição ativa</span></div></div>';
 document.body.append(frame);await loaded;
 const doc=frame.contentDocument,win=frame.contentWindow;
 const rgb=c=>c.match(/[\d.]+/g).slice(0,3).map(Number);
 const lum=c=>rgb(c).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;}).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
 const background=el=>{for(let node=el;node;node=node.parentElement){const color=win.getComputedStyle(node).backgroundColor;if(color!=='rgba(0, 0, 0, 0)'&&color!=='transparent')return color;}return 'rgb(255,255,255)';};
 for(const theme of ['light','dark']){doc.documentElement.dataset.theme=theme;for(const el of doc.querySelectorAll('.planVertices button,.popupHead,.popupTag.master,.measureTypeTag.area,.hudHint')){const a=lum(win.getComputedStyle(el).color),b=lum(background(el)),ratio=(Math.max(a,b)+.05)/(Math.min(a,b)+.05);assert(ratio>=4.5,`${theme} ${el.textContent}: contraste ${ratio.toFixed(2)}`);}}
});
document.title=`${failed?'FALHOU':'PASSOU'} — ${passed} testes de arquivos`;
await fetch('/test-result',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({date:new Date().toISOString(),passed,failed,lines})});
