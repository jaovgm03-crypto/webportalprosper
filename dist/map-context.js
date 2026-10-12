import { $, escapeHTML as esc, getData } from './common.js';

// All backgrounds use public HTTPS map services, with attribution visible on every map.
const imagery = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const attribution = 'Tiles © Esri — Esri, Vantor, Earthstar Geographics, and the GIS User Community';
export const basemaps = [
  { id:'none', label:'Sem mapa de fundo', description:'Somente o levantamento e as referências' },
  { id:'satellite', label:'Satélite', description:'Esri World Imagery', url:imagery }
];
let selected = 'none', references = [], enabled = new Set();
const activeMaps = new Set(), cache = new Map();

export function initializeMapContext(manifest) {
  references = manifest.references || [];
  // Apenas as camadas principais começam visíveis; as demais ficam disponíveis no menu.
  enabled = new Set(references.filter(r => r.id === 'area_diretamente_afetada' || r.id === 'rede_drenagem').map(r => r.id));
  $('basemapOptions').innerHTML = basemaps.map(b => `<label class="basemapOption"><input type="radio" name="basemap" value="${b.id}" ${b.id === selected ? 'checked' : ''}><span class="basemapSwatch ${b.id}" aria-hidden="true"></span><span><strong>${esc(b.label)}</strong><small>${esc(b.description)}</small></span></label>`).join('');
  $('referenceOptions').innerHTML = references.map(r => `<label class="referenceOption"><input type="checkbox" value="${esc(r.id)}" ${enabled.has(r.id) ? 'checked' : ''}><span class="referenceSymbol ${r.id}" style="--reference-color:${esc(r.color)}" aria-hidden="true"></span><span><strong>${esc(r.label)}</strong></span></label>`).join('');
  $('basemapOptions').onchange = e => {
    if (!e.target.matches('input')) return;
    selected = e.target.value;
    for (const state of activeMaps) applyBackground(state);
    updateHint();
  };
  $('referenceOptions').onchange = e => {
    if (!e.target.matches('input')) return;
    e.target.checked ? enabled.add(e.target.value) : enabled.delete(e.target.value);
    for (const state of activeMaps) applyReferences(state);
  };
  updateHint();
}

function updateHint() {
  const hint = $('mapContextHint');
  if (!hint) return;
  hint.textContent = selected === 'none'
    ? 'As referências acompanham os mapas dos dois meses.'
    : 'Reduza a opacidade do levantamento para ver o satélite. Em grandes ampliações, a imagem mantém o detalhe disponível.';
}

// Missing detailed tiles fall back to the matching part of a lower-resolution tile.
// A div clips the parent image without requiring a proxy or altering the source imagery.
const ReliableSatellite = L.TileLayer.extend({
  createTile(coords, done) {
    const tile = document.createElement('div');
    tile.style.overflow = 'hidden';
    const img = document.createElement('img');
    img.crossOrigin = 'anonymous';
    img.alt = ''; img.setAttribute('role','presentation');
    img.style.cssText = 'position:absolute;max-width:none!important;max-height:none!important;';
    tile.append(img);
    let level = coords.z;
    const minimum = Math.max(0, level - 3);
    const load = () => {
      const factor = 2 ** (coords.z - level);
      img.style.width = `${256 * factor}px`; img.style.height = `${256 * factor}px`;
      img.style.left = `${-(coords.x % factor) * 256}px`;
      img.style.top = `${-(coords.y % factor) * 256}px`;
      img.src = L.Util.template(this._url,{z:level,x:Math.floor(coords.x/factor),y:Math.floor(coords.y/factor)});
    };
    img.onload = () => done(null,tile);
    img.onerror = () => { if (level > minimum) { level--; load(); } else done(new Error('Satélite indisponível'),tile); };
    load();
    return tile;
  }
});

function applyBackground(state) {
  for (const layer of state.backgrounds) state.map.removeLayer(layer);
  state.backgrounds = [];
  state.warning.hidden = true;
  const b = basemaps.find(b => b.id === selected);
  if (!b?.url) return;
  let failed = false;
  for (const [url, pane] of [[b.url,'tilePane'], ...(b.labels ? [[b.labels,'basemapLabels']] : [])]) {
    const layer = new ReliableSatellite(url, { attribution, pane, maxNativeZoom:18, maxZoom:22, updateWhenIdle:true, updateWhenZooming:false, keepBuffer:2 });
    layer.on('tileerror', () => {
      if (!state.backgrounds.includes(layer)) return;
      failed = true;
      state.warning.textContent = 'Fundo indisponível nesta área ou conexão. O levantamento continua disponível.';
      state.warning.hidden = false;
    });
    layer.on('loading', () => { failed = false; });
    layer.on('load', () => { if (!failed) state.warning.hidden = true; });
    state.backgrounds.push(layer);
    layer.addTo(state.map);
  }
}

async function applyReferences(state) {
  const version = ++state.version;
  state.referenceWarning.hidden = true;
  for (const [id, layer] of state.layers) if (!enabled.has(id)) state.map.removeLayer(layer);
  for (const r of references) {
    if (!enabled.has(r.id)) continue;
    try {
      if (!state.layers.has(r.id)) {
        if (!cache.has(r.id)) cache.set(r.id,getData(r.url).catch(e => { cache.delete(r.id); throw e; }));
        const data = await cache.get(r.id);
        if (state.disposed || version !== state.version) return;
        const layer = L.geoJSON(data, {
          bubblingMouseEvents:false,
          pane:`reference-${r.id}`,
          renderer:L.svg({pane:`reference-${r.id}`}),
          style:{color:r.color,weight:r.weight ?? (r.id==='rede_drenagem'?1.2:1.6),opacity:1,fill:true,fillColor:r.color,fillOpacity:r.fill ? (r.fillOpacity ?? 0.5) : 0.01,dashArray:r.dashArray || null},
          onEachFeature:(feature, layer) => {
            layer.on('click', e => {
              if (state.ctx.isMeasuring()) {state.ctx.addMeasurePoint(state.panel,e.latlng);return;}
              if(state.panel.pickContour?.(e.latlng)) return;
              layer.closeTooltip?.();
              const fields = Object.entries(feature.properties || {});
              const values = fields.map(([k,v]) => `<dt>${esc(k)}</dt><dd>${esc(v ?? '—')}</dd>`).join('');
              const html = `<div class="referencePopup"><strong>${esc(r.label)}</strong><dl>${values || '<dt>Identificador</dt><dd>'+esc(feature.id)+'</dd>'}</dl></div>`;
              L.popup().setLatLng(e.latlng).setContent(html).openOn(state.map);
            });
          }
        });
        state.layers.set(r.id, layer);
      }
      if (!state.disposed && enabled.has(r.id)) state.layers.get(r.id).addTo(state.map);
    } catch (e) {
      if (state.disposed || version !== state.version) return;
      state.referenceWarning.textContent = `Não foi possível carregar ${r.label}. Desative e ative a referência para tentar novamente.`;
      state.referenceWarning.hidden = false;
    }
  }
}

export function attachMapContext(panel, ctx) {
  const map = panel.map;
  map.createPane('basemapLabels').style.zIndex = 350;
  map.getPane('basemapLabels').style.pointerEvents = 'none';
  map.createPane('references').style.zIndex = 450;
  const referenceOrder = { area_diretamente_afetada:480, reserva_legal:490, servidao_ambiental_perpetua:492, propriedades_rurais:500, direitos_minerarios:505, rede_drenagem:540 };
  for (const r of references) {
    const paneName = `reference-${r.id}`;
    map.createPane(paneName);
    map.getPane(paneName).style.zIndex = referenceOrder[r.id] ?? 500;
  }
  const warning = document.createElement('div'); warning.className = 'contextWarning'; warning.hidden = true;
  const referenceWarning = warning.cloneNode(); referenceWarning.classList.add('referenceWarning');
  panel.body.append(warning,referenceWarning);
  const state = {panel,map,ctx,warning,referenceWarning,backgrounds:[],layers:new Map(),version:0,disposed:false};
  activeMaps.add(state); applyBackground(state); applyReferences(state);
  return () => { state.disposed = true; state.version++; activeMaps.delete(state); };
}
