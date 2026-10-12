import {escapeHTML as esc,getData} from './common.js';
import {featureFolder,groundOverlay,kmlDocument} from './kml-features.mjs';
import {zipStore} from './kmz-archive.mjs';
import {measurementsKml} from './measurement-kml.mjs';

export function openFilesPanel({manifest,getPanels,getMeasurements,temporary,isMeasuring}){
  const dialog=document.createElement('dialog');dialog.className='exportDialog filesDialog';dialog.setAttribute('aria-labelledby','filesTitle');
  dialog.innerHTML=`<header class="filesHeader"><div><h2 id="filesTitle">Arquivos</h2><p>Dados do empreendimento e arquivos da sua sessão</p></div><button type="button" data-close aria-label="Fechar arquivos">✕</button></header>
    <div class="filesTabs" role="tablist" aria-label="Operações com arquivos"><button id="downloadTab" role="tab" aria-selected="true" aria-controls="downloadPane" data-tab="download">Baixar dados</button><button id="importTab" role="tab" aria-selected="false" tabindex="-1" aria-controls="importPane" data-tab="import">Carregar arquivo</button></div>
    <section id="downloadPane" role="tabpanel" aria-labelledby="downloadTab">
      <div class="filesDownloadGrid"><fieldset><legend>Camadas de referência</legend><p class="filesMuted">Camadas completas, mesmo quando ocultas no mapa.</p>${manifest.references.map(r=>`<label class="fileChoice"><input type="checkbox" data-reference="${esc(r.id)}"><span>${esc(r.label)}</span></label>`).join('')}</fieldset>
      <div><fieldset><legend>Levantamento</legend><label class="filesMonth">Mês <select aria-label="Mês para download">${manifest.months.map(m=>`<option value="${m.id}">${esc(m.label)}</option>`).join('')}</select></label><label class="fileChoice"><input type="checkbox" data-contours>Curvas de Nível 1m</label><label class="fileChoice"><input type="checkbox" data-ortho>Ortofoto 2D</label><p class="filesMuted">Ortofoto com resolução otimizada para o portal. Incluída no KMZ para uso sem conexão.</p></fieldset>
      <fieldset><legend>Minhas medições</legend><label class="fileChoice"><input type="checkbox" data-measurements>Incluir medições da sessão</label><p class="filesMuted" data-measure-note></p></fieldset></div></div>
      <div class="filesActions"><button type="button" class="filesPrimary" data-prepare>Preparar KMZ</button><a data-download hidden>Baixar KMZ</a><span data-selection class="filesMuted">Selecione as camadas desejadas.</span></div>
      <details class="filesVisual"><summary>Exportar visualização · PDF ou imagem 3D</summary><p class="filesMuted">Cada arquivo corresponde a um painel e seu respectivo mês.</p><div data-visual></div><a href="data/volumes.csv" download="PROSPER_volumes.csv" class="filesCsv">Tabela de volumes · CSV</a></details>
    </section>
    <section id="importPane" role="tabpanel" aria-labelledby="importTab" hidden>
      <div class="filesImportBox"><h3>Carregar KML ou KMZ temporário</h3><p>Pontos, linhas e polígonos sobre os mapas 2D. O arquivo é lido neste navegador e não é enviado ao servidor.</p><label class="filesFileLabel">Selecione um arquivo KML ou KMZ<input type="file" accept=".kml,.kmz,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz" aria-label="Selecionar arquivo KML ou KMZ"></label><p class="filesMuted">KML até 16 MB · KMZ até 32 MB · Seis arquivos por sessão. Imagens e modelos 3D incorporados não são importados.</p><button type="button" data-import class="filesPrimary" disabled>Carregar no mapa</button><button type="button" data-cancel-import hidden>Cancelar leitura</button></div>
      <div class="filesTemporaryHead"><h3>Meus arquivos temporários</h3><button type="button" data-mine>Voltar à mina</button></div><div data-temporary></div><p class="filesMuted">Ao recarregar ou fechar esta aba, os arquivos temporários são removidos do portal. O original no seu dispositivo permanece intacto.</p>
    </section><p class="filesStatus" role="status" aria-live="polite"></p>`;
  const q=s=>dialog.querySelector(s),status=q('.filesStatus');let url=null,closed=false,busy=false,importController=null;
  const exports=getPanels().filter(p=>!p.disposed),defaultMonth=exports[0]?.month.id||manifest.months.at(-1).id;
  q('select').value=defaultMonth;
  const records=getMeasurements();q('[data-measurements]').disabled=!records.length;q('[data-measure-note]').textContent=records.length?`${records.length} medições disponíveis. Inclui medições 2D e a medição 3D atual de cada painel, projetadas em 2D.`:'Conclua uma medição para disponibilizá-la aqui.';
  const visuals=q('[data-visual]');
  for(const [i,p] of exports.entries()){
    const action=p.type==='ortho'?p.exportPDF:p.cloud?.measurements?.saveImage;if(!action)continue;
    const button=document.createElement('button');button.textContent=`${p.type==='ortho'?'PDF georreferenciado':'Imagem 3D (PNG)'} · ${p.month.label}${exports.length>1?' · Painel '+String.fromCharCode(65+i):''}`;
    button.onclick=()=>{if(isMeasuring()){status.textContent='Conclua ou cancele a medição antes de exportar.';return;}dialog.close();action();};visuals.append(button);
  }
  if(!visuals.children.length){const p=document.createElement('p');p.textContent='Abra uma ortofoto para exportar PDF ou um modelo 3D para salvar sua imagem.';visuals.append(p);}
  function invalidate(){if(url)URL.revokeObjectURL(url);url=null;q('[data-download]').hidden=true;q('[data-prepare]').hidden=false;}
  function selection(){return Array.from(dialog.querySelectorAll('#downloadPane input:checked'));}
  function update(){invalidate();const n=selection().length;q('[data-prepare]').disabled=!n||busy;q('[data-selection]').textContent=n?`${n} ${n===1?'item selecionado':'itens selecionados'} · KMZ`:'Selecione as camadas desejadas.';status.textContent='';}
  q('#downloadPane').addEventListener('change',update);
  function switchTab(name){for(const b of dialog.querySelectorAll('[data-tab]')){const active=b.dataset.tab===name;b.setAttribute('aria-selected',String(active));b.tabIndex=active?0:-1;}q('#downloadPane').hidden=name!=='download';q('#importPane').hidden=name!=='import';status.textContent='';}
  q('.filesTabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(b)switchTab(b.dataset.tab);};
  q('.filesTabs').onkeydown=e=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();const name=e.key==='Home'?'download':e.key==='End'?'import':q('[aria-selected="true"]').dataset.tab==='download'?'import':'download';switchTab(name);q(`[data-tab="${name}"]`).focus();}};
  q('[data-close]').onclick=()=>dialog.close();
  q('[data-prepare]').onclick=async()=>{
    if(isMeasuring()&&q('[data-measurements]').checked){status.textContent='Conclua ou cancele a medição antes de exportar.';return;}
    busy=true;const inputs=Array.from(dialog.querySelectorAll('#downloadPane input, #downloadPane select'));inputs.forEach(el=>el.disabled=true);q('[data-prepare]').disabled=true;status.textContent='Preparando as camadas selecionadas…';
    try{
      const folders=[],assets=[],month=manifest.months.find(m=>m.id===q('select').value);
      for(const input of dialog.querySelectorAll('[data-reference]:checked')){const ref=manifest.references.find(r=>r.id===input.dataset.reference);folders.push(featureFolder(ref.label,await getData(ref.url),ref));}
      if(q('[data-contours]').checked)folders.push(featureFolder('Curvas de Nível 1m · '+month.label,await getData(`data/${month.id}/contours.geojson`),{color:'#000000',weight:1}));
      if(q('[data-ortho]').checked){
        status.textContent='Preparando a ortofoto georreferenciada. Aguarde…';const catalogue=await getData('data/kmz-orthophotos.json'),ortho=catalogue[month.id];if(!ortho)throw Error('Ortofoto KMZ indisponível para este mês.');
        const response=await fetch(ortho.url);if(!response.ok)throw Error('Não foi possível carregar a ortofoto. Tente novamente.');const data=new Uint8Array(await response.arrayBuffer());if(data.length!==ortho.bytes)throw Error('Download da ortofoto incompleto. Tente novamente.');
        const name=`images/ortofoto_${month.id}.png`;assets.push({name,data});folders.push(groundOverlay('Ortofoto · '+month.label,name,ortho.bounds));
      }
      if(q('[data-measurements]').checked){const kml=measurementsKml(records);folders.push('<Folder><name>Medições da sessão</name>'+kml.slice(kml.indexOf('</name>')+7,kml.lastIndexOf('</Document>'))+'</Folder>');}
      if(closed)return;const data=zipStore([{name:'doc.kml',data:kmlDocument(folders)},...assets]);
      url=URL.createObjectURL(new Blob([data],{type:'application/vnd.google-earth.kmz'}));const link=q('[data-download]');link.href=url;link.download=`PROSPER_Mina_Cuite_${q('[data-contours]').checked||q('[data-ortho]').checked?month.id:'camadas'}_v1_2.kmz`;link.hidden=false;q('[data-prepare]').hidden=true;link.focus();
      status.textContent=`KMZ pronto · ${(data.length/1024/1024).toLocaleString('pt-BR',{maximumFractionDigits:1})} MB. Atributos e coordenadas preservados; estilos podem variar entre aplicativos.`;
    }catch(e){if(!closed)status.textContent=e.message;}finally{busy=false;inputs.forEach(el=>el.disabled=false);q('[data-measurements]').disabled=!records.length;q('[data-prepare]').disabled=!selection().length;}
  };
  const input=q('input[type=file]');input.onchange=()=>{q('[data-import]').disabled=!input.files.length;status.textContent='';};
  q('[data-import]').onclick=async()=>{
    const file=input.files[0];if(!file)return;
    importController=new AbortController();input.disabled=true;q('[data-import]').disabled=true;q('[data-cancel-import]').hidden=false;status.textContent='Verificando e lendo o arquivo…';
    try{const result=await temporary.load(file,importController.signal);if(!closed){status.textContent=`${result.data.features.length} feições carregadas. ${result.outside?'Este arquivo está fora da extensão dos levantamentos disponíveis. ':''}${result.warnings.join(' ')} O enquadramento foi mantido; use Localizar no mapa para ir até o arquivo.`;input.value='';}}
    catch(e){if(!closed)status.textContent=e.message;}
    finally{input.disabled=false;q('[data-import]').disabled=!input.files.length;q('[data-cancel-import]').hidden=true;importController=null;}
  };
  q('[data-cancel-import]').onclick=()=>importController?.abort();
  const renderTemporary=()=>temporary.renderList(q('[data-temporary]'),{onLocate:()=>dialog.close()});
  const unsubscribe=temporary.onChange(renderTemporary);renderTemporary();q('[data-mine]').onclick=()=>{if(temporary.returnToMine())dialog.close();else status.textContent='Abra uma ortofoto ou mapa 2D para voltar à mina.';};
  dialog.onclose=()=>{closed=true;importController?.abort();unsubscribe();invalidate();dialog.remove();};
  document.body.append(dialog);dialog.showModal();update();
}
