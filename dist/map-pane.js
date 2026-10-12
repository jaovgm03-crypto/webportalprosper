import { exportOrthoPDF } from './geopdf.js';
import { attachMapContext } from './map-context.js';
import { terrainLegendHTML } from './terrain-legend.js';
import { $, fmt, escapeHTML as esc, icon, getData, showStatus } from './common.js';

const contoursCache = new Map();

function getContours(month) {
  if (!contoursCache.has(month.id)) {
    contoursCache.set(month.id, getData(`data/${month.id}/contours.geojson`).catch(e => {
      contoursCache.delete(month.id);
      throw e;
    }));
  }
  return contoursCache.get(month.id);
}

export async function createMapPane(panel, ctx) {
  const host = document.createElement('div');
  host.className = 'mapHost';
  host.setAttribute('aria-label', `Mapa topográfico de ${panel.month.label}`);
  panel.body.prepend(host);

  const map = L.map(host, {
    crs: L.CRS.EPSG3857,
    preferCanvas: true,
    renderer: L.canvas({ tolerance: 7 }),
    maxZoom: 22,
    minZoom: 3,
    zoomSnap: 0.25,
    doubleClickZoom: false
  });
  panel.map = map;
  map.createPane('contours');
  map.getPane('contours').style.zIndex = 550;

  L.control.scale({ imperial: false, metric: true, position: 'bottomleft' }).addTo(map);
  map.attributionControl.addAttribution('Lithos Geologia • Engenharia e Meio Ambiente');

  const prev = ctx.mapReference();
  if (prev) {
    map.setView(prev.center, prev.zoom, { animate: false });
  } else {
    map.fitBounds(panel.month.orthoBounds, { padding: [16, 16] });
  }

  const detachContext = attachMapContext(panel, ctx);
  const detachTemporary = ctx.attachTemporary?.(panel);
  const observer = new ResizeObserver(() => {
    if (!panel.disposed) map.invalidateSize({ pan: true, animate: false });
  });
  observer.observe(host);

  const measureLayer = L.layerGroup().addTo(map);
  panel.measureLayer = measureLayer;

  let overlay = null;
  let contourLayer = null;
  let selectedLine = null;
  let requestToken = 0;

  panel.onDispose = () => {
    requestToken++;
    observer.disconnect();
    detachContext();
    detachTemporary?.();
    map.remove();
  };

  map.on('move', () => ctx.syncMap(panel));
  map.on('mousemove', e => {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    $('coordinates').innerHTML = `<span><strong>Lat:</strong> ${fmt(lat, 6)}°</span> <span><strong>Lng:</strong> ${fmt(lng, 6)}°</span>`;
  });

  map.on('click', e => {
    if (ctx.isMeasuring()) {
      ctx.addMeasurePoint(panel, e.latlng);
    }
  });

  // Indicador do Norte cartográfico
  const north = document.createElement('div');
  north.className = 'northBadge';
  north.innerHTML = '<span>N</span><div class="northArrow">▲</div>';
  panel.body.append(north);

  if (panel.type === 'terrain') {
    const legend = document.createElement('div');
    legend.className = 'terrainLegend';
    legend.innerHTML = terrainLegendHTML(ctx.terrainClassification);
    panel.body.append(legend);
  }

  panel.foot.innerHTML = `
    <div class="mapFooterControls">
      ${panel.type !== 'contours' ? `
        <label class="toggleLabel">
          <input class="curveToggle" type="checkbox">
          <span>Curvas de Nível 1m</span>
        </label>
      ` : `
        <span class="footHint">Curvas de Nível 1m · Toque ou clique para consultar a cota</span>
      `}
      <div class="opacityControl">
        <span>Opacidade:</span>
        <input class="opacityRange" type="range" min="0" max="100" value="100" aria-label="Opacidade da camada">
        <output class="opacityOutput">100%</output>
      </div>
      <button class="fitButton" title="Enquadrar Levantamento" aria-label="Enquadrar Levantamento">${icon('fit')}</button>
    </div>
  `;

  panel.foot.querySelector('.fitButton').onclick = () => {
    map.fitBounds(panel.month.orthoBounds, { padding: [16, 16] });
  };

  if(panel.type==='ortho'){
    panel.exportPDF=async()=>{try{await exportOrthoPDF(panel,ctx);}catch(e){showStatus(panel,e.message,true);}};
  }
  const opacitySlider = panel.foot.querySelector('.opacityRange');
  const opacityOutput = panel.foot.querySelector('.opacityOutput');
  opacitySlider.oninput = e => {
    const v = Number(e.target.value) / 100;
    if (overlay) overlay.setOpacity(v);
    if (panel.type === 'contours' && contourLayer) contourLayer.setStyle({ opacity: v });
    opacityOutput.textContent = e.target.value + '%';
  };

  panel.pickContour = latlng => {
    if (!contourLayer || ctx.isMeasuring()) return false;
    const point=map.latLngToLayerPoint(latlng);
    let nearest=null,best=window.matchMedia('(pointer:coarse)').matches?10:5;
    contourLayer.eachLayer(layer=>{
      const visit=points=>{
        if(!points.length)return;
        if(points[0].lat===undefined){points.forEach(visit);return;}
        for(let i=1;i<points.length;i++){
          const a=map.latLngToLayerPoint(points[i-1]),b=map.latLngToLayerPoint(points[i]);
          const dx=b.x-a.x,dy=b.y-a.y,n=dx*dx+dy*dy;
          const t=n?Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/n)):0;
          const d=Math.hypot(point.x-a.x-t*dx,point.y-a.y-t*dy);
          if(d<best){best=d;nearest=layer;}
        }
      };visit(layer.getLatLngs());
    });
    if(!nearest)return false;
    nearest.selectContour({latlng});return true;
  };
  map.on('click',e=>panel.pickContour(e.latlng));
  async function loadContours() {
    const token = ++requestToken;
    try {
      showStatus(panel, 'Carregando curvas de nível topográficas…');
      const data = await getContours(panel.month);
      if (panel.disposed || requestToken !== token) return;

      contourLayer = L.geoJSON(data, {
        pane: 'contours',
        renderer: L.canvas({pane:'contours',tolerance:0}),
        interactive:false,
        style: f => {
          const elev = Number(f.properties?.ELEV ?? f.properties?.elevation ?? 0);
          const isMaster = Math.round(elev) % 5 === 0;
          return {
            color: '#000000', // CURVAS ESTRITAMENTE PRETAS
            weight: isMaster ? 1.45 : 0.75,
            opacity: isMaster ? 0.95 : 0.8
          };
        },
        onEachFeature: (f, l) => {
          const elev = Number(f.properties?.ELEV ?? f.properties?.elevation ?? 0);
          const isMaster = Math.round(elev) % 5 === 0;

          l.selectContour = e => {
            if (ctx.isMeasuring()) return;
            // Restaura o estilo da curva previamente selecionada
            if (selectedLine && selectedLine !== l) {
              const prevElev = Number(selectedLine.feature?.properties?.ELEV ?? selectedLine.feature?.properties?.elevation ?? 0);
              const prevMaster = Math.round(prevElev) % 5 === 0;
              selectedLine.setStyle({
                color: '#000000',
                weight: prevMaster ? 1.45 : 0.75,
                opacity: prevMaster ? 0.95 : 0.8
              });
            }

            selectedLine = l;
            // Destaque visual vibrante na curva selecionada (Verde Acento Lithos)
            l.setStyle({ color: '#000000', weight: 3.8, opacity: 1 });

            // Cálculo geodésico do comprimento do trecho da curva
            const lines = f.geometry?.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry?.coordinates || []];
            let segmentLength = 0;
            for (const coords of lines) if (window.geodesic && coords.length > 1) {
              for (let i = 0; i < coords.length - 1; i++) {
                segmentLength += window.geodesic.Geodesic.WGS84.Inverse(coords[i][1], coords[i][0], coords[i+1][1], coords[i+1][0]).s12;
              }
            }

            // Exibe resumo completo dos atributos
            ctx.showAttributes(panel, f, segmentLength, e.latlng, l);
          };
        }
      }).addTo(map);

      showStatus(panel, '');
    } catch (e) {
      if (!panel.disposed) showStatus(panel, e.message, true);
    }
  }

  const curveToggle = panel.foot.querySelector('.curveToggle');
  if (curveToggle) {
    curveToggle.onchange = () => {
      if (curveToggle.checked) {
        loadContours();
      } else {
        requestToken++;
        if (contourLayer) map.removeLayer(contourLayer);
        contourLayer = null;
        if (selectedLine) selectedLine = null;
        showStatus(panel, '');
      }
    };
  }

  ctx.redrawMeasurements();

  if (panel.type === 'contours') {
    await loadContours();
    return;
  }

  // Carregamento da imagem raster (Ortofoto RGB ou Terreno MDT)
  showStatus(panel, `Carregando ${panel.type === 'terrain' ? 'modelo de terreno (MDT)' : 'ortofoto RGB'}…`);
  const kind = panel.type === 'terrain' ? 'terrain' : 'ortho';
  const rasterName = kind === 'ortho' && window.matchMedia('(max-width: 768px)').matches ? 'ortho-mobile.png' : `${kind}-web.png`;

  await new Promise(resolve => {
    overlay = L.imageOverlay(`data/${panel.month.id}/${rasterName}`, panel.month[kind + 'WebBounds'], {
      interactive: false,
      alt: `${kind === 'ortho' ? 'Ortofoto' : 'Terreno MDT'} — ${panel.month.label}`
    });
    overlay.once('load', () => {
      if (!panel.disposed) showStatus(panel, '');
      resolve();
    });
    overlay.once('error', () => {
      if (!panel.disposed) showStatus(panel, 'Não foi possível carregar a imagem. Tente reabrir a camada.', true);
      resolve();
    });
    overlay.addTo(map);
  });

  // Se o checkbox de curvas pretas estiver ativo, carrega as curvas sobrepostas
  if (curveToggle && curveToggle.checked) {
    await loadContours();
  }
}
