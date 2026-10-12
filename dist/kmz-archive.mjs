// ZIP32: write portable KMZ archives; read only bounded KML payloads.
export const KMZ_LIMITS = Object.freeze({fileBytes:32*1024*1024, expandedBytes:64*1024*1024, kmlBytes:16*1024*1024, entries:256, features:10000, coordinates:300000});
const encoder=new TextEncoder();
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=(n>>>1)^((n&1)?0xedb88320:0);return n>>>0;});
export function crc32(data){let crc=0xffffffff;for(const b of data)crc=(crc>>>8)^crcTable[(crc^b)&255];return (crc^0xffffffff)>>>0;}
function safeName(name){return name.length>0&&name.length<256&&!name.startsWith('/')&&!name.includes('\\')&&!name.includes(':')&&!name.split('/').some(p=>p==='..')&&!/[\x00-\x1f]/.test(name);}
export function zipStore(entries){
  if(!entries.length||entries.length>65534)throw Error('Quantidade de arquivos inválida.');
  const names=new Set();let offset=0;
  const items=entries.map(({name,data})=>{if(!safeName(name)||names.has(name))throw Error('Nome de arquivo inválido ou repetido.');names.add(name);const bytes=typeof data==='string'?encoder.encode(data):data;const item={name:encoder.encode(name),bytes,crc:crc32(bytes),offset};offset+=30+item.name.length+bytes.length;return item;});
  const centralOffset=offset,centralSize=items.reduce((n,e)=>n+46+e.name.length,0);
  if(offset+centralSize+22>160*1024*1024)throw Error('Seleção muito grande. Baixe menos camadas por vez.');
  const out=new Uint8Array(offset+centralSize+22),v=new DataView(out.buffer),u16=(i,n)=>v.setUint16(i,n,true),u32=(i,n)=>v.setUint32(i,n,true);
  for(const e of items){const o=e.offset;u32(o,0x04034b50);u16(o+4,20);u16(o+6,0x800);u16(o+12,33);u32(o+14,e.crc);u32(o+18,e.bytes.length);u32(o+22,e.bytes.length);u16(o+26,e.name.length);out.set(e.name,o+30);out.set(e.bytes,o+30+e.name.length);
    const c=offset;u32(c,0x02014b50);u16(c+4,20);u16(c+6,20);u16(c+8,0x800);u16(c+14,33);u32(c+16,e.crc);u32(c+20,e.bytes.length);u32(c+24,e.bytes.length);u16(c+28,e.name.length);u32(c+42,o);out.set(e.name,c+46);offset+=46+e.name.length;}
  u32(offset,0x06054b50);u16(offset+8,items.length);u16(offset+10,items.length);u32(offset+12,centralSize);u32(offset+16,centralOffset);return out;
}
export async function readKmz(data,limits=KMZ_LIMITS){
  if(data.length>limits.fileBytes)throw Error('O KMZ excede o limite de 32 MB.');
  const v=new DataView(data.buffer,data.byteOffset,data.byteLength),u16=i=>v.getUint16(i,true),u32=i=>v.getUint32(i,true);
  const need=(o,n)=>{if(o<0||o+n>data.length)throw Error('KMZ incompleto ou corrompido.');};
  need(0,22);let end=-1;
  for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--){if(u32(i)===0x06054b50&&i+22+u16(i+20)===data.length){end=i;break;}}
  if(end<0)throw Error('O arquivo não é um KMZ válido.');
  const count=u16(end+10),centralSize=u32(end+12),central=u32(end+16);
  if(u16(end+4)||u16(end+6)||u16(end+8)!==count||!count||count>limits.entries||central+centralSize!==end)throw Error('Estrutura de KMZ não suportada.');
  need(central,centralSize);let cursor=central,total=0;const names=new Set(),files=[];
  for(let i=0;i<count;i++){
    need(cursor,46);if(u32(cursor)!==0x02014b50)throw Error('Índice do KMZ corrompido.');
    const flags=u16(cursor+8),method=u16(cursor+10),crc=u32(cursor+16),compressed=u32(cursor+20),expanded=u32(cursor+24),n=u16(cursor+28),x=u16(cursor+30),c=u16(cursor+32),start=u32(cursor+42);
    need(cursor+46,n+x+c);const name=new TextDecoder().decode(data.subarray(cursor+46,cursor+46+n));
    if(!safeName(name)||names.has(name.toLowerCase()))throw Error('KMZ com nomes de arquivos inválidos ou repetidos.');names.add(name.toLowerCase());
    if(flags&1||flags&0x40||![0,8].includes(method)||u16(cursor+34))throw Error('KMZ protegido por senha ou com compressão não suportada.');
    total+=expanded;if(total>limits.expandedBytes)throw Error('O conteúdo descompactado do KMZ é muito grande.');
    need(start,30);if(u32(start)!==0x04034b50||u16(start+6)!==flags||u16(start+8)!==method)throw Error('Cabeçalho do KMZ inconsistente.');
    const ln=u16(start+26),lx=u16(start+28),payload=start+30+ln+lx;need(start+30,ln+lx);need(payload,compressed);
    if(payload+compressed>central||new TextDecoder().decode(data.subarray(start+30,start+30+ln))!==name)throw Error('Dados do KMZ inconsistentes.');
    files.push({name,method,crc,compressed,expanded,payload});cursor+=46+n+x+c;
  }
  if(cursor!==end)throw Error('Índice do KMZ inconsistente.');
  const kml=files.filter(f=>/\.kml$/i.test(f.name));
  if(kml.length!==1)throw Error('O KMZ deve conter um único documento KML com pontos, linhas ou polígonos.');
  const file=kml[0];if(file.expanded>limits.kmlBytes)throw Error('As feições excedem o limite de 16 MB. Divida o arquivo.');
  let bytes=data.subarray(file.payload,file.payload+file.compressed);
  if(file.method===8){
    let stream;try{stream=new DecompressionStream('deflate-raw');}catch{throw Error('Atualize seu navegador para importar este KMZ.');}
    const reader=new Blob([bytes]).stream().pipeThrough(stream).getReader(),chunks=[];let size=0;
    try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limits.kmlBytes||size>file.expanded){await reader.cancel();throw Error('Conteúdo descompactado maior que o permitido.');}chunks.push(value);}}
    catch(e){throw Error('Não foi possível descompactar o KMZ: '+e.message);}
    bytes=new Uint8Array(size);let at=0;for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
  }
  if(bytes.length!==file.expanded||crc32(bytes)!==file.crc)throw Error('KMZ corrompido: a integridade dos dados não foi confirmada.');
  let encoding='utf-8';if(bytes[0]===255&&bytes[1]===254)encoding='utf-16le';else if(bytes[0]===254&&bytes[1]===255)encoding='utf-16be';
  try{return new TextDecoder(encoding,{fatal:true}).decode(bytes);}catch{throw Error('Codificação de texto não suportada. Salve o KMZ em UTF-8.');}
}
