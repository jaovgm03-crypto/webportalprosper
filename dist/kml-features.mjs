import {KMZ_LIMITS} from './kmz-archive.mjs';
export const xml=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const child=(el,name)=>Array.from(el.children).find(e=>e.localName===name);
const children=(el,name)=>Array.from(el.children).filter(e=>e.localName===name);
const text=(el,name)=>child(el,name)?.textContent?.trim()||'';
const geometryNames=new Set(['Point','LineString','Polygon','MultiGeometry']);

// DOMParser treats XML as data. Never insert imported markup into the live DOM.
export async function parseKml(source,Parser=globalThis.DOMParser,limits=KMZ_LIMITS){
  if(source.length>limits.kmlBytes||/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(source)||source.includes('\0'))throw Error('O arquivo contém declarações XML não permitidas.');
  const doc=new Parser().parseFromString(source,'application/xml');
  if(doc.getElementsByTagName('parsererror').length||doc.documentElement.localName!=='kml')throw Error('O documento está corrompido ou não contém KML válido.');
  const all=doc.getElementsByTagName('*');if(all.length>100000)throw Error('O arquivo contém elementos demais. Divida-o em arquivos menores.');
  const placemarks=[],warnings=new Set();
  for(const el of all){
    if(['NetworkLink','NetworkLinkControl','Update'].includes(el.localName))throw Error('Arquivos com conexões externas ou atualizações automáticas não são permitidos. Salve as feições diretamente no arquivo.');
    if(['GroundOverlay','ScreenOverlay','PhotoOverlay','Model','Track','MultiTrack'].includes(el.localName))warnings.add('Imagens, modelos e trajetórias especiais não são importados; somente pontos, linhas e polígonos.');
    if(el.localName==='Placemark')placemarks.push(el);
  }
  if(placemarks.length>limits.features)throw Error('O arquivo excede 10.000 feições.');
  let coordinateCount=0;const bounds=[Infinity,Infinity,-Infinity,-Infinity];
  function coords(el,min,ring=false){
    const raw=text(el,'coordinates');if(!raw)throw Error('Feição sem coordenadas.');
    const result=raw.split(/\s+/).map(item=>{
      const values=item.split(',');if(values.length<2||values.length>3||values.some(v=>!v.trim()))throw Error('Coordenada inválida.');
      const [lng,lat,alt]=values.map(Number);
      if(!Number.isFinite(lng)||!Number.isFinite(lat)||Math.abs(lng)>180||Math.abs(lat)>90||(values.length===3&&!Number.isFinite(alt)))throw Error('Coordenadas fora do padrão geográfico WGS84.');
      if(++coordinateCount>limits.coordinates)throw Error('O arquivo excede 300.000 vértices. Divida-o em arquivos menores.');
      bounds[0]=Math.min(bounds[0],lng);bounds[1]=Math.min(bounds[1],lat);bounds[2]=Math.max(bounds[2],lng);bounds[3]=Math.max(bounds[3],lat);return [lng,lat];
    });
    if(ring&&(result[0][0]!==result.at(-1)[0]||result[0][1]!==result.at(-1)[1]))result.push([...result[0]]);
    if(result.length<min)throw Error('Feição com número insuficiente de vértices.');return result;
  }
  function geometry(el,depth=0){
    if(depth>16)throw Error('Estrutura de geometrias muito complexa.');
    if(el.localName==='Point'){const c=coords(el,1);if(c.length!==1)throw Error('Ponto com coordenadas inconsistentes.');return {type:'Point',coordinates:c[0]};}
    if(el.localName==='LineString')return {type:'LineString',coordinates:coords(el,2)};
    if(el.localName==='Polygon'){
      const outer=child(child(el,'outerBoundaryIs')||el,'LinearRing');if(!outer)throw Error('Polígono sem contorno externo.');
      return {type:'Polygon',coordinates:[coords(outer,4,true),...children(el,'innerBoundaryIs').map(inner=>{const ring=child(inner,'LinearRing');if(!ring)throw Error('Anel interno inválido.');return coords(ring,4,true);})]};
    }
    const geometries=Array.from(el.children).filter(e=>geometryNames.has(e.localName)).map(e=>geometry(e,depth+1));
    return geometries.length?{type:'GeometryCollection',geometries}:null;
  }
  const features=[];
  for(let i=0;i<placemarks.length;i++){
    const mark=placemarks[i],els=Array.from(mark.children).filter(e=>geometryNames.has(e.localName));
    if(!els.length)continue;
    const gs=els.map(e=>geometry(e)).filter(Boolean);if(!gs.length)continue;
    const properties=Object.create(null),name=text(mark,'name');if(name)properties.Nome=name.slice(0,1000);
    const desc=text(mark,'description');if(desc)properties.Descrição=desc.slice(0,4000);
    const ext=child(mark,'ExtendedData');if(ext){const fields=Array.from(ext.getElementsByTagName('*')).filter(e=>e.localName==='Data'||e.localName==='SimpleData');if(fields.length>100)throw Error('Feição com atributos demais.');for(const field of fields){const key=field.getAttribute('name');if(key&&key.length<=150)properties[key]=(field.localName==='Data'?text(field,'value'):field.textContent).slice(0,4000);}}
    features.push({type:'Feature',properties,geometry:gs.length===1?gs[0]:{type:'GeometryCollection',geometries:gs}});
    if(i%100===0)await new Promise(resolve=>setTimeout(resolve,0));
  }
  if(!features.length)throw Error('Nenhum ponto, linha ou polígono encontrado. Imagens de ortofoto e modelos 3D não são aceitos na importação.');
  return {data:{type:'FeatureCollection',features},bounds,coordinateCount,warnings:[...warnings]};
}

function coordinateText(coords){return coords.map(p=>{if(!Array.isArray(p)||!Number.isFinite(p[0])||!Number.isFinite(p[1])||Math.abs(p[0])>180||Math.abs(p[1])>90)throw Error('Coordenadas inválidas para exportação.');return `${p[0]},${p[1]}`;}).join(' ');}
function ringKml(points,outer){
  const coords=points.map(p=>p.slice(0,2));if(coords.length<3)throw Error('Polígono inválido.');
  if(coords[0][0]===coords.at(-1)[0]&&coords[0][1]===coords.at(-1)[1])coords.pop();
  const signed=coords.reduce((a,p,i)=>{const q=coords[(i+1)%coords.length];return a+p[0]*q[1]-q[0]*p[1];},0);
  if((outer&&signed<0)||(!outer&&signed>0))coords.reverse();coords.push([...coords[0]]);
  const tag=outer?'outerBoundaryIs':'innerBoundaryIs';return `<${tag}><LinearRing><coordinates>${coordinateText(coords)}</coordinates></LinearRing></${tag}>`;
}
export function geometryKml(g){
  const ground='<altitudeMode>clampToGround</altitudeMode>';
  switch(g.type){
    case 'Point':return `<Point>${ground}<coordinates>${coordinateText([g.coordinates])}</coordinates></Point>`;
    case 'LineString':return `<LineString><tessellate>1</tessellate>${ground}<coordinates>${coordinateText(g.coordinates)}</coordinates></LineString>`;
    case 'Polygon':return `<Polygon><tessellate>1</tessellate>${ground}${g.coordinates.map((r,i)=>ringKml(r,i===0)).join('')}</Polygon>`;
    case 'MultiPoint':case 'MultiLineString':case 'MultiPolygon':return `<MultiGeometry>${g.coordinates.map(c=>geometryKml({type:g.type.slice(5),coordinates:c})).join('')}</MultiGeometry>`;
    case 'GeometryCollection':return `<MultiGeometry>${g.geometries.map(geometryKml).join('')}</MultiGeometry>`;
    default:throw Error('Geometria não suportada: '+g.type);
  }
}
function kmlColor(color,alpha=1){const h=/^#[\da-f]{6}$/i.test(color)?color.slice(1):'234a73';return Math.round(alpha*255).toString(16).padStart(2,'0')+h.slice(4,6)+h.slice(2,4)+h.slice(0,2);}
export function featureFolder(label,data,style={}){
  const stroke=kmlColor(style.color||'#234a73'),fill=kmlColor(style.color||'#234a73',style.fill?(style.fillOpacity??.5):0);
  const kstyle=`<Style><LineStyle><color>${stroke}</color><width>${style.weight??2}</width></LineStyle><PolyStyle><color>${fill}</color><fill>${style.fill?1:0}</fill><outline>1</outline></PolyStyle><IconStyle><color>${stroke}</color></IconStyle></Style>`;
  return `<Folder><name>${xml(label)}</name>${data.features.map((f,i)=>{
    const p=f.properties||{},name=p.Nome??p.nome??p.Name??p.name??(p.ELEV!=null?`Cota ${p.ELEV} m`:`${label} ${i+1}`);
    return `<Placemark><name>${xml(name)}</name>${kstyle}<ExtendedData>${Object.entries(p).map(([k,v])=>`<Data name="${xml(k)}"><value>${xml(typeof v==='object'&&v!==null?JSON.stringify(v):v)}</value></Data>`).join('')}</ExtendedData>${geometryKml(f.geometry)}</Placemark>`;
  }).join('')}</Folder>`;
}
export function groundOverlay(label,href,bounds){const [[s,w],[n,e]]=bounds;return `<GroundOverlay><name>${xml(label)}</name><Icon><href>${xml(href)}</href></Icon><altitudeMode>clampToGround</altitudeMode><LatLonBox><north>${n}</north><south>${s}</south><east>${e}</east><west>${w}</west></LatLonBox></GroundOverlay>`;}
export function kmlDocument(folders){return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>WebGIS Prosper — Mina Cuité</name>${folders.join('')}</Document></kml>`;}
export function boundsOverlap(a,b){return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}
