export function offerDownload(blob,filename,image=false,preview=null){
  document.querySelector('.exportDialog')?.close();
  const url=URL.createObjectURL(blob),dialog=document.createElement('dialog');dialog.className='exportDialog';
  const title=document.createElement('h2');title.textContent=image?'Imagem 3D pronta':'PDF georreferenciado pronto';dialog.append(title);
  const info=document.createElement('p');info.textContent=image?'Confira a vista e as medições antes de guardar a imagem.':'O arquivo preserva a área da ortofoto e as medições 2D. Para impressão, use tamanho real (100%).';dialog.append(info);
  if(image||preview){const img=document.createElement('img');img.src=preview||url;img.alt=image?'Imagem exportada do modelo 3D e suas medições':'Prévia do mapa exportado no PDF';dialog.append(img);}
  const link=document.createElement('a');link.href=url;link.download=filename;link.textContent=image?'Baixar PNG':'Baixar PDF';dialog.append(link);
  const close=document.createElement('button');close.textContent='Fechar';close.onclick=()=>dialog.close();dialog.append(close);
  dialog.onclose=()=>{URL.revokeObjectURL(url);dialog.remove();};document.body.append(dialog);dialog.showModal();
}
