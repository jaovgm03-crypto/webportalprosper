import {parseKml,boundsOverlap} from './kml-features.mjs';
import {importFormat} from './import-file.mjs';

export function createTemporaryLayers({months,notice,isMeasuring,addMeasurePoint}){
  const files=[],maps=new Set(),listeners=new Set();let serial=0;
  const colors=['#176ca4','#9164ad','#147b61','#b45b22'];
  const coverage=months.map(m=>{const [[s,w],[n,e]]=m.orthoWebBounds;return [w,s,e,n];});
  const section=document.createElement('section');section.className='contextSection temporarySection';section.hidden=true;
  section.innerHTML='<h3 class="sideSectionTitle">Meus arquivos temporários</h3><div class="temporaryList"></div><small>Somente nesta aba · Excluídos ao recarregar</small>';
  document.querySelector('.measurementSection').before(section);
  function notify(){renderList(section.querySelector('.temporaryList'));section.hidden=!files.length;for(const fn of listeners)fn();}
  function popup(file,feature){
    const div=document.createElement('div');div.className='referencePopup';const title=document.createElement('strong');title.textContent=file.name;div.append(title);
    const dl=document.createElement('dl');for(const [key,value] of Object.entries(feature.properties||{})){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=key;dd.textContent=value??'—';dl.append(dt,dd);}if(!dl.children.length){const p=document.createElement('p');p.textContent=feature.geometry.type;div.append(p);}else div.append(dl);return div;
  }
  function sync(state){
    for(const [id,layer] of state.layers){const file=files.find(f=>f.id===id);if(!file||!file.visible){state.map.removeLayer(layer);if(!file)state.layers.delete(id);}}
    for(const file of files){if(!file.visible)continue;
      if(!state.layers.has(file.id)){
        const options={pane:'temporaryFiles',color:file.color,weight:2.5,fillColor:file.color,fillOpacity:.13,bubblingMouseEvents:false,renderer:state.renderer};
        const layer=L.geoJSON(file.data,{...options,style:options,
          pointToLayer:(_f,ll)=>L.circleMarker(ll,{...options,radius:6,fillOpacity:1,weight:2,color:'#ffffff'}),
          onEachFeature:(f,l)=>l.on('click',e=>{if(isMeasuring()){addMeasurePoint(state.panel,e.latlng);return;}L.popup({maxWidth:340}).setLatLng(e.latlng).setContent(popup(file,f)).openOn(state.map);})
        });state.layers.set(file.id,layer);
      }state.layers.get(file.id).addTo(state.map);
    }
  }
  function redraw(){for(const state of maps)sync(state);notify();}
  function locate(file){
    if(!maps.size){notice('Abra uma ortofoto ou mapa 2D para localizar o arquivo.');return false;}
    file.visible=true;redraw();const [w,s,e,n]=file.bounds;for(const state of maps)state.map.fitBounds([[s,w],[n,e]],{maxZoom:19,padding:[32,32],animate:false});return true;
  }
  function remove(file){const i=files.indexOf(file);if(i>=0)files.splice(i,1);for(const state of maps)state.map.closePopup();redraw();}
  function renderList(container,{onLocate}={}){
    container.replaceChildren();
    if(!files.length){const p=document.createElement('p');p.className='filesMuted';p.textContent='Nenhum arquivo carregado nesta sessão.';container.append(p);return;}
    for(const file of files){
      const row=document.createElement('div');row.className='temporaryRow';
      const label=document.createElement('label'),input=document.createElement('input'),name=document.createElement('span');input.type='checkbox';input.checked=file.visible;input.onchange=()=>{file.visible=input.checked;redraw();};name.textContent=file.name;label.append(input,name);row.append(label);
      const small=document.createElement('small');small.textContent=`${file.data.features.length} feições${file.outside?' · Fora da extensão dos levantamentos':''}`;row.append(small);
      const actions=document.createElement('div');for(const [text,action] of [['Localizar no mapa',()=>{if(locate(file))onLocate?.();}],['Remover',()=>remove(file)]]){const button=document.createElement('button');button.type='button';button.textContent=text;button.setAttribute('aria-label',text+' · '+file.name);button.onclick=action;actions.append(button);}row.append(actions);container.append(row);
    }
  }
  async function load(file,signal){
    importFormat(file.name,file.size);
    if(files.length>=6)throw Error('Limite de seis arquivos temporários. Remova um arquivo para continuar.');
    const buffer=await file.arrayBuffer();if(signal?.aborted)throw Error('Importação cancelada.');
    const source=await new Promise((resolve,reject)=>{
      const worker=new Worker(new URL('./kmz-worker.mjs',import.meta.url),{type:'module'});
      const cleanup=()=>{clearTimeout(timer);worker.terminate();signal?.removeEventListener('abort',abort);};
      const abort=()=>{cleanup();reject(Error('Importação cancelada.'));};
      const timer=setTimeout(()=>{cleanup();reject(Error('A leitura demorou demais. Divida o arquivo em partes menores.'));},15000);
      signal?.addEventListener('abort',abort,{once:true});
      worker.onmessage=e=>{cleanup();e.data.error?reject(Error(e.data.error)):resolve(e.data.text);};
      worker.onerror=()=>{cleanup();reject(Error('Não foi possível ler o arquivo KML/KMZ. Verifique-o e tente novamente.'));};
      worker.postMessage({buffer,name:file.name},[buffer]);
    });
    if(signal?.aborted)throw Error('Importação cancelada.');
    const result=await parseKml(source);
    if(signal?.aborted)throw Error('Importação cancelada.');
    if(files.reduce((n,f)=>n+f.coordinateCount,0)+result.coordinateCount>400000)throw Error('Limite de vértices da sessão atingido. Remova arquivos antes de continuar.');
    const item={...result,id:++serial,name:file.name.slice(0,180),color:colors[(serial-1)%colors.length],visible:true,outside:!coverage.some(b=>boundsOverlap(b,result.bounds))};
    files.push(item);redraw();return item;
  }
  function returnToMine(){for(const state of maps)state.map.fitBounds(state.panel.month.orthoWebBounds,{padding:[16,16],animate:false});if(!maps.size)notice('Abra uma ortofoto ou mapa 2D para voltar à mina.');return maps.size>0;}
  return {load,files,renderList,returnToMine,onChange(fn){listeners.add(fn);return()=>listeners.delete(fn);},attach(panel){const map=panel.map;map.createPane('temporaryFiles').style.zIndex=560;const state={panel,map,layers:new Map(),renderer:L.canvas({pane:'temporaryFiles',tolerance:3})};maps.add(state);sync(state);return()=>maps.delete(state);}};
}
