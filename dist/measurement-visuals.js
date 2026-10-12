import * as THREE from 'three';
import {fmt} from './common.js';

export function drawPlan(canvas,vertices,{renderer,scene,camera,mesh,group,originElevation},width=700,height=240){
  canvas.width=width;canvas.height=height;const c=canvas.getContext('2d');
  const minX=Math.min(...vertices.map(p=>p.x)),maxX=Math.max(...vertices.map(p=>p.x)),minZ=Math.min(...vertices.map(p=>p.z)),maxZ=Math.max(...vertices.map(p=>p.z));
  const scale=Math.min((width-120)/Math.max(1,maxX-minX),(height-80)/Math.max(1,maxZ-minZ)),cx=(minX+maxX)/2,cz=(minZ+maxZ)/2;
  const cam=new THREE.OrthographicCamera(-width/scale/2,width/scale/2,height/scale/2,-height/scale/2,.1,100000);
  cam.up.set(0,0,-1);cam.position.set(cx,50000,cz);cam.lookAt(cx,0,cz);cam.updateMatrixWorld();
  const size=renderer.getSize(new THREE.Vector2()),ratio=renderer.getPixelRatio(),exag=mesh.scale.y,visible=group.visible;
  try{group.visible=false;mesh.scale.y=1;renderer.setPixelRatio(1);renderer.setSize(width,height,false);renderer.render(scene,cam);c.drawImage(renderer.domElement,0,0);}finally{mesh.scale.y=exag;group.visible=visible;renderer.setPixelRatio(ratio);renderer.setSize(size.x,size.y,false);renderer.render(scene,camera);}
  const xy=p=>({x:width/2+(p.x-cx)*scale,y:height/2+(p.z-cz)*scale});
  c.beginPath();vertices.forEach((p,i)=>{const q=xy(p);i?c.lineTo(q.x,q.y):c.moveTo(q.x,q.y);});c.closePath();c.fillStyle='#ffe60022';c.fill();c.strokeStyle='#ffe600';c.lineWidth=2;c.stroke();
  c.font='bold 11px Arial';
  const points=vertices.map(xy);
  points.forEach(q=>{c.fillStyle='#d14b2f';c.strokeStyle='#fff';c.lineWidth=1.2;c.beginPath();c.arc(q.x,q.y,3.5,0,Math.PI*2);c.fill();c.stroke();});
  c.fillStyle='#ffffffee';c.fillRect(width-37,7,30,44);c.fillStyle='#16394f';c.fillText('N',width-27,21);c.beginPath();c.moveTo(width-23,25);c.lineTo(width-29,44);c.lineTo(width-17,44);c.closePath();c.fill();
  c.fillStyle='#ffffffee';c.fillRect(8,height-32,110,28);c.strokeStyle='#16394f';c.beginPath();c.moveTo(15,height-12);c.lineTo(85,height-12);c.stroke();c.fillStyle='#16394f';c.fillText(fmt(70/scale,1)+' m',15,height-19);
  return points;
}

export function highlightPlanVertex(canvas,points,index,vertices,originElevation){
  if(index<0||!points[index])return;
  const c=canvas.getContext('2d'),p=points[index],text=`V${index+1} · Cota ${fmt(vertices[index].y+originElevation,2)} m`;
  c.strokeStyle='#fff';c.lineWidth=3;c.beginPath();c.arc(p.x,p.y,7,0,Math.PI*2);c.stroke();c.strokeStyle='#d14b2f';c.lineWidth=2;c.stroke();
  c.font='bold 12px Arial';const w=c.measureText(text).width+16,x=Math.max(5,Math.min(canvas.width-w-5,p.x+12)),y=Math.max(5,Math.min(canvas.height-30,p.y-34));
  c.fillStyle='#fff';c.fillRect(x,y,w,25);c.strokeStyle='#a7bdcb';c.lineWidth=1;c.strokeRect(x,y,w,25);c.fillStyle='#16394f';c.fillText(text,x+8,y+17);
}

export function captureSheet({renderer,scene,camera,panel,result,graph,metrics,mode,a4}){
  renderer.render(scene,camera);const source=document.createElement('canvas');source.width=renderer.domElement.width;source.height=renderer.domElement.height;source.getContext('2d').drawImage(renderer.domElement,0,0);
  const canvas=document.createElement('canvas');canvas.width=a4?1754:Math.max(1000,Math.min(2400,source.width));canvas.height=a4?1240:Math.round(canvas.width*source.height/source.width)+650;
  const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height,margin=12,contentWidth=w-2*margin,top=44,contentHeight=h-top-24;
  c.fillStyle='#fff';c.fillRect(0,0,w,h);c.fillStyle='#16394f';c.font='bold 24px Arial';c.fillText('WebGIS Prosper · Mina Cuité',margin,28);c.font='18px Arial';c.fillText(panel.month.label+' · Monitoramento Topográfico e Ambiental',margin+365,28);
  const fit=(img,x,y,width,height)=>{const s=Math.min(width/img.width,height/img.height);c.drawImage(img,x+(width-img.width*s)/2,y+(height-img.height*s)/2,img.width*s,img.height*s);};
  if(!result)fit(source,margin,top,contentWidth,contentHeight);
  else{
    const sideBySide=source.width/source.height<1.6;
    let x=margin,y=top,paneWidth=contentWidth,paneHeight;
    if(sideBySide){const sceneWidth=Math.round(contentWidth*.59);fit(source,margin,top,sceneWidth,contentHeight);x=margin+sceneWidth+24;paneWidth=contentWidth-sceneWidth-24;paneHeight=contentHeight;}
    else{const summaryHeight=126,available=contentHeight-summaryHeight-20;const sceneHeight=available*(source.height/source.width)/(source.height/source.width+graph.height/graph.width);fit(source,margin,top,contentWidth,sceneHeight);y=top+sceneHeight+20;paneHeight=contentHeight-sceneHeight-20;}
    c.fillStyle='#16394f';c.font='bold 25px Arial';c.fillText(mode==='area'?'Planta do terreno':'Perfil topográfico',x,y+28);
    const columns=sideBySide?1:2;
    c.font='18px Arial';metrics.forEach(([k,v],i)=>c.fillText(k+': '+v,x+(i%columns)*paneWidth/columns,y+62+Math.floor(i/columns)*28));
    const summaryHeight=columns===1?164:110;fit(graph,x,y+summaryHeight,paneWidth,Math.max(50,paneHeight-summaryHeight));
  }
  c.font='15px Arial';c.fillStyle='#526776';c.fillText('Lithos Geologia · Prosper Mineração',margin,h-6);return canvas;
}
