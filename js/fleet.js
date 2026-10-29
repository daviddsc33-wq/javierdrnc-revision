// Visores 3D de la flota. Un solo contexto WebGL renderiza cada ficha
// por turnos (scissor) y copia el resultado a su lienzo 2D.
// Arrastrar gira el modelo; al pasar el ratón, las hélices arrancan.

import * as THREE from 'three';
import { createStudioEnv, buildMavic, buildFPV7, buildWhoop, buildAvata } from './models.js';

const BUILDERS = {
  mavic: () => buildMavic(),
  fpv7: () => buildFPV7(),
  whoop: () => buildWhoop(),
  avata: () => buildAvata(),
};

export function initFleet(views, { reduced = false } = {}) {
  if (!views.length) return null;
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (err) {
    return null;
  }
  const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setClearColor(0x000000, 0);
  const env = createStudioEnv(renderer);

  let bufW = 0, bufH = 0;
  const tiles = views.map((el) => {
    const model = BUILDERS[el.dataset.craft]?.();
    if (!model) return null;
    const scene = new THREE.Scene();
    scene.environment = env;
    const key = new THREE.DirectionalLight(0xffffff, 1.3);
    key.position.set(3, 5, 4);
    const rim = new THREE.DirectionalLight(0xc9d2ff, 1.0);
    rim.position.set(-4, 3, -4);
    scene.add(key, rim);

    const pivot = new THREE.Group();
    scene.add(pivot);
    pivot.add(model.root);

    // Centrar y encuadrar
    const box = new THREE.Box3().setFromObject(model.root);
    const center = box.getCenter(new THREE.Vector3());
    model.root.position.sub(center);
    const size = box.getSize(new THREE.Vector3());
    const camera = new THREE.PerspectiveCamera(26, 1, 0.05, 100);

    const canvas = document.createElement('canvas');
    el.appendChild(canvas);
    const ctx = canvas.getContext('2d');

    const t = {
      el, model, scene, pivot, camera, canvas, ctx,
      rH: Math.hypot(size.x, size.z) / 2, rV: size.y / 2,
      yaw: -0.65, pitch: 0.32, targetYaw: -0.65, targetPitch: 0.32,
      spin: 0, targetSpin: 0,
      visible: false, dragging: false, w: 0, h: 0,
      lastX: 0, lastY: 0, idle: 0,
    };

    el.addEventListener('pointerdown', (e) => {
      t.dragging = true; t.lastX = e.clientX; t.lastY = e.clientY;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!t.dragging) return;
      t.targetYaw += (e.clientX - t.lastX) * 0.012;
      t.targetPitch = THREE.MathUtils.clamp(t.targetPitch + (e.clientY - t.lastY) * 0.006, -0.1, 0.9);
      t.lastX = e.clientX; t.lastY = e.clientY; t.idle = 0;
    });
    const end = () => { t.dragging = false; };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    const card = el.closest('.craft') || el;
    card.addEventListener('pointerenter', () => { t.targetSpin = 1; });
    card.addEventListener('pointerleave', () => { t.targetSpin = 0; });
    return t;
  }).filter(Boolean);

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
    if (w > bufW || h > bufH) {
      bufW = Math.max(bufW, w); bufH = Math.max(bufH, h);
      renderer.setSize(bufW, bufH, false);
    }
  }

  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const t = tiles.find((x) => x.el === e.target);
      if (t) t.visible = e.isIntersecting;
    }
    if (tiles.some((t) => t.visible) && !running) start();
  }, { rootMargin: '10% 0px' });
  tiles.forEach((t) => io.observe(t.el));

  const ro = new ResizeObserver(() => tiles.forEach(sizeTile));
  tiles.forEach((t) => ro.observe(t.el));
  tiles.forEach(sizeTile);

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
      t.pivot.rotation.y = t.yaw;
      t.model.update(dt, t.spin);
      t.model.root.position.y = Math.sin(now / 900) * 0.02 * t.spin;

      const d = t.dist;
      t.camera.position.set(0, Math.sin(t.pitch) * d, Math.cos(t.pitch) * d);
      t.camera.lookAt(0, 0, 0);

      renderer.setViewport(0, 0, t.w, t.h);
      renderer.setScissor(0, 0, t.w, t.h);
      renderer.setScissorTest(true);
      renderer.clear();
      renderer.render(t.scene, t.camera);
      t.ctx.clearRect(0, 0, t.w, t.h);
      t.ctx.drawImage(renderer.domElement, 0, bufH - t.h, t.w, t.h, 0, 0, t.w, t.h);
    }
    if (any) requestAnimationFrame(loop);
    else running = false;
  }

  return { renderer };
}
