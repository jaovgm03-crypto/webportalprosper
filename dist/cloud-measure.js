import * as THREE from 'three';
import {offerDownload} from './export-preview.js';
import {terrainSampler,profileAlong} from './terrain-profile.mjs';
import {fmt} from './common.js';
import {polygonArea,validatePolygon,surfaceArea} from './terrain-area.mjs';
import {drawPlan,highlightPlanVertex,captureSheet} from './measurement-visuals.js';
import {pngPrintDensity} from './export-layout.mjs';

export function cloudMeasurements({panel,host,scene,camera,controls,renderer,getMesh,invalidate,originElevation,onPathChange,onClaim,isSinglePanel}) {
  let sample=null,vertices=[],result=null,draftSamples=null,drawing=false,revision=0,mode='distance',positions=null,indices=null;
  const group=new THREE.Group(); scene.add(group);
  const marker=new THREE.Mesh(new THREE.ConeGeometry(4.5,14,6),new THREE.MeshBasicMaterial({color:0xd14b2f,depthTest:false}));
  marker.visible=false;marker.renderOrder=1000;group.add(marker);
  const tools=document.createElement('div');tools.className='cloudMeasureTools';
  tools.innerHTML='<span role="status"></span>';
  host.append(tools);
  const card=document.createElement('section');card.className='profileCard';card.hidden=true;
  card.innerHTML='<strong>Perfil topográfico</strong><div class="profileSummary"></div><canvas aria-label="Perfil topográfico: distância horizontal e elevação" tabindex="0"></canvas><div class="profileReadout" aria-live="polite"></div><details class="planVertices" hidden><summary>Vértices e cotas</summary><div class="vertexTableScroll"><table><thead><tr><th>Vértice</th><th>Cota (m)</th></tr></thead><tbody></tbody></table></div></details><small>MDT reamostrado · Distâncias em projeção UTM · Inclinação média entre extremos. Medições temporárias.</small>';
  panel.body.append(card);
  const graph=card.querySelector('canvas'),readout=card.querySelector('.profileReadout'),status=tools.querySelector('[role=status]');
  let plot=null,hover=0,line=null;
  const vertexDetails=card.querySelector('.planVertices'),planBase=document.createElement('canvas');
  let planPoints=[],selectedVertex=-1;
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  function showStatus(s,error=false){status.textContent=s;status.classList.toggle('error',error);}
  function setDrawing(value){drawing=value;controls.enabled=!value;controls.autoRotate=false;host.classList.toggle('measuring3D',value);}
  function redrawLine(){
    if(line){group.remove(line);line.geometry.dispose();line.material.dispose();line=null;}
    const pts=result?.samples||draftSamples||vertices;
    if(pts.length){line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p=>new THREE.Vector3(p.x,p.y+0.35,p.z))),new THREE.LineBasicMaterial({color:0xffe600,depthTest:false}));line.renderOrder=999;group.add(line);}
    invalidate();
  }
  function drawGraph(){
    if(!result)return;
    if(mode==='area'){
      if(!getMesh())return;
      const width=Math.max(260,card.clientWidth-32),height=width<500?320:360;
      planPoints=drawPlan(graph,vertices,{renderer,scene,camera,mesh:getMesh(),group,originElevation},width,height);
      planBase.width=graph.width;planBase.height=graph.height;planBase.getContext('2d').drawImage(graph,0,0);
      graph.style.width='100%';graph.style.height=height+'px';paintPlanSelection();return;
    }
    const w=Math.max(300,card.clientWidth-24),h=190,dpr=window.devicePixelRatio||1;
    graph.width=w*dpr;graph.height=h*dpr;graph.style.width='100%';graph.style.height=h+'px';
    const c=graph.getContext('2d');c.scale(dpr,dpr);c.fillStyle='#fff';c.fillRect(0,0,w,h);
    const left=60,right=w-18,top=18,bottom=h-35;
    let low=Math.min(...result.samples.map(p=>p.y)),high=Math.max(...result.samples.map(p=>p.y));const pad=Math.max(1,(high-low)*.12);low-=pad;high+=pad;
    const px=p=>left+p.distance/result.horizontal*(right-left),py=p=>bottom-(p.y-low)/(high-low)*(bottom-top);
    plot={left,right,w};c.font='11px Arial';
    for(let i=0;i<5;i++){const y=top+(bottom-top)*i/4;c.strokeStyle='#dce3e8';c.beginPath();c.moveTo(left,y);c.lineTo(right,y);c.stroke();c.fillStyle='#33495a';c.fillText(fmt(high-(high-low)*i/4+originElevation,1),2,y+4);}
    c.fillText('Cota (m)',2,11);
    for(let i=0;i<=4;i++){const x=left+(right-left)*i/4;c.textAlign=i===0?'left':i===4?'right':'center';c.fillStyle='#526776';c.fillText(fmt(result.horizontal*i/4,1)+' m',x,bottom+20);}
    c.textAlign='left';
    const gradient=c.createLinearGradient(0,top,0,bottom);gradient.addColorStop(0,'#90c6bb99');gradient.addColorStop(1,'#eaf4f130');
    c.beginPath();result.samples.forEach((p,i)=>i?c.lineTo(px(p),py(p)):c.moveTo(px(p),py(p)));c.lineTo(right,bottom);c.lineTo(left,bottom);c.closePath();c.fillStyle=gradient;c.fill();
    c.beginPath();result.samples.forEach((p,i)=>i?c.lineTo(px(p),py(p)):c.moveTo(px(p),py(p)));c.strokeStyle='#00685f';c.lineWidth=2;c.stroke();
    const p=result.samples[hover];c.strokeStyle='#ffe600';c.lineWidth=2;c.beginPath();c.moveTo(px(p),top);c.lineTo(px(p),bottom);c.stroke();c.fillStyle='#d14b2f';c.beginPath();const ax=px(p),ay=py(p);c.moveTo(ax,ay-6);c.lineTo(ax+5,ay+3);c.lineTo(ax,ay+1);c.lineTo(ax-5,ay+3);c.closePath();c.fill();
  }
  function inspect(i){if(!result||mode==='area')return;hover=Math.max(0,Math.min(result.samples.length-1,i));const p=result.samples[hover];marker.position.set(p.x,p.y+4,p.z);marker.visible=true;readout.textContent=`Distância: ${fmt(p.distance,2)} m · Elevação: ${fmt(p.y+originElevation,2)} m`;drawGraph();invalidate();}
  function paintPlanSelection(){
    if(!result||mode!=='area'||!planBase.width)return;
    graph.getContext('2d').drawImage(planBase,0,0);highlightPlanVertex(graph,planPoints,selectedVertex,vertices,originElevation);
    readout.textContent=selectedVertex<0?`${vertices.length} vértices · ${fmt(result.planar/10000,4)} ha · Toque em um ponto para consultar a cota.`:`V${selectedVertex+1} · Cota: ${fmt(vertices[selectedVertex].y+originElevation,2)} m`;
    vertexDetails.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.vertex)===selectedVertex)));
  }
  function selectPlanVertex(index){selectedVertex=index;paintPlanSelection();}
  function pointAt(e){const r=graph.getBoundingClientRect(),x=(e.clientX-r.left)*graph.width/r.width,y=(e.clientY-r.top)*graph.height/r.height;let closest=-1,distance=18;planPoints.forEach((p,i)=>{const d=Math.hypot(x-p.x,y-p.y);if(d<distance){distance=d;closest=i;}});return closest;}
  vertexDetails.onclick=e=>{const b=e.target.closest('[data-vertex]');if(b)selectPlanVertex(Number(b.dataset.vertex));};
  function metrics(){return mode==='area'?[['Área em planta',fmt(result.planar,2)+' m²'],['Área sobre MDT',result.surface==null?'Conclua a medição':fmt(result.surface,2)+' m²'],['Perímetro em planta',fmt(result.perimeter,2)+' m'],['Cotas',fmt(result.minY+originElevation,1)+' a '+fmt(result.maxY+originElevation,1)+' m']]:[['Horizontal',fmt(result.horizontal,2)+' m'],['Sobre o terreno',fmt(result.surface,2)+' m'],['Desnível',fmt(result.delta,2)+' m'],['Inclinação média',fmt(result.slope,2)+'% ('+fmt(result.angle,2)+'°)']];}
  function refresh(final=false){
    card.classList.toggle('areaResult',mode==='area');
    vertexDetails.hidden=mode!=='area';selectedVertex=-1;
    draftSamples=null;
    // Keep the drawing viewport stable until the user explicitly closes the polygon.
    // Showing the plan at vertex three resized the canvas beneath the pointer.
    if(mode==='area'&&!final){
      result=null;marker.visible=false;card.hidden=true;panel.body.classList.remove('hasProfile');
      if(vertices.length>1){try{draftSamples=profileAlong(vertices,sample,3).samples;}catch{}}
      showStatus('');redrawLine();return false;
    }
    const enough=vertices.length>=(mode==='area'?3:2);marker.visible=false;
    panel.body.classList.toggle('hasProfile',enough);
    if(!enough){result=null;card.hidden=true;redrawLine();return false;}
    try {
      if(mode==='area'){
        validatePolygon(vertices);const boundary=profileAlong([...vertices,vertices[0]],sample,3);
        const stats=final?surfaceArea(vertices,THREE.ShapeUtils.triangulateShape(vertices.map(p=>new THREE.Vector2(p.x,p.z)),[]),positions,indices):{planar:polygonArea(vertices),surface:null,minY:Math.min(...vertices.map(p=>p.y)),maxY:Math.max(...vertices.map(p=>p.y))};
        result={...stats,perimeter:boundary.horizontal,samples:boundary.samples};
      }else result=profileAlong(vertices,sample);
      card.hidden=false;card.querySelector('strong').textContent=(mode==='area'?'Planta do terreno':'Perfil topográfico')+' · '+panel.month.label;
      card.querySelector('.profileSummary').innerHTML=metrics().map(([k,v])=>`<div><span>${k}</span><b>${v}</b></div>`).join('');
      card.querySelector('small').textContent=mode==='area'?'Norte para cima · Cotas em metros · Área sobre a malha do MDT, sem exagero vertical.':'MDT reamostrado · Distância horizontal acumulada · Inclinação média entre extremos.';
      graph.setAttribute('aria-label',mode==='area'?'Planta do terreno com vértices e cotas':'Perfil topográfico: distância e elevação');
      readout.textContent=mode==='area'?`${vertices.length} vértices · ${fmt(result.planar/10000,4)} ha`:'';
      if(mode==='area'){vertexDetails.querySelector('tbody').innerHTML=vertices.map((p,i)=>`<tr><td><button data-vertex="${i}" aria-label="Destacar vértice ${i+1}" aria-pressed="false">V${i+1}</button></td><td>${fmt(p.y+originElevation,2)}</td></tr>`).join('');}
      if(mode==='area')drawGraph();else inspect(0);showStatus('');
    }catch(e){result=null;card.hidden=true;panel.body.classList.remove('hasProfile');showStatus(e.message,true);redrawLine();return false;}
    redrawLine();return true;
  }
  function click(e){
    if(!drawing||!sample)return;
    const rect=renderer.domElement.getBoundingClientRect();pointer.set((e.clientX-rect.left)/rect.width*2-1,1-(e.clientY-rect.top)/rect.height*2);ray.setFromCamera(pointer,camera);
    const mesh=getMesh();if(!mesh){showStatus('Selecione Superfície com ortofoto ou Hipsometria para medir.',true);return;}
    mesh.updateMatrixWorld(true);const hit=ray.intersectObject(mesh,false)[0];if(!hit){showStatus('Clique em uma área válida do terreno.',true);return;}
    const p=mesh.worldToLocal(hit.point.clone());const point=sample(p.x,p.z);if(!point){showStatus('Este ponto não possui dados de terreno. Escolha outro ponto.',true);return;}
    if(onClaim&&!onClaim(panel))return;
    if(vertices.length&&Math.hypot(point.x-vertices.at(-1).x,point.z-vertices.at(-1).z)<.01)return;
    vertices.push(point);refresh();onPathChange?.(vertices,drawing,'change',mode);
  }
  renderer.domElement.addEventListener('click',click);
  graph.onpointermove=e=>{if(!result)return;if(mode==='area'){const i=pointAt(e);if(i!==selectedVertex)selectPlanVertex(i);return;}if(!plot)return;const r=graph.getBoundingClientRect(),x=(e.clientX-r.left)/r.width*plot.w,t=Math.max(0,Math.min(1,(x-plot.left)/(plot.right-plot.left)));let best=0;result.samples.forEach((p,i)=>{if(Math.abs(p.distance/result.horizontal-t)<Math.abs(result.samples[best].distance/result.horizontal-t))best=i;});inspect(best);};
  graph.onclick=e=>{if(result&&mode==='area')selectPlanVertex(pointAt(e));};
  graph.onkeydown=e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();if(result&&mode==='area')selectPlanVertex((selectedVertex+(e.key==='ArrowRight'?1:-1)+vertices.length)%vertices.length);else inspect(hover+(e.key==='ArrowRight'?1:-1));}};
  async function saveImage(){try{const canvas=capture();let blob=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('Falha ao gerar imagem.')),'image/png'));if(isSinglePanel?.()??true)blob=new Blob([pngPrintDensity(new Uint8Array(await blob.arrayBuffer()))],{type:'image/png'});offerDownload(blob,`PROSPER_${panel.month.id}_3D.png`,true);showStatus('Imagem pronta para download.');}catch(e){showStatus(e.message,true);}}
  function capture(){if(drawing)throw Error('Conclua a medição antes de salvar.');return captureSheet({renderer,scene,camera,panel,result,graph,metrics:result?metrics():[],mode,a4:isSinglePanel?.()??true});}
  const observer=new ResizeObserver(drawGraph);observer.observe(card);
  return {
    saveImage,
    capture,
    start(type){vertices=[];result=null;mode=type;marker.visible=false;setDrawing(true);refresh();},
    finish(){if(!refresh(true))return false;setDrawing(false);onPathChange?.(vertices,false,'finish',mode);return true;},
    undo(){vertices.pop();refresh();onPathChange?.(vertices,drawing,'change',mode);},
    get count(){return vertices.length;},
    get drawing(){return drawing;},
    exportMeasurement(){return !drawing&&result?{type:mode,vertices:vertices.map(p=>({...p})),attributes:Object.fromEntries(metrics())}:null;},
    setTerrain(p,i,w,h){positions=p;indices=i;sample=terrainSampler(p,i,w,h);},
    setExternalPath(points,type='distance',final=false){mode=type;marker.visible=false;vertices=(points||[]).map(p=>sample?.(p.x,p.z) || {x:p.x,y:0,z:p.z});refresh(final);},
    setExternalDrawing(value){if(!value && drawing)setDrawing(false);},
    clear(){vertices=[];result=null;marker.visible=false;setDrawing(false);refresh();showStatus('');},
    setExaggeration(value){group.scale.y=value;invalidate();},
    stop(){setDrawing(false);},
    dispose(){revision++;observer.disconnect();renderer.domElement.removeEventListener('click',click);group.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});scene.remove(group);tools.remove();card.remove();}
  };
}
