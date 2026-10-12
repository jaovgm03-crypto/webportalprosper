import {readKmz,KMZ_LIMITS} from './kmz-archive.mjs';

export function importFormat(name,size){
  const format=/\.(kml|kmz)$/i.exec(name)?.[1].toLowerCase();
  if(!format)throw Error('Selecione um arquivo KML ou KMZ.');
  const limit=format==='kml'?KMZ_LIMITS.kmlBytes:KMZ_LIMITS.fileBytes;
  if(size>limit)throw Error(`O arquivo ${format.toUpperCase()} excede ${limit/1024/1024} MB. Divida-o antes de carregar.`);
  return format;
}

export async function readImportFile(bytes,name){
  const format=importFormat(name,bytes.byteLength);
  if(format==='kmz')return readKmz(bytes);
  let encoding='utf-8';
  if(bytes[0]===255&&bytes[1]===254)encoding='utf-16le';
  else if(bytes[0]===254&&bytes[1]===255)encoding='utf-16be';
  try{return new TextDecoder(encoding,{fatal:true}).decode(bytes);}
  catch{throw Error('Não foi possível ler o texto do KML. Salve o arquivo em UTF-8 ou UTF-16.');}
}
