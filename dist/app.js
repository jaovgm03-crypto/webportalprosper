import { $, fmt, escapeHTML as esc, icon, layerNames, layerDescriptions, getData, showStatus } from './common.js';
import { initializeMapContext } from './map-context.js';
import { createMapPane } from './map-pane.js';
import { measure, validateFinished, segmentDistances } from './measurement-math.mjs';
import {sceneToWgs84} from './measurement-kml.mjs';
import {openFilesPanel} from './files-panel.js';
import {createTemporaryLayers} from './temporary-layers.js';

let months = [];
let panels = [];
let serial = 0;
let syncing = false;
let noticeTimer = null;
let measureMode = null; // 'distance' | 'area' | null
let draft = [];
let draftPanel = null;
let records = [];
let measureSerial = 0;
let portalManifest=null,temporary=null;

const mapTypes = ['ortho', 'terrain', 'contours'];

function notice(message) {
  const el = $('notice');
  if (!el) return;
  el.textContent = message;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => { el.textContent = ''; }, 5500);
}

function updateLayoutButtons() {
  const count = panels.length;
  $('compare').classList.toggle('active', count === 2);
  $('compare').setAttribute('aria-pressed', String(count === 2));
  $('sync').closest('.viewGroup').hidden = count < 2;
  panels.forEach(p => p.el.querySelector('.close').hidden = count < 2);

  $('panels').dataset.count = String(count);
  $('panels').hidden = count === 0;
  $('empty').hidden = count > 0;

  panels.forEach((p, i) => {
    const letter = p.el.querySelector('.panelLetter');
    if (letter) letter.textContent = String.fromCharCode(65 + i);
  });
}

function mapReference() {
  const p = panels.find(p => p.map && !p.disposed && Number.isFinite(p.map.getZoom()));
  return p ? { center: p.map.getCenter(), zoom: p.map.getZoom() } : null;
}

function syncMap(source) {
  if (syncing || !$('sync')?.checked || source.disposed) return;
  syncing = true;
  for (const p of panels) {
    if (p !== source && p.map && !p.disposed) {
      p.map.setView(source.map.getCenter(), source.map.getZoom(), { animate: false });
    }
  }
  syncing = false;
}

function syncCloud(source) {
  if (syncing || !$('sync')?.checked || source.disposed || !source.cloud) return;
  syncing = true;
  for (const p of panels) {
    if (p === source || !p.cloud || p.disposed) continue;
    p.cloud.camera.position.copy(source.cloud.camera.position);
    p.cloud.controls.target.copy(source.cloud.controls.target);
    p.cloud.controls.update();
    p.cloud.invalidate?.();
  }
  syncing = false;
}

function claimCloudMeasure(source){
  if(!measureMode)return false;
  if(draftPanel&&draftPanel!==source){notice('Continue no painel em que iniciou a medição.');return false;}
  draftPanel=source;return true;
}
function syncCloudMeasurement(source, points, drawing, action, type='distance') {
  if(draftPanel===source)updateMeasureBar();
  if (!$('sync')?.checked || panels.length < 2 || !source.cloud) return;
  for (const p of panels) {
    if (p === source || !p.cloud?.measurements || p.disposed) continue;
    if (action === 'clear') p.cloud.measurements.clear();
    else {
      p.cloud.measurements.stop();
      p.cloud.measurements.setExternalPath(points,type,action==='finish');
    }
  }
}

function showAttributes(panel, feature, segmentLength = 0, latlng = null, leafletLayer = null) {
  const props = feature.properties || {};
  const elev = Number(props.ELEV ?? props.elevation ?? 0);
  const isMaster = Math.round(elev) % 5 === 0;
  const fid = feature.id ?? props.fid ?? props.ID ?? '—';

  // Abre popup no mapa se fornecido
  if (latlng && panel.map) {
    const popupContent = `
      <div class="contourPopupCard">
        <div class="popupHead">
          <span class="popupBadge">Curva de Nível</span>
          <span class="popupMonth">${esc(panel.month.label)}</span>
        </div>
        <div class="popupMain">
          <div class="popupElevation">${fmt(elev, 2)} <small>m</small></div>
          <div class="popupTag ${isMaster ? 'master' : ''}">${isMaster ? 'Curva Mestra (5 m)' : 'Curva Intermediária (1 m)'}</div>
        </div>
        <div class="popupGrid">
          <div><span>Extensão do Trecho:</span> <strong>${fmt(segmentLength, 1)} m</strong></div>
          <div><span>Identificador:</span> <strong>#${esc(fid)}</strong></div>
        </div>
      </div>
    `;
    L.popup({ offset: [0, -8], className: 'customContourPopup' })
      .setLatLng(latlng)
      .setContent(popupContent + '<dl class="contourOriginalFields">' + Object.entries(props).map(([k,v]) => '<dt>'+esc(k)+'</dt><dd>'+esc(v ?? '—')+'</dd>').join('') + '</dl>')
      .openOn(panel.map);
  }

  // Preenche painel deslizante lateral
  $('attributeMonth').textContent = panel.month.label;
  $('attributes').innerHTML = `
    <dt>Cota de Altitude</dt><dd><strong>${fmt(elev, 2)} m</strong></dd>
    <dt>Classificação</dt><dd>${isMaster ? 'Curva Mestra (5 m)' : 'Curva Intermediária (1 m)'}</dd>
    <dt>Extensão do Trecho</dt><dd>${fmt(segmentLength, 2)} m</dd>
    <dt>Identificador (FID)</dt><dd>#${esc(fid)}</dd>
    <dt>Levantamento</dt><dd>${esc(panel.month.label)}</dd>
    ${Object.entries(props).map(([key,value]) => `<dt>${esc(key)}</dt><dd>${esc(value)}</dd>`).join('')}
  `;
  $('attributePanel').hidden = true;
}

const ctx = {
  attachTemporary:panel=>temporary?.attach(panel),
  singlePanel:()=>panels.length===1,
  cancelMeasurement:cancelMeasure,
  claimCloudMeasure,
  comparisonMaps: () => panels.filter(p=>!p.disposed && p.type==='ortho' && p.map),
  comparisonClouds: source => $('sync')?.checked ? panels.filter(p=>!p.disposed && p.cloud?.measurements) : [source],
  mapReference,
  syncMap,
  syncCloud,
  syncCloudMeasurement,
  cloudReference: p => panels.find(q => q !== p && q.cloud)?.cloud,
  isMeasuring: () => !!measureMode,
  addMeasurePoint,
  showAttributes,
  redrawMeasurements
};

function renderVolume(p) {
  const m = p.month;
  const i = months.indexOf(m);
  const prev = months[i - 1];
  const delta = prev ? m.volume - prev.volume : null;
  const max = Math.max(...months.map(r => r.volume));

  p.body.innerHTML = `
    <div class="volumeDashboard">
      <div class="volumeHeader">
        <span class="volSub">Relatório Volumétrico de Pilhas</span>
        <h2>${esc(m.label)}</h2>
      </div>

      <div class="volKpiGrid">
        <div class="volKpiCard highlight">
          <span class="volKpiLabel">Volume Total em Estoque</span>
          <div class="volKpiBig">${fmt(m.volume, 2)} <small>m³</small></div>
          <span class="volKpiNote">Medição topográfica das pilhas</span>
        </div>
        <div class="volKpiCard">
          <span class="volKpiLabel">Variação Líquida Mensal</span>
          <div class="volKpiMid ${delta > 0 ? 'pos' : delta < 0 ? 'neg' : ''}">
            ${delta === null ? 'Levantamento Inicial' : `${delta > 0 ? '+' : ''}${fmt(delta, 2)} m³`}
          </div>
          <span class="volKpiNote">${delta === null ? 'Primeiro levantamento' : `${delta > 0 ? 'Acréscimo' : 'Redução'} sobre mês anterior`}</span>
        </div>
        <div class="volKpiCard">
          <span class="volKpiLabel">Massa Total Estimada</span>
          <div class="volKpiMid">${fmt(m.tonnes, 1)} <small>toneladas</small></div>
          <span class="volKpiNote">Densidade informada: ${fmt(m.density, 1)} t/m³</span>
        </div>
      </div>

      <div class="volChartSection">
        <h3>Histórico Comparativo de Estoque (m³)</h3>
        <div class="chartBars">
          ${months.map(r => `
            <div class="chartRow ${r.id === m.id ? 'active' : ''}">
              <span class="chartLabel">${r.label}</span>
              <div class="chartBarTrack">
                <div class="chartBarFill" style="width: ${(r.volume / max) * 100}%"></div>
              </div>
              <strong class="chartValue">${fmt(r.volume, 1)} m³</strong>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="volTableSection">
        <h3>Quadro Resumo dos Levantamentos</h3>
        <table class="corporateTable">
          <thead>
            <tr>
              <th>Levantamento</th>
              <th>Volume (m³)</th>
              <th>Densidade</th>
              <th>Massa Estimada (t)</th>
              <th>Variação</th>
            </tr>
          </thead>
          <tbody>
            ${months.map((r, idx) => {
              const d = idx > 0 ? r.volume - months[idx - 1].volume : 0;
              return `
                <tr class="${r.id === m.id ? 'rowActive' : ''}">
                  <td><strong>${r.label}</strong></td>
                  <td>${fmt(r.volume, 2)}</td>
                  <td>${fmt(r.density, 1)} t/m³</td>
                  <td>${fmt(r.tonnes, 1)}</td>
                  <td>${idx === 0 ? '—' : (d > 0 ? `+${fmt(d, 1)}` : fmt(d, 1))} m³</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>
  `;

  p.foot.innerHTML = '<span class="footHint">Tabela disponível em Arquivos → Baixar dados.</span>';
}

async function addPanel(monthId, type, replace) {
  if (!replace && panels.length >= 2) return;
  if(measureMode)cancelMeasure();
  const month = months.find(m => m.id === monthId);
  if (!month || !layerNames[type]) throw Error('Mês ou camada inválidos.');

  const panel = { id: ++serial, month, type, disposed: false };
  const el = document.createElement('article');
  panel.el = el;
  el.className = 'panelCard';
  el.dataset.layer = type;
  el.setAttribute('aria-label', `${layerNames[type]} de ${month.label}`);

  // Menu superior do painel: Seletor de Mês e Seletor de Camada
  el.innerHTML = `
    <div class="panelCardHead">
      <span class="panelLetter"></span>
      <div class="panelSelects">
        <label class="panelSelectLabel" title="Alterar Mês deste painel">
          <select class="monthSelect" aria-label="Alterar Mês do painel">
            ${months.map(m => `<option value="${m.id}" ${m === month ? 'selected' : ''}>${esc(m.label)}</option>`).join('')}
          </select>
        </label>
        <span class="selectSep">/</span>
        <label class="panelSelectLabel" title="Alterar Camada deste painel">
          <select class="layerSelect" aria-label="Alterar Camada do painel">
            ${Object.entries(layerNames).map(([t, label]) => `<option value="${t}" ${type === t ? 'selected' : ''}>${label}</option>`).join('')}
          </select>
        </label>
      </div>
      <div class="panelCardActions">
        <button class="iconBtn expand" aria-label="Ampliar painel" title="Ampliar este painel">${icon('expand')}</button>
        <button class="iconBtn close" aria-label="Fechar painel" title="Fechar este painel">${icon('close')}</button>
      </div>
    </div>
    <div class="panelCardBody">
      <div class="panelStatus" role="status" aria-live="polite"></div>
    </div>
    <div class="panelCardFoot"></div>
  `;

  panel.body = el.querySelector('.panelCardBody');
  panel.status = el.querySelector('.panelStatus');
  panel.foot = el.querySelector('.panelCardFoot');

  if (replace) {
    const idx = panels.indexOf(replace);
    replace.disposed = true;
    replace.onDispose?.();
    if (draftPanel === replace) cancelMeasure();
    el.classList.toggle('expanded', replace.el.classList.contains('expanded'));
    replace.el.replaceWith(el);
    panels[idx] = panel;
    $('attributePanel').hidden = true;
  } else {
    panels.push(panel);
    $('panels').append(el);
  }

  el.querySelector('.close').onclick = () => removePanel(panel);
  el.querySelector('.expand').onclick = e => {
    const isExp = el.classList.toggle('expanded');
    e.currentTarget.setAttribute('aria-label', isExp ? 'Restaurar painéis' : 'Ampliar painel');
    e.currentTarget.classList.toggle('active', isExp);
    resizePanes();
  };

  // Troca de Mês ou Camada diretamente no cabeçalho superior do painel
  const mSel = el.querySelector('.monthSelect');
  const lSel = el.querySelector('.layerSelect');
  mSel.onchange = () => addPanel(mSel.value, panel.type, panel);
  lSel.onchange = () => addPanel(panel.month.id, lSel.value, panel);

  updateLayoutButtons();

  try {
    if (mapTypes.includes(type)) {
      await createMapPane(panel, ctx);
      if (measureMode) panel.map?.doubleClickZoom.disable();
    } else if (type === 'cloud') {
      showStatus(panel, 'Carregando modelo 3D de alta definição…');
      const { createCloudPane } = await import('./cloud-pane.js');
      if (!panel.disposed) await createCloudPane(panel, ctx);
    } else {
      renderVolume(panel);
    }
  } catch (e) {
    if (!panel.disposed) showStatus(panel, e.message, true);
  }
  return panel;
}

function removePanel(p) {
  if (p.disposed) return;
  if(measureMode)cancelMeasure();
  p.disposed = true;
  p.onDispose?.();
  p.el.remove();
  panels = panels.filter(q => q !== p);
  if (draftPanel === p) cancelMeasure();
  $('attributePanel').hidden = true;
  updateLayoutButtons();
  resizePanes();
}

function resizePanes() {
  requestAnimationFrame(() => {
    panels.forEach(p => {
      p.map?.invalidateSize({ pan: true, animate: false });
      p.cloud?.invalidate?.();
    });
  });
}

function measurementText(points, type) {
  const v = measure(window.geodesic, points, type);
  if (type === 'area') {
    const ha = v.area / 10000;
    return `${fmt(v.area, 2)} m² (${fmt(ha, 3)} ha)`;
  }
  return `${fmt(v.distance, 2)} m`;
}

function startMeasure(type) {
  if (!panels.some(p => p.map || p.cloud?.measurements)) {
    notice('Abra um mapa ou modelo 3D para realizar medições.');
    return;
  }
  measureMode = type;
  draft = [];
  draftPanel = null;
  panels.forEach(p=>p.cloud?.measurements?.start(type));
  $('attributePanel').hidden = true;
  document.body.classList.add('drawing');
  $('measureBar').hidden = false;
  updateMeasureBar();
  redrawMeasurements();
}

function cancelMeasure() {
  if(draftPanel?.cloud?.measurements?.drawing && $('sync')?.checked)panels.forEach(p=>p.cloud?.measurements?.clear());
  panels.forEach(p=>{const m=p.cloud?.measurements;if(m?.drawing)m.clear();else m?.stop();});
  measureMode = null;
  draft = [];
  draftPanel = null;
  document.body.classList.remove('drawing');
  $('measureBar').hidden = true;
  $('distance')?.classList.remove('active');
  $('distance')?.setAttribute('aria-pressed', 'false');
  $('area')?.classList.remove('active');
  $('area')?.setAttribute('aria-pressed', 'false');
  redrawMeasurements();
}

function addMeasurePoint(panel, latlng) {
  if (!measureMode) return;
  if (draftPanel && draftPanel !== panel) {
    notice('Continue a medição no mesmo painel onde marcou o primeiro vértice.');
    return;
  }
  const pt = { lat: latlng.lat, lng: latlng.lng };
  if (draft.length && Math.abs(pt.lat - draft.at(-1).lat) + Math.abs(pt.lng - draft.at(-1).lng) < 1e-10) return;

  draftPanel = panel;
  panels.forEach(p=>p.cloud?.measurements?.stop());
  draft.push(pt);
  updateMeasureBar();
  redrawMeasurements();
}

function updateMeasureBar() {
  if (!measureMode) return;
  const isArea = measureMode === 'area';
  $('distance')?.classList.toggle('active', !isArea);
  $('distance')?.setAttribute('aria-pressed', String(!isArea));
  $('area')?.classList.toggle('active', isArea);
  $('area')?.setAttribute('aria-pressed', String(isArea));

  const hint = isArea
    ? 'Área: Clique no mapa para marcar os vértices do polígono. Clique em Concluir ou pressione Enter.'
    : 'Distância: Clique no mapa para traçar a linha de medição. Clique em Concluir ou pressione Enter.';

  $('measureHint').textContent = hint;
  const cloud=draftPanel?.cloud?.measurements,count=cloud?cloud.count:draft.length;
  $('measureLive').textContent = cloud ? `${count} pontos · ${draftPanel.month.label} · Modelo 3D` : draft.length >= 2 ? `Medição: ${measurementText(draft, measureMode)}` : '';
  $('undoMeasure').disabled = count === 0;
  $('finishMeasure').disabled = count < (isArea ? 3 : 2);
  resizePanes();
}

function finishMeasure() {
  try {
    if(draftPanel?.cloud?.measurements){
      if(draftPanel.cloud.measurements.finish()){panels.forEach(p=>p.cloud?.measurements?.stop());cancelMeasure();notice('Medição 3D concluída.');}
      return;
    }
    if (measureMode === 'area' && draft.length > 3) {
      const d = measure(window.geodesic, [draft[0], draft.at(-1)], 'distance').distance;
      if (d < 0.01) draft.pop();
    }
    validateFinished(draft, measureMode);
    const values = measure(window.geodesic, draft, measureMode);
    if ((measureMode === 'area' ? values.area : values.distance) < 0.0001) {
      throw Error('Medição nula. Marque pontos com distância significativa.');
    }

    records.push({
      id: ++measureSerial,
      type: measureMode,
      points: [...draft],
      month: draftPanel.month.label,
      ...values
    });

    cancelMeasure();
    renderMeasurementList();
    notice('Medição concluída e salva no painel lateral.');
  } catch (e) {
    notice(e.message);
  }
}

function drawRecord(layer, r, isDraft = false) {
  if (!r.points.length) return;
  const isArea = r.type === 'area';
  const opts = {
    color: '#00507a',
    weight: 3,
    fillColor: '#9bbd00',
    fillOpacity: 0.25,
    dashArray: isDraft ? '6, 6' : null,
    interactive: false
  };

  if (r.points.length > 1) {
    if (isArea && r.points.length > 2) {
      L.polygon(r.points, opts).addTo(layer);
    } else {
      L.polyline(r.points, opts).addTo(layer);
    }
  }

  r.points.forEach((p, idx) => {
    L.circleMarker(p, {
      radius: idx === 0 ? 5 : 4,
      color: '#ffffff',
      weight: 2,
      fillColor: idx === 0 ? '#9bbd00' : '#00507a',
      fillOpacity: 1,
      interactive: false
    }).addTo(layer);
  });

  if (!isDraft) {
    const label = measurementText(r.points, r.type);
    L.marker(r.points.at(-1), {
      icon: L.divIcon({
        className: 'customMeasureLabel',
        html: `<span>${esc(label)}</span>`,
        iconSize: null
      }),
      interactive: false,
      keyboard: false
    }).addTo(layer);
  }
}

function redrawMeasurements() {
  for (const p of panels) {
    if (!p.measureLayer || p.disposed) continue;
    p.measureLayer.clearLayers();
    records.forEach(r => drawRecord(p.measureLayer, r));
    if (draft.length) {
      drawRecord(p.measureLayer, { type: measureMode, points: draft }, true);
    }
  }
}

function renderMeasurementList() {
  $('measureCount').textContent = String(records.length);
  const container = $('measurements');
  if (!container) return;

  if (!records.length) {
    container.innerHTML = '<p class="measureEmptyNotice">Nenhuma medição realizada. Use Distância ou Área na barra superior.</p>';
    redrawMeasurements();
    return;
  }

  container.innerHTML = records.map(r => `
    <div class="measureRecordCard" data-id="${r.id}">
      <div class="measureRecordHead">
        <span class="measureTypeTag ${r.type}">${r.type === 'area' ? 'Área' : 'Distância'}</span>
        <span class="measureRecordMonth">${esc(r.month)}</span>
        <button class="measureDeleteBtn" data-remove="${r.id}" title="Excluir medição" aria-label="Excluir medição ${r.id}">✕</button>
      </div>
      <div class="measureRecordValue">${measurementText(r.points, r.type)}</div>
      ${r.type === 'area' ? `<small class="measurePerimeter">Perímetro: ${fmt(r.distance, 2)} m</small>` : ''}
    </div>
  `).join('');

  redrawMeasurements();
}

function updateSidebarLabel() {
  const closed = document.body.classList.contains('sidebarHidden');
  $('sidebarToggle')?.setAttribute('aria-label', closed ? 'Abrir mapas e referências' : 'Recolher menu lateral');
  $('sidebarToggle')?.setAttribute('aria-expanded', String(!closed));
  resizePanes();
}

// Inicialização dos botões da barra superior
$('sidebarToggle').innerHTML = icon('menu');
$('distance').innerHTML = `${icon('distance')}<span>Distância</span>`;
$('area').innerHTML = `${icon('area')}<span>Área</span>`;
$('clearMeasures').innerHTML = icon('trash');

$('sidebarToggle').onclick = () => {
  document.body.classList.toggle('sidebarHidden');
  updateSidebarLabel();
};

$('distance').onclick = () => measureMode === 'distance' ? cancelMeasure() : startMeasure('distance');
$('area').onclick = () => measureMode === 'area' ? cancelMeasure() : startMeasure('area');
$('cancelMeasure').onclick = cancelMeasure;
$('finishMeasure').onclick = finishMeasure;
function getMeasurements(){
    const exported=records.map(r=>({type:r.type,month:r.month,source:'2D',points:r.points,attributes:r.type==='area'?{'Área horizontal (m²)':r.area,'Perímetro (m)':r.distance}:{'Distância horizontal (m)':r.distance}}));
    for(const p of panels){if(p.disposed)continue;const m=p.cloud?.measurements?.exportMeasurement();if(!m)continue;exported.push({type:m.type,month:p.month.label,source:'3D',points:m.vertices.map(v=>sceneToWgs84(v,ctx.sceneOriginUTM,p.month.cloudDisplayCRS)),attributes:m.attributes});}
    return exported;
}
$('filesButton').onclick = () => {
  if(!portalManifest||!temporary){notice('Aguarde o carregamento do portal.');return;}
  try{openFilesPanel({manifest:portalManifest,getPanels:()=>panels,getMeasurements,temporary,isMeasuring:()=>!!measureMode});}catch(e){notice(e.message);}
};
$('undoMeasure').onclick = () => {
  if(draftPanel?.cloud?.measurements){draftPanel.cloud.measurements.undo();updateMeasureBar();return;}
  draft.pop();
  if (!draft.length) draftPanel = null;
  updateMeasureBar();
  redrawMeasurements();
};

$('clearMeasures').onclick = () => {
  panels.forEach(p=>p.cloud?.measurements?.clear());
  if(draftPanel?.cloud)cancelMeasure();
  if (!records.length) return;
  if (confirm('Deseja remover todas as medições desta sessão?')) {
    records = [];
    cancelMeasure();
    renderMeasurementList();
  }
};

$('measurements')?.addEventListener('click', e => {
  const btn = e.target.closest('[data-remove]');
  if (btn) {
    records = records.filter(r => r.id !== Number(btn.dataset.remove));
    renderMeasurementList();
  }
});

$('closeAttributes')?.addEventListener('click', () => {
  $('attributePanel').hidden = true;
});

$('sidebarClose')?.addEventListener('click', () => {
  document.body.classList.add('sidebarHidden');
  updateSidebarLabel();
  $('sidebarToggle').focus();
});

// One comparison toggle preserves the first survey and its selected layer.
$('compare').addEventListener('click', async () => {
  if (!months.length) return;
  if (panels.length === 2) { removePanel(panels[1]); return; }
  if (!panels.length) await addPanel(months.at(-1).id, 'ortho');
  const current = panels[0];
  const index = months.indexOf(current.month);
  const other = months[index > 0 ? index - 1 : Math.min(1, months.length - 1)];
  await addPanel(other.id, current.type);
  resizePanes();
});

function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('lithos-theme', theme); } catch {}
  const dark = theme === 'dark';
  $('themeToggle').innerHTML = `${icon(dark ? 'sun' : 'moon')}<span>${dark ? 'Modo claro' : 'Modo escuro'}</span>`;
  $('themeToggle').setAttribute('aria-pressed', String(dark));
  $('themeToggle').title = dark ? 'Ativar modo claro' : 'Ativar modo escuro';
  for (const p of panels) {
    p.cloud?.scene.background?.set(dark ? '#172632' : '#e2e8ec');
    p.cloud?.invalidate?.();
  }
}
$('themeToggle').onclick = () => setTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
setTheme(document.documentElement.dataset.theme || 'light');

document.addEventListener('keydown', e => {
  if(e.target.closest('dialog'))return;
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === 'Escape') {
    if (window.matchMedia('(max-width: 768px)').matches) {
      document.body.classList.add('sidebarHidden');
      updateSidebarLabel();
    }
    cancelMeasure();
    $('attributePanel').hidden = true;
    panels.forEach(p => p.el.classList.remove('expanded'));
    resizePanes();
  }
  if (e.key === 'Enter' && measureMode && !e.target.closest('button')) {
    e.preventDefault();
    finishMeasure();
  }
  if (e.key === 'Backspace' && measureMode) {
    e.preventDefault();
    $('undoMeasure').click();
  }
});

// Inicialização da aplicação
try {
  const manifest = await getData('data/manifest.json');
  portalManifest=manifest;
  months = manifest.months;
  temporary=createTemporaryLayers({months,notice,isMeasuring:()=>!!measureMode,addMeasurePoint});
  ctx.terrainClassification = manifest.terrainClassification;
  ctx.sceneOriginElevation = manifest.sceneOriginUTM[2];
  ctx.sceneOriginUTM = manifest.sceneOriginUTM;
  initializeMapContext(manifest);
  document.querySelector('.portalMeta .period').textContent = `${months[0].label} — ${months.at(-1).label}`;
  document.querySelector('.portalMeta .count').textContent = `${months.length} levantamentos`;
  if (window.matchMedia('(max-width: 768px)').matches) {
    document.body.classList.add('sidebarHidden');
  }
  updateSidebarLabel();

  await addPanel(months.at(-1).id, 'ortho');
} catch (e) {
  notice(e.message);
  $('empty').hidden = false;
}

const headerSizeObserver=new ResizeObserver(entries=>{document.documentElement.style.setProperty('--portal-header-height',entries[0].target.getBoundingClientRect().height+'px');});headerSizeObserver.observe(document.querySelector('.corpHeader'));
