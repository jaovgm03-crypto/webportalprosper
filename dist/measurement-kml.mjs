import {zipStore} from './kmz-archive.mjs';
const xml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));

// WGS84 UTM inverse. Scene axes are east, elevation, minus north.
export function sceneToWgs84(point,origin,crs){
  const match=/^EPSG:(326|327)(\d{2})$/.exec(crs||'');
  if(!match||Number(match[2])<1||Number(match[2])>60)throw Error('Sistema de coordenadas 3D não suportado para exportação.');
  if(!origin||![point.x,point.z,origin[0],origin[1]].every(Number.isFinite))throw Error('Coordenadas 3D inválidas.');
  const a=6378137,e2=0.0066943799901413165,k=.9996,ep=e2/(1-e2),x=origin[0]+point.x-500000,y=origin[1]-point.z-(match[1]==='327'?10000000:0);
  const mu=y/k/(a*(1-e2/4-3*e2**2/64-5*e2**3/256)),e1=(1-Math.sqrt(1-e2))/(1+Math.sqrt(1-e2));
  const f=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+(21*e1**2/16-55*e1**4/32)*Math.sin(4*mu)+151*e1**3/96*Math.sin(6*mu)+1097*e1**4/512*Math.sin(8*mu);
  const n=a/Math.sqrt(1-e2*Math.sin(f)**2),r=a*(1-e2)/(1-e2*Math.sin(f)**2)**1.5,t=Math.tan(f)**2,c=ep*Math.cos(f)**2,d=x/(n*k);
  const lat=f-n*Math.tan(f)/r*(d*d/2-(5+3*t+10*c-4*c*c-9*ep)*d**4/24+(61+90*t+298*c+45*t*t-252*ep-3*c*c)*d**6/720);
  const lng=(Number(match[2])*6-183)*Math.PI/180+(d-(1+2*t+c)*d**3/6+(5-2*c+28*t-3*c*c+8*ep+24*t*t)*d**5/120)/Math.cos(f);
  return {lat:lat*180/Math.PI,lng:lng*180/Math.PI};
}

export function measurementsKml(records){
  if(!records.length)throw Error('Conclua uma medição antes de exportar.');
  const placemarks=records.map((r,i)=>{
    const points=r.points.map(p=>({...p})),area=r.type==='area';
    if(!['area','distance'].includes(r.type)||points.length<(area?3:2)||points.some(p=>!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180))throw Error('Medição com coordenadas inválidas.');
    if(area){if(points[0].lat===points.at(-1).lat&&points[0].lng===points.at(-1).lng)points.pop();const signed=points.reduce((n,p,j)=>{const q=points[(j+1)%points.length];return n+p.lng*q.lat-q.lng*p.lat;},0);if(signed<0)points.reverse();points.push({...points[0]});}
    const coords=points.map(p=>`${p.lng.toFixed(9)},${p.lat.toFixed(9)}`).join(' '),geometry=area?`<Polygon><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon>`:`<LineString><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><coordinates>${coords}</coordinates></LineString>`;
    const fields={'Levantamento':r.month,'Origem':r.source||'2D','Geometria':'2D — sem altitude',...(r.attributes||{})};
    return `<Placemark><name>${xml((area?'Área':'Distância')+' '+(i+1)+' · '+r.month)}</name><styleUrl>#measurement</styleUrl><ExtendedData>${Object.entries(fields).map(([k,v])=>`<Data name="${xml(k)}"><displayName>${xml(k)}</displayName><value>${xml(v)}</value></Data>`).join('')}</ExtendedData>${geometry}</Placemark>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>WebGIS Prosper — Medições</name><Style id="measurement"><LineStyle><color>ff00e6ff</color><width>2</width></LineStyle><PolyStyle><color>3300e6ff</color><fill>1</fill><outline>1</outline></PolyStyle></Style>${placemarks}</Document></kml>`;
}

// KMZ uses the shared archive writer. KML is only the internal document.
export function kmlToKmz(kml){return zipStore([{name:'doc.kml',data:kml}]);}
