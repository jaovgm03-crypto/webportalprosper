export const $ = id => document.getElementById(id);

export const fmt = (value, d = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '—';
  const maxD = Math.max(0, Math.min(20, Math.round(d)));
  const minD = Math.min(maxD, d >= 2 ? 2 : maxD);
  return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: minD, maximumFractionDigits: maxD });
};

export const escapeHTML = value => String(value ?? '—')
  .replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const paths = {
  ortho: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2zm0 14h16l-5-6-4 5-3-3-4 4zm4-9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  terrain: 'M3 19h18L13 7l-4 6-2-3-4 9z',
  contours: 'M2 18c4-4 8 2 12-2s4-6 8-4M2 12c5-3 7 3 12-1s5-5 8-3M2 6c4-2 8 2 12-1s4-3 8-1',
  cloud: 'M12 2L2 7l10 5 10-5-10-5zm0 9l-10-5v9l10 5 10-5v-9l-10 5z',
  volume: 'M3 20h18 M4 20l3-7 4 3 5-8 4 12 M8 16l3 3 M13 14l3 3',
  chevron: 'M6 9l6 6 6-6',
  close: 'M18 6L6 18M6 6l12 12',
  expand: 'M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7',
  fit: 'M12 2v4M12 18v4M2 12h4M18 12h4M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
  distance: 'M3 17L17 3l4 4L7 21z M7 13l3 3 M11 9l3 3 M15 5l3 3',
  area: 'M4 4h16v16H4z M4 10h16 M10 4v16',
  trash: 'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
  menu: 'M4 6h16M4 12h16M4 18h16',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  rotate: 'M21 12a9 9 0 1 1-2.6-6.4L21 8M21 3v5h-5',
  layers: 'M12 2L2 7l10 5 10-5-10-5zm0 8L2 15l10 5 10-5-10-5z',
  download: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3',
  check: 'M20 6L9 17l-5-5',
  moon: 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13z',
  sun: 'M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42M12 6a6 6 0 1 0 0 12 6 6 0 0 0 0-12z'
};

export function icon(name) {
  const d = paths[name] || paths.ortho;
  return `<svg class="icon icon-${name}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${d}"/></svg>`;
}

export const layerNames = {
  ortho: 'Ortofoto',
  terrain: 'Modelo Digital de Terreno',
  contours: 'Curvas de Nível 1m',
  cloud: 'Modelo 3D',
  volume: 'Volume e Estoque das Pilhas'
};

export const layerDescriptions = {
  ortho: 'Mosaico ortorretificado de alta resolução espacial',
  terrain: 'Modelo digital de terreno em cinco classes comuns aos levantamentos',
  contours: 'Curvas equidistantes de 1 m com cotas interativas',
  cloud: 'Gêmeo digital 3D sombreado e nuvem densa de pontos',
  volume: 'Cálculo de volume de pilhas e variação de estoque'
};

export async function getData(url, type = 'json', signal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw Error(`Falha ao carregar recurso (${r.status}): ${url}`);
  return r[type]();
}

export function showStatus(panel, text, error = false) {
  if (!panel || !panel.status) return;
  panel.status.textContent = text;
  panel.status.classList.toggle('error', error);
  panel.status.hidden = !text;
}
