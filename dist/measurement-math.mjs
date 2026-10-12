export function measure(geo,points,type){
 if(!['distance','area'].includes(type))throw Error('Tipo de medição inválido');
 for(const p of points)if(!Number.isFinite(p.lat)||!Number.isFinite(p.lng)||Math.abs(p.lat)>90||Math.abs(p.lng)>180)throw Error('Coordenada inválida');
 const polygon=new geo.PolygonArea.PolygonArea(geo.Geodesic.WGS84,type==='distance');
 points.forEach(p=>polygon.AddPoint(p.lat,p.lng));const r=polygon.Compute(false,true);
 return {distance:r.perimeter,area:Math.abs(r.area||0)};
}
function orient(a,b,c){return (b.lng-a.lng)*(c.lat-a.lat)-(b.lat-a.lat)*(c.lng-a.lng);}
function onSegment(a,b,p){return Math.abs(orient(a,b,p))<1e-14&&p.lng>=Math.min(a.lng,b.lng)-1e-12&&p.lng<=Math.max(a.lng,b.lng)+1e-12&&p.lat>=Math.min(a.lat,b.lat)-1e-12&&p.lat<=Math.max(a.lat,b.lat)+1e-12;}
function intersects(a,b,c,d){const x=orient(a,b,c),y=orient(a,b,d),z=orient(c,d,a),w=orient(c,d,b);return x*y<0&&z*w<0||onSegment(a,b,c)||onSegment(a,b,d)||onSegment(c,d,a)||onSegment(c,d,b);}
export function selfIntersects(points){for(let i=0;i<points.length;i++)for(let j=i+1;j<points.length;j++){if(j===i+1||i===0&&j===points.length-1)continue;if(intersects(points[i],points[(i+1)%points.length],points[j],points[(j+1)%points.length]))return true;}return false;}
export function validateFinished(points,type){if(points.length<(type==='area'?3:2))throw Error(type==='area'?'Marque pelo menos três pontos.':'Marque pelo menos dois pontos.');if(type==='area'&&selfIntersects(points))throw Error('O contorno cruza a si mesmo. Desfaça os últimos pontos.');}
export function segmentDistances(geo, points) {
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) {
    const d = geo.Geodesic.WGS84.Inverse(points[i].lat, points[i].lng, points[i + 1].lat, points[i + 1].lng).s12;
    segs.push(d);
  }
  return segs;
}
