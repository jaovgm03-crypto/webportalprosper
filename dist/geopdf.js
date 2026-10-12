import {fmt} from './common.js';
import {openPrintEditor} from './print-editor.js';
import {pageLayout} from './export-layout.mjs';

export function pdfBytes(jpeg,width,height,bounds,title='WebGIS Prosper - Versao 1.1',a4=false) {
  const encoder=new TextEncoder(),parts=[],offsets=[0];let length=0;
  const add=v=>{const b=typeof v==='string'?encoder.encode(v):v;parts.push(b);length+=b.length;};
  const obj=(n,s)=>{offsets[n]=length;add(`${n} 0 obj\n${s}\nendobj\n`);};
  const layout=pageLayout(width,height,a4),{width:w,height:h,left,bottom,pageWidth,pageHeight}=layout;
  const [west,south,east,north]=bounds;
  // ISO 32000 geospatial viewport. LPTS runs bottom-left, top-left, top-right, bottom-right.
  const wkt='PROJCS["WGS 84 / Pseudo-Mercator",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Mercator_1SP"],PARAMETER["central_meridian",0],PARAMETER["scale_factor",1],PARAMETER["false_easting",0],PARAMETER["false_northing",0],UNIT["metre",1],AUTHORITY["EPSG","3857"]]';
  add('%PDF-1.7\n');
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Map 4 0 R >> /Font << /F1 7 0 R >> >> /Contents 5 0 R /VP [6 0 R] >>`);
  offsets[4]=length;add(`4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);add(jpeg);add('\nendstream\nendobj\n');
  const safe=title.replace(/[\\()]/g,'\\$&').replace(/[^\x20-\x7e]/g,c=>c.charCodeAt(0)<256?'\\'+c.charCodeAt(0).toString(8).padStart(3,'0'):'');
  const commands=`q ${w} 0 0 ${h} ${left} ${bottom} cm /Map Do Q\nBT /F1 10 Tf 6 ${pageHeight-12} Td (${safe}) Tj ET\nBT /F1 7 Tf 6 5 Td (WGS84 / EPSG:3857 - Imprimir em tamanho real, sem ajustar a pagina.) Tj ET`;
  obj(5,`<< /Length ${encoder.encode(commands).length} >>\nstream\n${commands}\nendstream`);
  obj(6,`<< /Type /Viewport /Name (Ortofoto georreferenciada) /BBox [${left} ${bottom} ${left+w} ${bottom+h}] /Measure << /Type /Measure /Subtype /GEO /Bounds [0 0 0 1 1 1 1 0] /LPTS [0 0 0 1 1 1 1 0] /GPTS [${south} ${west} ${north} ${west} ${north} ${east} ${south} ${east}] /GCS << /Type /PROJCS /EPSG 3857 /WKT (${wkt}) >> >> >>`);
  obj(7,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const xref=length;add('xref\n0 8\n0000000000 65535 f \n');for(let i=1;i<=7;i++)add(`${String(offsets[i]).padStart(10,'0')} 00000 n \n`);add(`trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  const output=new Uint8Array(length);let cursor=0;for(const p of parts){output.set(p,cursor);cursor+=p.length;}return output;
}

async function captureOrtho(panel,ctx) {
  if(panel.type!=='ortho')throw Error('A exportação georreferenciada está disponível somente na ortofoto 2D.');
  if(ctx.isMeasuring())throw Error('Conclua ou cancele a medição antes de exportar.');
  const map=panel.map,size=map.getSize(),bounds=map.getBounds(),zoom=map.getZoom(),center=map.getCenter();
  if(size.x<1||size.y<1)throw Error('O mapa não está visível.');
  const canvas=document.createElement('canvas'),pixelRatio=ctx.printPixelRatio||1;canvas.width=Math.round(size.x*pixelRatio);canvas.height=Math.round(size.y*pixelRatio);const c=canvas.getContext('2d');c.scale(pixelRatio,pixelRatio);c.fillStyle='#e5e9eb';c.fillRect(0,0,size.x,size.y);
  const layers=[];map.eachLayer(l=>layers.push(l));
  const labelUnit=ctx.printLayout?size.x/pageLayout(size.x,size.y,ctx.printLayout).width:1;
  const position=ll=>map.latLngToContainerPoint(ll);
  // Respect rendering panes and insertion order, including transparent overlays.
  layers.sort((a,b)=>Number(getComputedStyle(a.getPane?.()||map.getPane('overlayPane')).zIndex||0)-Number(getComputedStyle(b.getPane?.()||map.getPane('overlayPane')).zIndex||0));
  for(const layer of layers){
    if(layer instanceof L.TileLayer){
      const container=layer.getContainer(),origin=map.getContainer().getBoundingClientRect();
      if(layer.isLoading())throw Error('Aguarde o carregamento do satélite antes de exportar.');
      for(const tile of container.querySelectorAll('.leaflet-tile')){
        const r=tile.getBoundingClientRect();if(r.right<origin.left||r.left>origin.right||r.bottom<origin.top||r.top>origin.bottom)continue;
        const img=tile.tagName==='IMG'?tile:tile.querySelector('img');if(!img?.complete||!img.naturalWidth)throw Error('Não foi possível carregar parte do satélite. Ajuste o enquadramento ou tente novamente quando a conexão estiver disponível.');
        const ir=img.getBoundingClientRect();c.save();c.beginPath();c.rect(r.left-origin.left,r.top-origin.top,r.width,r.height);c.clip();c.drawImage(img,ir.left-origin.left,ir.top-origin.top,ir.width,ir.height);c.restore();
      }
      if(layer.isLoading())throw Error('Aguarde o carregamento do satélite antes de exportar.');
    }else if(layer instanceof L.ImageOverlay){
      const img=layer.getElement();if(!img?.complete||!img.naturalWidth)throw Error('Aguarde a ortofoto carregar.');const b=layer.getBounds(),nw=position(b.getNorthWest()),se=position(b.getSouthEast());c.save();c.globalAlpha=layer.options.opacity??1;c.drawImage(img,nw.x,nw.y,se.x-nw.x,se.y-nw.y);c.restore();
    }else if(layer instanceof L.Path){
      const o=layer.options;c.save();c.strokeStyle=o.color||'#000';c.fillStyle=o.fillColor||o.color||'#000';c.lineWidth=o.weight??1;c.setLineDash(o.dashArray?String(o.dashArray).split(/[ ,]+/).map(Number):[]);c.beginPath();
      if(layer instanceof L.CircleMarker){const p=position(layer.getLatLng());c.arc(p.x,p.y,layer.getRadius(),0,Math.PI*2);}else{const trace=items=>{if(items[0]?.lat!==undefined){items.forEach((ll,i)=>{const p=position(ll);i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y);});if(layer instanceof L.Polygon)c.closePath();}else items.forEach(trace);};trace(layer.getLatLngs());}
      if(o.fill){c.globalAlpha=o.fillOpacity??.2;c.fill('evenodd');}if(o.stroke!==false){c.globalAlpha=o.opacity??1;c.stroke();}c.restore();
    }else if(layer instanceof L.Marker&&layer.getElement()?.classList.contains('customMeasureLabel')){
      const el=layer.getElement(),p=position(layer.getLatLng()),text=el.textContent;c.font=`bold ${11*labelUnit}px Roboto, Arial`;const w=c.measureText(text).width+12*labelUnit;c.fillStyle='#123043';c.fillRect(p.x,p.y,w,22*labelUnit);c.fillStyle='#fff';c.fillText(text,p.x+6*labelUnit,p.y+15*labelUnit);
    }
  }
  const layout=pageLayout(size.x,size.y,ctx.printLayout??ctx.singlePanel?.());
  const unit=ctx.printLayout?size.x/layout.width:1,W=size.x/unit,H=size.y/unit;
  c.save();c.scale(unit,unit);c.font='10px Roboto, Arial';
  const text=(s,x,y)=>{const w=c.measureText(s).width;c.fillStyle='rgba(255,255,255,.9)';c.fillRect(x-2,y-11,w+4,15);c.fillStyle='#182e3e';c.fillText(s,x,y);};
  for(let i=1;i<4;i++){const x=W*i/4,y=H*i/4;c.strokeStyle='rgba(255,255,255,.65)';c.lineWidth=.7;c.setLineDash([4,4]);c.beginPath();c.moveTo(x,0);c.lineTo(x,H);c.moveTo(0,y);c.lineTo(W,y);c.stroke();text(map.containerPointToLatLng([x*unit,0]).lng.toFixed(5)+'°',Math.min(x+3,W-90),15);text(map.containerPointToLatLng([0,y*unit]).lat.toFixed(5)+'°',4,y);}
  c.setLineDash([]);text('N',W-29,28);c.fillStyle='#123043';c.beginPath();c.moveTo(W-25,34);c.lineTo(W-32,55);c.lineTo(W-18,55);c.closePath();c.fill();
  const a=map.containerPointToLatLng([0,size.y/2]),b=map.containerPointToLatLng([100*unit,size.y/2]);const meters=window.geodesic.Geodesic.WGS84.Inverse(a.lat,a.lng,b.lat,b.lng).s12;const scale=meters/(100*unit*(layout.width/size.x)*.0254/72);
  c.strokeStyle='#123043';c.lineWidth=2;c.beginPath();c.moveTo(15,H-32);c.lineTo(115,H-32);c.stroke();text(`${fmt(meters,1)} m · 1:${Math.round(scale).toLocaleString('pt-BR')}`,15,H-42);
  text('Lithos Geologia · '+panel.month.label,15,H-10);
  const attribution=map.getContainer().querySelector('.leaflet-control-attribution')?.textContent||'';
  if(attribution.includes('Esri'))text('Satélite © Esri e fornecedores',Math.max(15,W-230),H-10);
  c.restore();
  if(map.getZoom()!==zoom||!map.getCenter().equals(center))throw Error('O enquadramento mudou. Exporte novamente.');
  let jpeg;try{const data=canvas.toDataURL('image/jpeg',.96).split(',')[1];jpeg=Uint8Array.from(atob(data),v=>v.charCodeAt(0));}catch{throw Error('O mapa de fundo impediu a captura. Selecione Sem mapa de fundo e tente novamente.');}
  return {jpeg,width:canvas.width,height:canvas.height,bounds:[bounds.getWest(),bounds.getSouth(),bounds.getEast(),bounds.getNorth()],canvas,title:panel.month.label};
}

export async function exportOrthoPDF(panel,ctx){
  openPrintEditor(panel,ctx,captureOrtho,pdfBytes);
}

export function comparisonPDF(maps){
  const enc=new TextEncoder(),parts=[],offsets=[0];let length=0;
  const add=v=>{const b=typeof v==='string'?enc.encode(v):v;parts.push(b);length+=b.length;};
  const obj=(n,v)=>{offsets[n]=length;add(n+' 0 obj\n'+v+'\nendobj\n');};
  const height=Math.max(...maps.map(m=>m.height))*.75,width=maps.reduce((n,m)=>n+m.width*.75,0)+72;
  add('%PDF-1.7\n');obj(1,'<< /Type /Catalog /Pages 2 0 R >>');obj(2,'<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+width+' '+(height+100)+'] /Resources << /XObject << '+maps.map((m,i)=>'/Map'+i+' '+(6+i*2)+' 0 R').join(' ')+' >> /Font << /F1 5 0 R >> >> /Contents 4 0 R /VP ['+maps.map((m,i)=>(7+i*2)+' 0 R').join(' ')+'] >>');
  let x=36,commands='';maps.forEach((m,i)=>{const w=m.width*.75,h=m.height*.75;commands+='q '+w+' 0 0 '+h+' '+x+' 40 cm /Map'+i+' Do Q\n';x+=w;});
  commands+='BT /F1 12 Tf 36 '+(height+70)+' Td (WebGIS Prosper - Comparacao de levantamentos) Tj ET';
  obj(4,'<< /Length '+enc.encode(commands).length+' >>\nstream\n'+commands+'\nendstream');obj(5,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  x=36;maps.forEach((m,i)=>{const n=6+i*2,w=m.width*.75,h=m.height*.75;offsets[n]=length;add(n+' 0 obj\n<< /Type /XObject /Subtype /Image /Width '+m.width+' /Height '+m.height+' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length '+m.jpeg.length+' >>\nstream\n');add(m.jpeg);add('\nendstream\nendobj\n');const [west,south,east,north]=m.bounds;
    obj(n+1,'<< /Type /Viewport /Name (Mapa '+(i+1)+') /BBox ['+x+' 40 '+(x+w)+' '+(40+h)+'] /Measure << /Type /Measure /Subtype /GEO /Bounds [0 0 0 1 1 1 1 0] /LPTS [0 0 0 1 1 1 1 0] /GPTS ['+[south,west,north,west,north,east,south,east].join(' ')+'] /GCS << /Type /PROJCS /EPSG 3857 >> >> >>');x+=w;});
  const count=6+maps.length*2,xref=length;add('xref\n0 '+count+'\n0000000000 65535 f \n');for(let i=1;i<count;i++)add(String(offsets[i]).padStart(10,'0')+' 00000 n \n');add('trailer\n<< /Size '+count+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF');const out=new Uint8Array(length);let cursor=0;for(const b of parts){out.set(b,cursor);cursor+=b.length;}return out;
}
