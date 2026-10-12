import { fmt, escapeHTML as esc } from './common.js';
export function terrainLegendHTML(classification) {
  if (!classification) return '<div class="legendTitle">Classificação indisponível</div>';
  const expanded = window.matchMedia('(max-width: 768px)').matches ? '' : 'open';
  return `<details ${expanded}><summary class="legendTitle">Elevação (m) · 5 classes</summary><div class="terrainClasses">${classification.colors.map((color,i)=>`<div><i style="background:${esc(color)}"></i><span>${fmt(classification.edges[i],2)} ≤ cota ${i===4?'≤':'<'} ${fmt(classification.edges[i+1],2)}</span></div>`).join('')}</div><small>Mesma escala em todos os meses</small></details>`;
}
