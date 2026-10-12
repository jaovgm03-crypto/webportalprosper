// Coordinates are metric scene coordinates: x=easting, y=elevation, z=-northing.
export function terrainSampler(positions, indices, width, height) {
  const valid = new Set();
  for(let i=0;i<indices.length;i+=3) valid.add([indices[i],indices[i+1],indices[i+2]].sort((a,b)=>a-b).join(','));
  const x0=positions[0], z0=positions[2];
  const dx=positions[3]-x0, dz=positions[width*3+2]-z0;
  return (x,z)=>{
    const fx=(x-x0)/dx, fz=(z-z0)/dz, col=Math.floor(fx), row=Math.floor(fz);
    if(col<0||row<0||col>=width-1||row>=height-1) return null;
    const u=fx-col,v=fz-row,a=row*width+col,b=a+1,c=a+width,d=c+1;
    const tri=u+v<=1?[a,b,c]:[b,c,d];
    if(!valid.has(tri.slice().sort((a,b)=>a-b).join(','))) return null;
    const y=u+v<=1?positions[a*3+1]*(1-u-v)+positions[b*3+1]*u+positions[c*3+1]*v:
      positions[b*3+1]*(1-v)+positions[c*3+1]*(1-u)+positions[d*3+1]*(u+v-1);
    return {x,y,z};
  };
}
export function profileAlong(vertices,sample,step=2) {
  const samples=[]; let horizontal=0, surface=0, ascent=0, descent=0;
  for(let i=1;i<vertices.length;i++) {
    const a=vertices[i-1],b=vertices[i],length=Math.hypot(b.x-a.x,b.z-a.z);
    if(length<0.01) throw Error('Escolha pontos separados no terreno.');
    const n=Math.max(1,Math.ceil(length/step));
    for(let j=i===1?0:1;j<=n;j++) {
      const t=j/n,p=sample(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t);
      if(!p) throw Error('O traçado atravessa uma área sem dados do terreno. Escolha outro percurso.');
      const previous=samples.at(-1);
      if(previous) { const dh=Math.hypot(p.x-previous.x,p.z-previous.z),dy=p.y-previous.y; surface+=Math.hypot(dh,dy); ascent+=Math.max(0,dy);descent+=Math.max(0,-dy); }
      samples.push({...p,distance:horizontal+length*t});
    }
    horizontal+=length;
  }
  const delta=samples.at(-1).y-samples[0].y;
  return {samples,horizontal,surface,ascent,descent,delta,slope:100*delta/horizontal,angle:Math.atan2(delta,horizontal)*180/Math.PI};
}
