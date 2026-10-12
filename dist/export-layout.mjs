export function pageLayout(width,height,a4=false){
  if(!a4)return {pageWidth:width*.75+72,pageHeight:height*.75+100,left:36,bottom:40,width:width*.75,height:height*.75};
  if(typeof a4==='object'){
    const portrait=a4.orientation==='portrait',pageWidth=portrait?595.2756:841.8898,pageHeight=portrait?841.8898:595.2756;
    const margin=Math.max(0,Math.min(20,Number(a4.marginMm) || 0))*72/25.4;
    const availableWidth=pageWidth-2*margin,availableHeight=pageHeight-2*margin-32;
    const scale=Math.min(availableWidth/width,availableHeight/height);
    return {pageWidth,pageHeight,left:margin+(availableWidth-width*scale)/2,bottom:margin+14+(availableHeight-height*scale)/2,width:width*scale,height:height*scale};
  }
  const pageWidth=841.8898,pageHeight=595.2756,scale=Math.min((pageWidth-12)/width,(pageHeight-32)/height);
  return {pageWidth,pageHeight,left:(pageWidth-width*scale)/2,bottom:14+(pageHeight-32-height*scale)/2,width:width*scale,height:height*scale};
}

// Record physical pixel density so the landscape PNG prints at A4 (150 dpi).
export function pngPrintDensity(bytes,dpi=150){
 const chunk=new Uint8Array(21),view=new DataView(chunk.buffer);view.setUint32(0,9);
 chunk.set([112,72,89,115],4);view.setUint32(8,Math.round(dpi/.0254));view.setUint32(12,Math.round(dpi/.0254));chunk[16]=1;
 let crc=0xffffffff;for(const b of chunk.subarray(4,17)){crc^=b;for(let i=0;i<8;i++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}view.setUint32(17,(crc^0xffffffff)>>>0);
 const parts=[bytes.subarray(0,8)];let cursor=8;
 while(cursor<bytes.length){const size=new DataView(bytes.buffer,bytes.byteOffset+cursor,4).getUint32(0)+12,type=String.fromCharCode(...bytes.subarray(cursor+4,cursor+8));if(type!=='pHYs')parts.push(bytes.subarray(cursor,cursor+size));if(type==='IHDR')parts.push(chunk);cursor+=size;}
 const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let offset=0;for(const p of parts){out.set(p,offset);offset+=p.length;}return out;
}
