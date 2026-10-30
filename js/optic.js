// Secuencia "Control total de la luz": macro de la óptica Hasselblad del
// Mavic 4 Pro, diafragma de f/11 a f/2.0 con el scroll, alejamiento hasta
// las tres cámaras, giro libre del gimbal y revelado del dron completo.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildMavicHQAsync } from './mavic-hq.js';
import { studioEnvHQ, upgradeMaterials } from './render-hq.js';

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const ss = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
const win = (p, a, b, c, d) => ss(a, b, p) * (1 - ss(c, d, p));
const STOPS = [11, 8, 5.6, 4, 2.8, 2];

// Cede el hilo principal un fotograma: la preparación se reparte en trozos cortos
// para que el scroll no se quede pillado mientras se monta la escena
const breathe = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export async function initOptic(section, { reduced = false } = {}) {
  const canvas = section.querySelector('[data-optic-canvas]');
  const pin = section.querySelector('[data-optic-pin]');
  const ui = {
    a: section.querySelector('[data-optic-a]'),
    b: section.querySelector('[data-optic-b]'),
    c: section.querySelector('[data-optic-c]'),
    readout: section.querySelector('[data-optic-readout]'),
    f: section.querySelector('[data-ro-f]'),
    ev: section.querySelector('[data-ro-ev]'),
    stops: [...section.querySelectorAll('[data-stop]')],
    labels: {
      main: section.querySelector('[data-olabel="main"]'),
      mid: section.querySelector('[data-olabel="mid"]'),
      tele: section.querySelector('[data-olabel="tele"]'),
    },
  };

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
  } catch (err) {
    section.querySelector('[data-optic-fallback]').hidden = false;
    return null;
  }
  // Resolución: tope de 1,5 (en retina, 2× cuesta casi el doble y con el posproceso no se nota)
  // y un presupuesto de píxeles para pantallas grandes. Si aun así los fotogramas pasan de
  // ~20 ms, se apaga la oclusión, luego el desenfoque y por último baja la resolución.
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const MAX_PX = coarse ? 1.6e6 : 3.2e6;
  let prCap = Math.min(window.devicePixelRatio || 1, 1.5);
  let pixelRatio = prCap;
  renderer.setPixelRatio(pixelRatio);
  let perfFrames = 0, perfTime = 0, perfMin = Infinity;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.AgXToneMapping;   // curva fotográfica
  renderer.toneMappingExposure = 1.25;
  renderer.setClearColor(0x000000, 1);

  await breathe();

  const scene = new THREE.Scene();
  scene.environment = studioEnvHQ(renderer);
  await breathe();

  const camera = new THREE.PerspectiveCamera(28, 1, 0.01, 100);
  const key = new THREE.DirectionalLight(0xffffff, 1.1);
  key.position.set(3, 5, 4);
  const rim = new THREE.DirectionalLight(0xc9d2ff, 1.4);
  rim.position.set(-4, 2.5, -3);
  scene.add(key, rim);

  // Mavic 4 Pro dibujado a partir de las fotos del dron de Javi
  const drone = await buildMavicHQAsync(breathe);
  upgradeMaterials(drone.root);
  await breathe();
  scene.add(drone.root);
  // Sombras propias suaves (brazos, orejas y cámara sobre el cuerpo); solo escritorio.
  // La óptica no recibe sombras: en el macro saldrían pixeladas.
  if (!coarse) {
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.VSMShadowMap;
    renderer.shadowMap.autoUpdate = false;   // se recalculan solo cuando el dron cambia de pose
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.radius = 6;
    key.shadow.blurSamples = 16;
    key.shadow.bias = -0.0005;
    Object.assign(key.shadow.camera, { left: -3.8, right: 3.8, top: 3.8, bottom: -3.8, near: 0.5, far: 20 });
    key.target.position.set(0, 0, -0.9);
    scene.add(key.target);
    const optics = new Set();
    drone.roll.traverse((o) => optics.add(o));
    drone.root.traverse((o) => {
      if (!o.isMesh || o.material.transparent) return;
      o.castShadow = true;
      o.receiveShadow = !optics.has(o);
    });
  }

  // Fuselaje, brazos y hélices fuera de plano hasta el giro del gimbal
  const airframe = drone.body.children.filter((c) => c !== drone.gimbal);

  // Acabado: oclusión ambiental (no en móvil) y brillo leve en los reflejos
  // Antialiasing: en retina ya se dibuja a 1,5×, así que 2 muestras bastan (4 cuestan ~2 ms más por fotograma)
  const samples = (window.devicePixelRatio || 1) >= 1.5 ? 2 : 4;
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples }));
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 1, 1);
  // La oclusión es una sombra suave: a media resolución no se distingue y cuesta la cuarta parte
  const gtaoSetSize = gtao.setSize.bind(gtao);
  gtao.setSize = (w, h) => gtaoSetSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
  gtao.updateGtaoMaterial({ radius: 0.3, distanceExponent: 1.5, thickness: 1.2, scale: 1.1 });
  gtao.blendIntensity = 0.9;
  gtao.enabled = !coarse;
  composer.addPass(gtao);
  // Profundidad de campo del macro: la óptica nítida y el frontal que la rodea suave (solo escritorio)
  const bokeh = new BokehPass(scene, camera, { focus: 0.3, aperture: 0.004, maxblur: 0.006 });
  bokeh.enabled = !coarse;
  // Desenfoque y oclusión se apagan para siempre si el equipo no llega
  let dofOn = !coarse;
  let aoOn = !coarse;
  composer.addPass(bokeh);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.22, 0.45, 0.92);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // Las tres ópticas miran a +Z; las etiquetas salen del borde de cada una (radio local)
  drone.anchors.main.userData.r = 0.132;
  drone.anchors.mid.userData.r = 0.075;
  drone.anchors.tele.userData.r = 0.075;

  const v = new THREE.Vector3();
  const mainW = new THREE.Vector3();
  const podW = new THREE.Vector3();
  const look = new THREE.Vector3();
  const pos = new THREE.Vector3();
  const tmpA = new THREE.Vector3();
  const tmpB = new THREE.Vector3();

  // Plano final: centro y tamaño reales del dron (con hélices)
  const bounds = new THREE.Box3().setFromObject(drone.root);
  const droneCenter = bounds.getCenter(new THREE.Vector3());
  const droneSize = bounds.getSize(new THREE.Vector3());
  const FINAL_DIR = new THREE.Vector3(3.6, 2.5, 6.2).normalize();
  const LENS_K = 0.64;   // óptica principal del modelo nuevo frente a la anterior (radio)
  const POD_K = 0.86;    // esfera de la cámara frente a la anterior

  let W = 1, H = 1, aspect = 1;
  function resize() {
    const r = pin.getBoundingClientRect();
    W = Math.max(1, r.width); H = Math.max(1, r.height);
    aspect = W / H;
    pixelRatio = Math.min(pixelRatio, prCap, Math.sqrt(MAX_PX / (W * H)));
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(W, H, false);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(W, H);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    needsRender = true;
  }

  let target = reduced ? 0.62 : 0;
  let progress = target;
  let needsRender = true;
  let active = false;
  let last = performance.now();
  let time = 0;

  function frameCamera(p) {
    // Factor de distancia para pantallas verticales
    const k = aspect < 1 ? Math.min(2.4, Math.pow(1 / aspect, 0.95)) : 1;

    drone.anchors.main.getWorldPosition(mainW);
    drone.gimbal.getWorldPosition(podW);

    // Fase 1: macro sobre la óptica principal, empuje lento hacia dentro.
    const push = ss(0.1, 0.5, p);
    const macroDist = (0.41 - 0.09 * push) * k * LENS_K;
    tmpA.set(mainW.x + 0.008 * Math.sin(time * 0.4), mainW.y + 0.004, mainW.z + macroDist);

    // Fase 2: alejamiento a la cara frontal de la cámara.
    const kp = Math.sqrt(k) * POD_K;
    tmpB.set(podW.x + 0.17 * kp, podW.y + 0.07, podW.z + 1.42 * kp);
    const t2 = ss(0.5, 0.64, p);
    pos.lerpVectors(tmpA, tmpB, t2);
    look.lerpVectors(mainW, podW, t2);

    // Fase 3: deriva durante el giro del gimbal.
    const t3 = ss(0.68, 0.84, p);
    tmpA.set(podW.x + 0.52 * kp, podW.y + 0.22, podW.z + 1.8 * kp);
    pos.lerp(tmpA, t3);

    // Fase 4: revelado del dron completo en tres cuartos, con aire para el titular de arriba.
    const t4 = ss(0.8, 0.98, p);
    const kf = aspect < 1 ? Math.sqrt(k) * 1.12 : 1;   // en vertical, el dron llena el ancho
    const lift = droneSize.x * 0.085;
    tmpA.copy(droneCenter).add(v.set(0, lift, 0));
    // Distancia mínima para que el dron entero (con hélices y su balanceo) quepa en el ángulo
    // horizontal real: el factor fijo dejaba un brazo fuera por la izquierda (en móvil y en escritorio)
    const vf = THREE.MathUtils.degToRad(camera.fov) / 2;
    const hf = Math.atan(Math.tan(vf) * aspect);
    const fit = (Math.hypot(droneSize.x, droneSize.z) / 2) * (aspect < 1 ? 1.08 : 1.0) / Math.sin(hf);
    tmpB.copy(tmpA).addScaledVector(FINAL_DIR, Math.max(Math.max(droneSize.x, droneSize.z) * 1.5 * kf, fit));
    pos.lerp(tmpB, t4);
    look.lerp(tmpA, t4);

    camera.position.copy(pos);
    camera.lookAt(look);

    // Enfoque en el cristal frontal; el desenfoque se retira al alejarse
    if (!dofOn) gtao.enabled = aoOn;
    else {
      const dof = 1 - ss(0.46, 0.58, p);
      bokeh.enabled = dof > 0.01;
      // Desenfoque y oclusión no coinciden: en el macro el desenfoque tapa la oclusión
      // y los dos juntos se pasan del presupuesto de un fotograma
      gtao.enabled = aoOn && !bokeh.enabled;
      bokeh.uniforms.focus.value = camera.position.distanceTo(mainW);
      bokeh.uniforms.maxblur.value = 0.006 * dof;
    }
  }

  // Solo se escribe en el DOM lo que cambia: cada escritura de estilo cuesta recomposición,
  // y con el texto desenfocado encima del lienzo eso se nota en el scroll
  const styleCache = new WeakMap();
  const put = (el, prop, val) => {
    let c = styleCache.get(el);
    if (!c) styleCache.set(el, (c = {}));
    if (c[prop] !== val) { c[prop] = val; el.style[prop] = val; }
  };
  const labelW = new Map();   // ancho de cada etiqueta, medido una sola vez (el texto no cambia)
  let lastF = '', lastStop = -1;

  function updateUI(p, open, N) {
    const set = (el, o, blur = true) => {
      const q = Math.round(o * 100) / 100;
      put(el, 'opacity', String(q));
      put(el, 'filter', blur && q < 1 ? `blur(${Math.round((1 - q) * 20) / 2}px)` : 'none');
      put(el, 'visibility', q <= 0 ? 'hidden' : 'visible');
    };
    const oa = 1 - ss(0.15, 0.24, p);
    set(ui.a, oa);
    put(ui.a, 'transform', `translate(-50%, ${Math.round(-(1 - oa) * 40)}px)`);
    set(ui.readout, win(p, 0.09, 0.15, 0.5, 0.56), false);
    set(ui.b, win(p, 0.24, 0.3, 0.44, 0.5));
    set(ui.c, ss(0.87, 0.94, p));

    const f = `f/${N >= 9.95 ? '11' : N.toFixed(1)}`;
    if (f !== lastF) {
      lastF = f;
      ui.f.textContent = f;
      ui.ev.textContent = `+${(2 * Math.log2(11 / N)).toFixed(1)} EV`;
    }
    let nearest = 0, best = 99;
    STOPS.forEach((s, i) => { const d = Math.abs(Math.log(s / N)); if (d < best) { best = d; nearest = i; } });
    if (nearest !== lastStop) { lastStop = nearest; ui.stops.forEach((el, i) => el.classList.toggle('is-on', i === nearest)); }

    // Etiquetas proyectadas sobre las ópticas
    const lo = win(p, 0.58, 0.63, 0.69, 0.72);
    if (lo <= 0.002) {
      for (const el of Object.values(ui.labels)) { put(el, 'opacity', '0'); put(el, 'visibility', 'hidden'); }
      return;
    }
    for (const [name, el] of Object.entries(ui.labels)) {
      const anchor = drone.anchors[name];
      const r = anchor.userData.r;
      const side = name === 'mid' ? -1 : 1;
      v.set(side * r * 1.18, 0, 0.02);
      anchor.localToWorld(v);
      v.project(camera);
      let x = (v.x * 0.5 + 0.5) * W;
      const y = (-v.y * 0.5 + 0.5) * H;
      if (!labelW.get(el)) labelW.set(el, el.offsetWidth);
      const lw = labelW.get(el) || 0;
      if (side > 0) x = Math.min(x, W - lw - 12);
      else x = Math.max(x, lw + 12);
      put(el, 'opacity', lo.toFixed(2));
      put(el, 'visibility', 'visible');
      put(el, 'flexDirection', side < 0 ? 'row-reverse' : 'row');
      const shift = side < 0 ? 'translate(-100%, -50%)' : 'translate(0, -50%)';
      put(el, 'transform', `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) ${shift}`);
    }
  }

  let lastPose = '';
  function render(dt) {
    const p = progress;
    time += dt;

    // Diafragma: interpolación geométrica entre f/11 y f/2.0 (pasos de luz iguales)
    const o = ss(0.13, 0.48, p);
    const N = 11 * Math.pow(2 / 11, o);
    const open = drone.lenses.main.setAperture(N);

    // Giro libre del gimbal (roll de 360°)
    drone.roll.rotation.z = ss(0.7, 0.83, p) * Math.PI * 2;

    // Hélices y flotación al final
    const spin = ss(0.84, 0.95, p);
    drone.update(dt, spin * 0.55);   // palas visibles con desenfoque de movimiento
    drone.root.position.y = Math.sin(time * 1.3) * 0.035 * spin;
    drone.root.rotation.z = Math.sin(time * 0.9) * 0.012 * spin;
    drone.root.rotation.y = Math.sin(time * 0.22) * 0.22 * spin;

    const showFrame = p > 0.72;
    if (showFrame !== airframe[0]?.visible) for (const c of airframe) c.visible = showFrame;

    // Sombras: solo si algo se ha movido respecto a la luz
    if (renderer.shadowMap.enabled) {
      // La flotación final es muy lenta: sus sombras se rehacen 15 veces por segundo, no en cada fotograma
      const pose = `${drone.roll.rotation.z.toFixed(4)}|${spin > 0 ? Math.floor(time * 15) : 0}|${showFrame}`;
      if (pose !== lastPose) { renderer.shadowMap.needsUpdate = true; lastPose = pose; }
    }

    frameCamera(p);
    composer.render(dt);
    updateUI(p, open, N);
  }

  let ready = false;
  let grace = 30;
  function loop(now) {
    if (!active) return;
    if (!ready) { last = now; requestAnimationFrame(loop); return; }
    const prevNow = last;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const prev = progress;
    progress += (target - progress) * (reduced ? 1 : 0.14);
    const moving = Math.abs(progress - prev) > 1e-5 || progress > 0.84;
    if (moving || needsRender) {
      render(dt);
      needsRender = false;
      // Los primeros fotogramas tras entrar en pantalla son siempre más lentos: no cuentan.
      // Se compara cada intervalo con el más corto de la tanda: si todos van a 33 ms es un tope del
      // navegador (ahorro de batería) y no hay que bajar la calidad; si se alternan 16 y 33, sí.
      const iv = Math.min(250, now - prevNow);
      if (grace > 0) grace--;
      else { perfTime += iv; perfMin = Math.min(perfMin, iv); }
      if (grace === 0 && ++perfFrames >= 16) {
        const avg = perfTime / perfFrames;
        if (avg > 20 && avg > perfMin * 1.3) {
          if (aoOn && gtao.enabled) aoOn = gtao.enabled = false;
          else if (dofOn && bokeh.enabled) { dofOn = false; bokeh.enabled = false; }
          else if (pixelRatio > 1) {
            pixelRatio = prCap = Math.max(1, pixelRatio - 0.25);
            resize();
          }
        }
        perfFrames = 0; perfTime = 0; perfMin = Infinity;
      }
    }
    requestAnimationFrame(loop);
  }

  const ro = new ResizeObserver(resize);
  ro.observe(pin);
  resize();

  const io = new IntersectionObserver(([e]) => {
    const was = active;
    active = e.isIntersecting;
    if (active && !was) {
      grace = 30; perfFrames = 0; perfTime = 0; perfMin = Infinity;
      last = performance.now();
      needsRender = true;
      requestAnimationFrame(loop);
    }
  }, { rootMargin: '20% 0px' });
  io.observe(section);

  if (!reduced && window.ScrollTrigger) {
    window.ScrollTrigger.create({
      trigger: section,
      start: 'top top',
      end: 'bottom bottom',
      onUpdate: (self) => { target = self.progress; },
    });
  }

  // Precarga: compila los sombreadores en paralelo (sin bloquear) y después estrena cada efecto
  // en su propio fotograma con el dron completo a la vista, para que nada se compile ni se suba
  // a la GPU a mitad del scroll (fuselaje, sombras, resplandor, desenfoque, oclusión)
  for (const c of airframe) c.visible = true;
  frameCamera(target);
  try {
    if (renderer.compileAsync) {
      // Se compila contra el búfer intermedio del posproceso, que es donde se dibuja de verdad
      // (sin él saldría la variante con tono de pantalla y habría que recompilar de golpe)
      renderer.setRenderTarget(composer.readBuffer);
      // Por lotes de materiales: al terminar, el enlace de cada lote de programas cuesta unos
      // milisegundos; todos de una vez serían una tarea de ~80 ms en mitad del scroll
      const byMat = new Map();
      drone.root.traverse((o) => { if (o.isMesh && !byMat.has(o.material)) byMat.set(o.material, o); });
      const meshes = [...byMat.values()];
      for (let i = 0; i < meshes.length; i += 6) {
        await Promise.all(meshes.slice(i, i + 6).map((m) => renderer.compileAsync(m, camera, scene)));
        await breathe();
      }
      // Los materiales de los efectos (oclusión, desenfoque, resplandor, salida) se compilan también
      // en paralelo: si no, se compilan de golpe en su primer fotograma
      const fx = new THREE.Scene();
      const quad = new THREE.PlaneGeometry(1, 1);
      const seen = new Set();
      const collect = (v) => {
        if (!v || seen.has(v)) return;
        if (v.isMaterial) { seen.add(v); const m = new THREE.Mesh(quad, v); m.frustumCulled = false; fx.add(m); }
        else if (Array.isArray(v)) v.forEach(collect);
      };
      for (const pass of composer.passes) for (const k of Object.keys(pass)) collect(pass[k]);
      await renderer.compileAsync(fx, camera);
      quad.dispose();
    }
  } catch {}
  renderer.setRenderTarget(null);

  // Láminas del diafragma de f/11 a f/2.0: todas las formas hechas y subidas a la GPU antes de
  // que empiece el scroll (un render a 1×1 píxel basta para subir la geometría)
  const tiny = new THREE.WebGLRenderTarget(1, 1);
  frameCamera(0.3);
  for (let i = 0; i <= 48; i++) {
    drone.lenses.main.setAperture(11 * Math.pow(2 / 11, i / 48));
    renderer.setRenderTarget(tiny);
    renderer.render(scene, camera);
    if (i % 3 === 2) await breathe();
  }
  renderer.setRenderTarget(null);
  tiny.dispose();
  drone.lenses.main.setAperture(11);
  await breathe();

  const stages = [[], [bloom], coarse ? [] : [bokeh], coarse ? [] : [gtao]];
  for (const p of [gtao, bokeh, bloom]) p.enabled = false;
  composer.setSize(64, 64);   // estreno a tamaño mínimo: compila y enlaza sin reservar búferes grandes
  for (const on of stages) {
    for (const p of on) p.enabled = true;
    renderer.shadowMap.needsUpdate = true;
    composer.render(0);
    await breathe();
  }
  resize();
  ready = true;
  lastPose = '';
  render(0);
  return { renderer };
}
