const cross=(a,b,c)=>(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);
export function polygonArea(points){return Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.z-q.x*p.z;},0))/2;}
export function validatePolygon(points){
  if(points.length<3)throw Error('Marque pelo menos três vértices.');
  for(let i=0;i<points.length;i++){
    const a=points[i],b=points[(i+1)%points.length];
    if(Math.hypot(b.x-a.x,b.z-a.z)<.01)throw Error('Existem vértices repetidos. Desfaça o último ponto.');
    for(let j=i+1;j<points.length;j++){
      if(j===i+1 || (i===0&&j===points.length-1))continue;
      const c=points[j],d=points[(j+1)%points.length];
      const ab1=cross(a,b,c),ab2=cross(a,b,d),cd1=cross(c,d,a),cd2=cross(c,d,b);
      const on=(p,q,r)=>Math.abs(cross(p,q,r))<1e-8&&r.x>=Math.min(p.x,q.x)-1e-8&&r.x<=Math.max(p.x,q.x)+1e-8&&r.z>=Math.min(p.z,q.z)-1e-8&&r.z<=Math.max(p.z,q.z)+1e-8;
      if((ab1*ab2<0&&cd1*cd2<0)||on(a,b,c)||on(a,b,d)||on(c,d,a)||on(c,d,b))throw Error('O polígono cruza a si mesmo. Desfaça o ponto e ajuste o contorno.');
    }
  }
  if(polygonArea(points)<.01)throw Error('A área deve ser maior que zero.');
}
// Clip each surface triangle to the triangulated footprint. The 3D/2D ratio is
// constant inside a planar mesh triangle, so no elevation exaggeration enters the result.
export function surfaceArea(points,triangles,positions,indices){
  validatePolygon(points);
  const minX=Math.min(...points.map(p=>p.x)),maxX=Math.max(...points.map(p=>p.x)),minZ=Math.min(...points.map(p=>p.z)),maxZ=Math.max(...points.map(p=>p.z));
  let covered=0,surface=0,minY=Infinity,maxY=-Infinity;
  const footprints=triangles.map(t=>t.map(i=>points[i]));
  for(let i=0;i<indices.length;i+=3){
    const t=[0,1,2].map(j=>{const k=indices[i+j]*3;return {x:positions[k],y:positions[k+1],z:positions[k+2]};});
    if(Math.max(...t.map(p=>p.x))<minX||Math.min(...t.map(p=>p.x))>maxX||Math.max(...t.map(p=>p.z))<minZ||Math.min(...t.map(p=>p.z))>maxZ)continue;
    const [a,b,c]=t,projected=polygonArea(t);if(projected<1e-10)continue;
    const ux=b.x-a.x,uy=b.y-a.y,uz=b.z-a.z,vx=c.x-a.x,vy=c.y-a.y,vz=c.z-a.z;
    const ratio=Math.hypot(uy*vz-uz*vy,uz*vx-ux*vz,ux*vy-uy*vx)/(2*projected);
    for(const tri of footprints){
      let clipped=t;const orientation=Math.sign(cross(...tri));
      for(let j=0;j<3&&clipped.length;j++){
        const start=tri[j],end=tri[(j+1)%3],next=[];
        for(let k=0;k<clipped.length;k++){
          const p=clipped[k],q=clipped[(k+1)%clipped.length],dp=cross(start,end,p)*orientation,dq=cross(start,end,q)*orientation;
          if(dp>=-1e-9)next.push(p);
          if((dp<0&&dq>0)||(dp>0&&dq<0)){const f=dp/(dp-dq);next.push({x:p.x+(q.x-p.x)*f,y:p.y+(q.y-p.y)*f,z:p.z+(q.z-p.z)*f});}
        }
        clipped=next;
      }
      if(clipped.length<3)continue;
      const area=polygonArea(clipped);covered+=area;surface+=area*ratio;
      for(const p of clipped){minY=Math.min(minY,p.y);maxY=Math.max(maxY,p.y);}
    }
  }
  const planar=polygonArea(points);
  if(Math.abs(covered-planar)>Math.max(.02,planar*.00001))throw Error('O polígono inclui uma área sem dados do MDT. Ajuste o contorno.');
  return {planar,surface,minY,maxY};
}
