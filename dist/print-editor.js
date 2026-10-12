import {pageLayout} from './export-layout.mjs';

// The print map owns all its layers and never changes the working panel.
function cloneLayers(source,target){
  source.eachLayer(layer=>{
    const options={...layer.options,interactive:false,bubblingMouseEvents:false};
    delete options.renderer;
    const pane=options.pane;
    if(pane&&!target.getPane(pane)){
      const created=target.createPane(pane);
      created.style.zIndex=getComputedStyle(source.getPane(pane)).zIndex;
    }
    let clone;
    // Preserve the satellite fallback loader and its CORS-enabled images.
    if(layer instanceof L.TileLayer)clone=new layer.constructor(layer._url,{...options,crossOrigin:'anonymous'});
    else if(layer instanceof L.ImageOverlay)clone=L.imageOverlay(layer.getElement().src,layer.getBounds(),options);
    else if(layer instanceof L.CircleMarker)clone=L.circleMarker(layer.getLatLng(),{...options,radius:layer.getRadius()});
    else if(layer instanceof L.Polygon)clone=L.polygon(layer.getLatLngs(),options);
    else if(layer instanceof L.Polyline)clone=L.polyline(layer.getLatLngs(),options);
    else if(layer instanceof L.Marker&&layer.getElement()?.classList.contains('customMeasureLabel'))clone=L.marker(layer.getLatLng(),{...options,icon:L.divIcon({...layer.options.icon.options})});
    if(clone)clone.addTo(target);
  });
}

export function openPrintEditor(panel,ctx,capture,pdfBytes){
  if(panel.type!=='ortho')throw Error('A exportação georreferenciada está disponível somente na ortofoto 2D.');
  if(ctx.isMeasuring())throw Error('Conclua ou cancele a medição antes de exportar.');
  const dialog=document.createElement('dialog');dialog.className='exportDialog printEditor';dialog.setAttribute('aria-label','Preparar PDF georreferenciado');
  dialog.innerHTML=`<h2>Preparar PDF georreferenciado</h2><p>Arraste o mapa e use + / − ou a roda do mouse para enquadrar o conteúdo na folha. O mapa do portal permanece como estava.</p>
    <div class="printControls"><label>Folha A4 <select aria-label="Orientação da folha"><option value="landscape">Horizontal</option><option value="portrait">Vertical</option></select></label>
    <label>Margens <select aria-label="Margens da folha"><option value="0">Sem margem</option><option value="2" selected>Mínimas · 2 mm</option><option value="5">5 mm</option><option value="10">10 mm</option><option value="15">15 mm</option></select></label>
    <button type="button" data-fit>Restaurar vista do portal</button></div>
    <div class="printStage"><div class="printSheet"><div class="printSheetTitle"></div><div class="printMap" aria-label="Mapa de impressão ajustável"></div><div class="printSheetFooter">WGS84 / EPSG:3857 - Imprimir em tamanho real, sem ajustar a pagina.</div></div></div>
    <p class="printStatus" role="status"></p><div class="printActions"><button type="button" data-save>Gerar PDF</button><a data-download hidden>Baixar PDF</a><button type="button" data-close>Fechar</button></div>`;
  const q=s=>dialog.querySelector(s),sheet=q('.printSheet'),host=q('.printMap'),status=q('.printStatus');
  q('.printSheetTitle').textContent='WebGIS Prosper - Mina Cuité - '+panel.month.label;
  document.body.append(dialog);dialog.showModal();
  const options=()=>({orientation:q('select').value,marginMm:Number(q('[aria-label="Margens da folha"]').value)});
  const map=L.map(host,{zoomSnap:0,zoomDelta:.5,minZoom:1,maxZoom:Math.min(22,panel.map.getMaxZoom()),attributionControl:true,zoomControl:true,fadeAnimation:false,zoomAnimation:false});
  map.attributionControl.setPrefix(false);
  let closed=false,url=null,renderId=0,hasView=false;
  const decoration=document.createElement('canvas');decoration.className='printDecorations';host.append(decoration);
  function invalidate(){if(url){URL.revokeObjectURL(url);url=null;}q('[data-download]').hidden=true;}
  async function refresh(){
    const id=++renderId;
    try{
      const shot=await capture({...panel,map},{...ctx,printLayout:options(),singlePanel:()=>true});
      if(closed||id!==renderId)return;
      decoration.width=shot.width;decoration.height=shot.height;decoration.getContext('2d').drawImage(shot.canvas,0,0);decoration.hidden=false;
      status.textContent='Enquadramento pronto. Escala, grade de coordenadas e norte serão incluídos no PDF.';
    }catch(e){if(!closed&&id===renderId){decoration.hidden=true;status.textContent=e.message;}}
  }
  function resize(fit=false){
    invalidate();decoration.hidden=true;
    const center=hasView?map.getCenter():null,zoom=hasView?map.getZoom():null;
    const o=options(),page=pageLayout(1,1,o),m=o.marginMm*72/25.4;
    sheet.style.width=`min(100%, ${55*page.pageWidth/page.pageHeight}vh)`;sheet.style.aspectRatio=`${page.pageWidth}/${page.pageHeight}`;
    host.style.left=100*m/page.pageWidth+'%';host.style.top=100*(m+18)/page.pageHeight+'%';
    host.style.width=100*(page.pageWidth-2*m)/page.pageWidth+'%';host.style.height=100*(page.pageHeight-2*m-32)/page.pageHeight+'%';
    map.invalidateSize({pan:false});
    if(fit)map.fitBounds(panel.map.getBounds(),{animate:false,padding:[0,0]});
    else if(center)map.setView(center,zoom,{animate:false});
    hasView=true;
    refresh();
  }
  cloneLayers(panel.map,map);resize(true);
  map.on('movestart',()=>{invalidate();++renderId;decoration.hidden=true;});
  map.on('moveend',refresh);
  map.eachLayer(l=>{if(l instanceof L.TileLayer||l instanceof L.ImageOverlay)l.on('load',refresh);});
  q('select').onchange=()=>resize();q('[aria-label="Margens da folha"]').onchange=()=>resize();q('[data-fit]').onclick=()=>resize(true);
  const observer=new ResizeObserver(()=>resize());observer.observe(sheet);
  q('[data-save]').onclick=async()=>{
    const button=q('[data-save]');button.disabled=true;const id=++renderId;
    try{
      const shot=await capture({...panel,map},{...ctx,printLayout:options(),printPixelRatio:Math.max(3,1800/map.getSize().x),singlePanel:()=>true});
      if(closed||id!==renderId)return;
      const pdf=pdfBytes(shot.jpeg,shot.width,shot.height,shot.bounds,'WebGIS Prosper - Mina Cuité - '+panel.month.label,options());
      invalidate();url=URL.createObjectURL(new Blob([pdf],{type:'application/pdf'}));
      const link=q('[data-download]');link.href=url;link.download=`PROSPER_Mina_Cuite_${panel.month.id}_georreferenciado.pdf`;link.hidden=false;link.focus();
      status.textContent='PDF pronto com o enquadramento mostrado. Clique em Baixar PDF.';
    }catch(e){status.textContent=e.message;}finally{button.disabled=false;}
  };
  q('[data-close]').onclick=()=>dialog.close();
  dialog.onclose=()=>{closed=true;++renderId;observer.disconnect();invalidate();map.remove();dialog.remove();};
}
