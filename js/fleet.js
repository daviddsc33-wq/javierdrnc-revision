// Visores 3D de la flota. Un solo contexto WebGL renderiza cada ficha
// por turnos (scissor) y copia el resultado a su lienzo 2D.
// Arrastrar gira el modelo; al pasar el ratón, las hélices arrancan.

import * as THREE from 'three';
import { buildMavic, buildFPV7 } from './models.js';
import { buildFPV5HQ } from './fpv5-hq.js';
import { buildWhoopHQ } from './whoop-hq.js';
import { buildAvataHQ } from './avata-hq.js';
import { buildRS4HQ } from './rs4-hq.js';
import { studioEnvHQ } from './render-hq.js';
import { productPipeline, productLights, productShadows, mergeStatic } from './product-render.js';

const BUILDERS = {
  mavic: () => buildMavic(),
  fpv5: () => buildFPV5HQ(),
  fpv7: () => buildFPV7(),
  whoop: () => buildWhoopHQ(),
  avata: () => buildAvataHQ(),
  rs4: () => buildRS4HQ(),
};

// Cede el hilo principal un fotograma entre ficha y ficha (cada modelo cuesta decenas de ms)
const breathe = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

export async function initFleet(views, { reduced = false } = {}) {
  if (!views.length) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    return null;
  }
  // Resolución de las fichas: tope 1,35× (con antialiasing ×2 en retina no se distingue de 1,5× y cuesta menos)
  const dpr = Math.min(window.devicePixelRatio || 1, 1.35);
  const coarse = window.matchMedia('(pointer: coarse)').matches;
  const samples = (window.devicePixelRatio || 1) >= 1.3 ? 2 : 4;
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // Render de producto (como el Mavic de óptica): estudio, curva AgX, oclusión y sombras propias
  renderer.toneMapping = THREE.AgXToneMapping;
  renderer.toneMappingExposure = 1.35;
  renderer.setClearColor(0x000000, 0);
  const env = studioEnvHQ(renderer);

  let bufW = 0, bufH = 0;
  const tiles = [];
  const makeTile = (el) => {
    const model = BUILDERS[el.dataset.craft]?.();
    if (!model) return null;
    if (model.shadows) mergeStatic(model.root, model.props.map((p) => p.group));
    const scene = new THREE.Scene();
    scene.environment = env;
    const key = productLights(scene);

    const pivot = new THREE.Group();
    scene.add(pivot);
    pivot.add(model.root);

    // Centrar y encuadrar
    const box = new THREE.Box3().setFromObject(model.root);
    const center = box.getCenter(new THREE.Vector3());
    model.root.position.sub(center);
    const size = box.getSize(new THREE.Vector3());
    const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 100);
    const r = Math.hypot(size.x, size.y, size.z) / 2;
    if (model.shadows) productShadows(renderer, key, r * 2);
    const fx = productPipeline(renderer, scene, camera, { aoRadius: r * 0.14, samples, tone: model.tone });

    const canvas = document.createElement('canvas');
    el.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const t = {
      el, model, scene, pivot, camera, canvas, ctx, fx, baseY: model.root.position.y,
      rH: Math.hypot(size.x, size.z) / 2, rV: size.y / 2,
      yaw: -0.65, pitch: 0.32, targetYaw: -0.65, targetPitch: 0.32,
      spin: 0, targetSpin: 0,
      visible: false, dragging: false, w: 0, h: 0,
      lastX: 0, lastY: 0, idle: 0,
    };

    el.addEventListener('pointerdown', (e) => {
      t.dragging = true; t.lastX = e.clientX; t.lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
      if (e.pointerType === 'touch') t.targetSpin = 1;   // en táctil no hay «pasar por encima»: arrancan con el dedo
    });
    el.addEventListener('pointermove', (e) => {
      if (!t.dragging) return;
      t.targetYaw += (e.clientX - t.lastX) * 0.012;
      t.targetPitch = THREE.MathUtils.clamp(t.targetPitch + (e.clientY - t.lastY) * 0.006, -0.1, 0.9);
      t.lastX = e.clientX; t.lastY = e.clientY; t.idle = 0;
    });
    // El gesto vertical es del scroll (touch-action: pan-y); si el dedo empieza girando en horizontal,
    // el navegador ya no desplaza y el componente vertical inclina el dron
    const end = (e) => { t.dragging = false; if (e.pointerType === 'touch') t.targetSpin = 0; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    const card = el.closest('.craft') || el;
    card.addEventListener('pointerenter', () => { t.targetSpin = 1; });
    card.addEventListener('pointerleave', () => { t.targetSpin = 0; });
    return t;
  };

  function sizeTile(t) {
    const r = t.el.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr));
    const h = Math.max(1, Math.round(r.height * dpr));
    if (w === t.w && h === t.h) return;
    t.w = w; t.h = h;
    t.canvas.width = w; t.canvas.height = h;
    t.camera.aspect = w / h;
    const vf = THREE.MathUtils.degToRad(t.camera.fov / 2);
    const hf = Math.atan(Math.tan(vf) * t.camera.aspect);
    const rV = t.rV + t.rH * Math.sin(0.45);
    t.dist = Math.max(t.rH / Math.tan(hf), rV / Math.tan(vf)) + t.rH * 0.3;
    t.camera.updateProjectionMatrix();
    t.fx.setSize(w, h);
    if (w > bufW || h > bufH) {
      bufW = Math.max(bufW, w); bufH = Math.max(bufH, h);
      renderer.setSize(bufW, bufH, false);
    }
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const t = tiles.find((x) => x.el === e.target);
      if (t) {
        t.visible = e.isIntersecting;
        // En táctil, la primera vez que aparece: un leve giro de ida y vuelta para indicar que se puede girar
        if (t.visible && coarse && !reduced && !t.hinted && e.intersectionRatio > 0.5) { t.hinted = true; t.hintStart = performance.now() + 350; }
      }
    }
    if (tiles.some((t) => t.visible) && !running) start();
  }, { rootMargin: '10% 0px', threshold: [0, 0.5] });

  const ro = new ResizeObserver(() => tiles.forEach(sizeTile));

  let running = false;
  let last = performance.now();
  function start() { running = true; last = performance.now(); requestAnimationFrame(loop); }

  function loop(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    let any = false;
    for (const t of tiles) {
      if (!t.visible || !t.w) continue;
      any = true;
      if (!t.dragging && !reduced) {
        t.idle += dt;
        t.targetYaw += dt * 0.22;
      }
      t.yaw += (t.targetYaw - t.yaw) * 0.08;
      t.pitch += (t.targetPitch - t.pitch) * 0.08;
      t.spin += (t.targetSpin - t.spin) * 0.04;
      let hint = 0;
      if (t.hintStart) {
        const k = (now - t.hintStart) / 1600;
        if (k >= 1) t.hintStart = 0;
        else if (k > 0) hint = Math.sin(k * Math.PI * 2) * 0.55 * (1 - k);
      }
      t.pivot.rotation.y = t.yaw + hint;
      t.model.update(dt, t.spin);
      // flotación sobre la altura de centrado (no en lugar de ella: los equipos altos se descolocaban)
      t.model.root.position.y = t.baseY + Math.sin(now / 900) * 0.02 * t.spin;

      const d = t.dist;
      t.camera.position.set(0, Math.sin(t.pitch) * d, Math.cos(t.pitch) * d);
      t.camera.lookAt(0, 0, 0);

      renderer.setViewport(0, 0, t.w, t.h);
      renderer.setScissor(0, 0, t.w, t.h);
      renderer.setScissorTest(true);
      renderer.clear();
      t.fx.render();
      t.ctx.clearRect(0, 0, t.w, t.h);
      t.ctx.drawImage(renderer.domElement, 0, bufH - t.h, t.w, t.h, 0, 0, t.w, t.h);
    }
    if (any) requestAnimationFrame(loop);
    else running = false;
  }

  // Las fichas se montan de una en una, cada una en su propio fotograma, y sus sombreadores se
  // compilan en segundo plano contra un búfer como el del posproceso (si no, se compilan de golpe
  // en su primer fotograma)
  const probe = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
  for (const el of views) {
    const t = makeTile(el);
    if (t && renderer.compileAsync) {
      try {
        renderer.setRenderTarget(probe);
        await renderer.compileAsync(t.scene, t.camera);
      } catch {}
      renderer.setRenderTarget(null);
    }
    if (t) {
      tiles.push(t);
      sizeTile(t);
      ro.observe(t.el);
      io.observe(t.el);
    }
    await breathe();
  }
  probe.dispose();
  return { renderer };
}
