import * as THREE from 'three';
import {cloudMeasurements} from './cloud-measure.js';
import { OrbitControls } from './vendor/OrbitControls.js';
import { fmt, icon, getData, showStatus } from './common.js';
import { terrainLegendHTML } from './terrain-legend.js';

function createHypsometricTexture(classification) {
  const canvas = document.createElement('canvas');
  canvas.width = 5; canvas.height = 1;
  const ctx = canvas.getContext('2d');
  classification.colors.forEach((color,i)=>{ ctx.fillStyle=color; ctx.fillRect(i,0,1,1); });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  return tex;
}

export async function createCloudPane(panel, ctx) {
  const host = document.createElement('div');
  host.className = 'cloudHost';
  panel.body.prepend(host);
  const mobile = window.matchMedia('(max-width: 768px)').matches;
  const terrainLegend = document.createElement('div');
  terrainLegend.className = 'terrainLegend cloudTerrainLegend';
  terrainLegend.hidden = true;
  terrainLegend.innerHTML = terrainLegendHTML(ctx.terrainClassification);
  panel.body.append(terrainLegend);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(document.documentElement.dataset.theme === 'dark' ? '#172632' : '#e2e8ec');

  // Iluminação realística solar para relevo topográfico com sombras suaves
  const ambient = new THREE.AmbientLight(0xffffff, 0.75);
  scene.add(ambient);
  const hemi = new THREE.HemisphereLight(0xf0f6fc, 0x5a6368, 0.45);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.55);
  sun.position.set(1500, 2400, 1200);
  scene.add(sun);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.5, 40000);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = 12000;
  controls.maxPolarAngle = Math.PI * 0.94;
  controls.autoRotateSpeed = 1.2;

  panel.cloud = { camera, controls, scene };
  let mode = 'surface'; // 'surface' | 'hypso' | 'points'
  let verticalExaggeration = 1.0;
  let revision = 0;
  let visible = true;
  let dirty = true;
  let activeMesh = null;
  let activeMaterials = [];
  let cachedTexture = null;
  let hypsoTexture = null;
  const aborter = new AbortController();
  const measurements=cloudMeasurements({panel,host,scene,camera,controls,renderer,getMesh:()=>activeMesh,invalidate:()=>{dirty=true;},originElevation:ctx.sceneOriginElevation,isSinglePanel:ctx.singlePanel,onClaim:ctx.claimCloudMeasure,onPathChange:(points,drawing,action,type)=>ctx.syncCloudMeasurement?.(panel,points,drawing,action,type)});
  panel.cloud.measurements = measurements;

  camera.position.set(1100, 1150, 1200);
  controls.target.set(0, 0, 0);
  controls.update();

  const ref = ctx.cloudReference(panel);
  let needsInitialFit = !ref;
  if (ref) {
    camera.position.copy(ref.camera.position);
    controls.target.copy(ref.controls.target);
    controls.update();
  }

  // Elementos flutuantes de métricas e ajuda
  const badge = document.createElement('div');
  badge.className = 'cloudCount';
  host.append(badge);

  const help = document.createElement('div');
  help.className = 'cloudHelp';
  help.innerHTML = mobile ? '<span>Girar: um dedo</span><span>Mover e ampliar: dois dedos</span>' : '<span>Girar: Botão esquerdo</span><span>Deslocar: Botão direito</span><span>Zoom: Roda</span>';
  host.append(help);

  const actions = document.createElement('div');
  actions.className = 'cloudActions';
  actions.innerHTML = `
    <button data-action="in" aria-label="Aproximar 3D" title="Aproximar (Zoom +)">${icon('plus')}</button>
    <button data-action="out" aria-label="Afastar 3D" title="Afastar (Zoom -)">${icon('minus')}</button>
    <button data-action="rotate" aria-label="Girar modelo 3D" title="Girar 45°">${icon('rotate')}</button>
    <button data-action="nadir" aria-label="Vista superior (Nadir)" title="Vista Superior (Nadir)">${icon('terrain')}</button>
    <button data-action="autorotate" aria-label="Giro contínuo automático" title="Alternar rotação automática">${icon('rotate')}</button>
  `;
  host.append(actions);

  actions.onclick = e => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const action = btn.dataset.action;
    if (action === 'in' || action === 'out') {
      const offset = camera.position.clone().sub(controls.target);
      offset.multiplyScalar(action === 'in' ? 0.8 : 1.25);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    } else if (action === 'rotate') {
      const offset = camera.position.clone().sub(controls.target);
      offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 8);
      camera.position.copy(controls.target).add(offset);
      controls.update();
    } else if (action === 'nadir') {
      const dist = camera.position.distanceTo(controls.target);
      camera.position.set(controls.target.x, controls.target.y + Math.max(dist, 1600), controls.target.z + 0.001);
      controls.update();
    } else if (action === 'autorotate') {
      controls.autoRotate = !controls.autoRotate;
      btn.classList.toggle('active', controls.autoRotate);
    }
    dirty = true;
  };

  panel.foot.innerHTML = `
    <div class="cloudFooterControls">
      <label class="cloudModeSelectLabel">
        <span>Modo 3D:</span>
        <select class="cloudModeSelect" aria-label="Representação 3D">
          <option value="surface" ${mode==='surface'?'selected':''}>Superfície com ortofoto</option>
          <option value="hypso" ${mode==='hypso'?'selected':''}>Hipsometria 3D (Cores por Cota)</option>
          <option value="points" ${mode==='points'?'selected':''}>Nuvem de pontos completa</option>
        </select>
      </label>
      <label class="exaggerationLabel">
        <span>Exagero Z:</span>
        <select class="exaggerationSelect" aria-label="Exagero vertical do terreno">
          <option value="1.0">1.0× (Real)</option>
          <option value="1.25">1.25×</option>
          <option value="1.5">1.5×</option>
          <option value="2.0">2.0×</option>
        </select>
      </label>
      <label class="pointSizeLabel" hidden>
        <span>Ponto:</span>
        <input type="range" aria-label="Tamanho dos pontos" min="0.4" max="2.5" step="0.1" value="0.95">
      </label>
      <button class="fitButton" aria-label="Restaurar enquadramento inicial" title="Restaurar enquadramento inicial">${icon('fit')}</button>
    </div>
  `;

  const modeSelect = panel.foot.querySelector('.cloudModeSelect');
  const exagSelect = panel.foot.querySelector('.exaggerationSelect');
  const pointSizeInput = panel.foot.querySelector('input');
  const fitBtn = panel.foot.querySelector('.fitButton');

  function fitScene() {
    const bounds = new THREE.Box3();
    for (const child of scene.children) if (child.isMesh || child.isPoints) bounds.union(new THREE.Box3().setFromObject(child));
    if (bounds.isEmpty()) return;
    const sphere = bounds.getBoundingSphere(new THREE.Sphere());
    const aspect = Math.max(host.clientWidth,1) / Math.max(host.clientHeight,1);
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov/2) * aspect);
    const distance = sphere.radius / Math.sin(Math.min(verticalFov,horizontalFov)/2) * 1.06;
    const direction = new THREE.Vector3(1100,1150,1200).normalize();
    controls.target.copy(sphere.center);
    camera.position.copy(sphere.center).addScaledVector(direction,distance);
    controls.update();
    dirty = true;
  }
  fitBtn.onclick = fitScene;

  exagSelect.onchange = e => {
    verticalExaggeration = parseFloat(e.target.value) || 1.0;
    measurements.setExaggeration(verticalExaggeration);
    if (activeMesh) {
      activeMesh.scale.set(1, verticalExaggeration, 1);
    }
    dirty = true;
  };

  pointSizeInput.oninput = e => {
    const val = Number(e.target.value);
    activeMaterials.forEach(m => {
      if (m.uniforms?.pointSize) m.uniforms.pointSize.value = val;
    });
    dirty = true;
  };

  let scale = 1;
  const resize = new ResizeObserver(() => {
    if (panel.disposed) return;
    const { clientWidth: w, clientHeight: h } = host;
    if (w && h) {
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      scale = (h * renderer.getPixelRatio()) / (2 * Math.tan((camera.fov * Math.PI) / 360));
      activeMaterials.forEach(m => {
        if (m.uniforms?.scale) m.uniforms.scale.value = scale;
      });
      dirty = true;
    }
  });
  resize.observe(host);

  const visibility = new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    dirty = true;
  });
  visibility.observe(host);

  controls.addEventListener('change', () => {
    dirty = true;
    ctx.syncCloud(panel);
  });

  renderer.setAnimationLoop(() => {
    if (panel.disposed || document.hidden || !visible || !host.clientWidth) return;
    if (controls.autoRotate) {
      controls.update();
      dirty = true;
    } else {
      controls.update();
    }
    if (dirty) {
      renderer.render(scene, camera);
      dirty = false;
    }
  });

  function clearScene() {
    activeMesh = null;
    for (const child of [...scene.children]) {
      if (child.isMesh || child.isPoints) {
        scene.remove(child);
        child.geometry?.dispose();
        if (child.material) {
          if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
          else child.material.dispose();
        }
      }
    }
    activeMaterials = [];
    dirty = true;
  }

  panel.cloud.invalidate = () => { dirty = true; };

  panel.onDispose = () => {
    revision++;
    aborter.abort();
    resize.disconnect();
    visibility.disconnect();
    renderer.setAnimationLoop(null);
    controls.dispose();
    measurements.dispose();
    clearScene();
    cachedTexture?.dispose();
    hypsoTexture?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
  };

  renderer.domElement.addEventListener('webglcontextlost', e => {
    e.preventDefault();
    if (!panel.disposed) {
      showStatus(panel, 'Memória gráfica esgotada. Feche outros painéis 3D e recarregue.', true);
    }
  });

  async function loadSurface(token, isHypso = false) {
    const s = panel.month.surface;
    if (!s) throw Error('Dados de malha 3D indisponíveis para este mês.');
    showStatus(panel, 'Carregando malha contínua de alta resolução…');

    const [positions, indices] = await Promise.all([
      getData(`data/${panel.month.id}/surface-positions.bin`, 'arrayBuffer', aborter.signal),
      getData(`data/${panel.month.id}/surface-indices.bin`, 'arrayBuffer', aborter.signal)
    ]);
    if (panel.disposed || token !== revision) return;

    if (!cachedTexture && !isHypso) {
      showStatus(panel, 'Carregando ortofoto de alta resolução…');
      cachedTexture = await new THREE.TextureLoader().loadAsync(`data/${panel.month.id}/${mobile ? 'surface-texture-mobile.jpg' : 'surface-texture.jpg'}`);
      cachedTexture.colorSpace = THREE.SRGBColorSpace;
      cachedTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    }

    if (isHypso && !hypsoTexture) {
      hypsoTexture = createHypsometricTexture(ctx.terrainClassification);
    }

    if (panel.disposed || token !== revision) return;

    const g = new THREE.BufferGeometry();
    const posAttr = new THREE.BufferAttribute(new Float32Array(positions), 3);
    g.setAttribute('position', posAttr);
    g.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));
    measurements.setTerrain(posAttr.array,new Uint32Array(indices),s.width,s.height);

    if (isHypso) {
      // Coordenadas UV baseadas na elevação Y normalizada
      const elevMin = ctx.terrainClassification.edges[0];
      const elevMax = ctx.terrainClassification.edges[5];
      const elevSpan = Math.max(elevMax - elevMin, 1);
      const uvs = new Float32Array(s.vertexCount * 2);
      const posArr = posAttr.array;
      for (let i = 0; i < s.vertexCount; i++) {
        // posArr[i * 3 + 1] é a altitude relativa
        const absElev = posArr[i * 3 + 1] + ctx.sceneOriginElevation;
        const norm = Math.max(0, Math.min(1, (absElev - elevMin) / elevSpan));
        uvs[i * 2] = norm;
        uvs[i * 2 + 1] = 0.5;
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    } else {
      // Coordenadas UV ortorretificadas mapeando a ortofoto
      const uvs = new Float32Array(s.vertexCount * 2);
      for (let y = 0; y < s.height; y++) {
        for (let x = 0; x < s.width; x++) {
          const i = y * s.width + x;
          uvs[i * 2] = (x + 0.5) / s.width;
          uvs[i * 2 + 1] = 1 - (y + 0.5) / s.height;
        }
      }
      g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    }

    // Cálculo das normais para relevo sombreado realístico
    g.computeVertexNormals();
    g.computeBoundingSphere();

    const mat = new THREE.MeshStandardMaterial({
      map: isHypso ? hypsoTexture : cachedTexture,
      roughness: isHypso ? 0.70 : 0.84,
      metalness: 0.04,
      flatShading: false,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(g, mat);
    mesh.scale.set(1, verticalExaggeration, 1);
    activeMesh = mesh;
    scene.add(mesh);

    const triangleCount = s.triangleCount || (indices.byteLength / 12);
    badge.textContent = `${panel.month.label} · ${isHypso ? 'Elevação em 5 classes' : 'Superfície com ortofoto'}`;
    badge.title = `${fmt(s.vertexCount,0)} vértices · ${fmt(triangleCount,0)} triângulos${mobile ? ' · Textura otimizada para celular' : ''}`;
    dirty = true;
    showStatus(panel, '');
  }

  async function loadPoints(token) {
    showStatus(panel, 'Carregando nuvem de pontos LiDAR/Fotogrametria…');
    let totalLoaded = 0;
    const fullCount = panel.month.fullPointCount || 1839157;

    for (const chunk of panel.month.cloudChunks) {
      if (panel.disposed || token !== revision) return;
      showStatus(panel, `Carregando nuvem completa… ${Math.round((totalLoaded / fullCount) * 100)}%`);

      const [p, c] = await Promise.all([
        getData(`data/${panel.month.id}/${chunk.positions}`, 'arrayBuffer', aborter.signal),
        getData(`data/${panel.month.id}/${chunk.colors}`, 'arrayBuffer', aborter.signal)
      ]);
      if (panel.disposed || token !== revision) return;

      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(p), 3));
      g.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(c), 3, true));
      g.computeBoundingSphere();

      const m = new THREE.ShaderMaterial({
        uniforms: {
          pointSize: { value: Number(pointSizeInput.value) || 0.95 },
          scale: { value: scale },
          ratio: { value: renderer.getPixelRatio() }
        },
        vertexColors: true,
        vertexShader: `
          uniform float pointSize;
          uniform float scale;
          uniform float ratio;
          varying vec3 rgb;
          void main() {
            rgb = color;
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            gl_Position = projectionMatrix * mv;
            gl_PointSize = clamp(pointSize * scale / max(0.1, -mv.z), ratio, 16.0 * ratio);
          }
        `,
        fragmentShader: `
          varying vec3 rgb;
          void main() {
            vec2 q = gl_PointCoord - 0.5;
            if (dot(q, q) > 0.25) discard;
            gl_FragColor = vec4(rgb, 1.0);
          }
        `
      });

      activeMaterials.push(m);
      const points = new THREE.Points(g, m);
      scene.add(points);
      totalLoaded += chunk.count;
      badge.textContent = `${fmt(totalLoaded, 0)} de ${fmt(fullCount, 0)} pontos (Nuvem 100% íntegra)`;
      dirty = true;
    }
    showStatus(panel, '');
  }

  async function load() {
    const token = ++revision;
    clearScene();
    terrainLegend.hidden = mode !== 'hypso';
    panel.foot.querySelector('.pointSizeLabel').hidden = mode !== 'points';
    panel.foot.querySelector('.exaggerationLabel').hidden = mode === 'points';

    try {
      if (mode === 'points') {
        await loadPoints(token);
      } else if (mode === 'hypso') {
        await loadSurface(token, true);
      } else {
        await loadSurface(token, false);
      }
      if (needsInitialFit && !panel.disposed && token === revision) { fitScene(); needsInitialFit = false; }
    } catch (e) {
      if (!panel.disposed && token === revision) {
        showStatus(panel, e.message || 'Falha ao processar modelo 3D. Tente reabrir a camada.', true);
      }
    }
  }

  modeSelect.onchange = e => {
    if(ctx.isMeasuring())ctx.cancelMeasurement();
    mode = e.target.value;
    measurements.stop();
    load();
  };

  await load();
}
