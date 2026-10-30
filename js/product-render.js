// Render de producto para modelos pequeños (fichas de la flota y laboratorio):
// el mismo acabado que el Mavic de la sección de óptica, en versión ligera.
//  · iluminación de estudio y curva fotográfica AgX (las pone quien crea el renderer)
//  · oclusión ambiental (GTAO): las piezas se oscurecen donde se tocan, que es lo
//    que quita el aspecto de videojuego
//  · antialiasing ×4
// Sin resplandor: rompería el fondo transparente y a este tamaño no se aprecia.

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// tone: curva propia del modelo ({ mapping, exposure }); por defecto, la del renderer (AgX).
// Los negros profundos (una cámara negra) necesitan ACES: AgX los levanta a gris.
export function productPipeline(renderer, scene, camera, { aoRadius = 0.18, samples = 4, tone = null } = {}) {
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples }));
  composer.setPixelRatio(1);
  composer.addPass(new RenderPass(scene, camera));
  const gtao = new GTAOPass(scene, camera, 1, 1);
  // Oclusión a media resolución: es una sombra suave, no se distingue y cuesta la cuarta parte
  const gtaoSetSize = gtao.setSize.bind(gtao);
  gtao.setSize = (w, h) => gtaoSetSize(Math.max(1, Math.round(w / 2)), Math.max(1, Math.round(h / 2)));
  gtao.updateGtaoMaterial({ radius: aoRadius, distanceExponent: 1.5, thickness: 1.2, scale: 1.1 });
  gtao.blendIntensity = 0.95;
  composer.addPass(gtao);
  composer.addPass(new OutputPass());
  return {
    gtao,
    setSize(w, h) { composer.setSize(w, h); },
    render() {
      if (!tone) { composer.render(); return; }
      const m = renderer.toneMapping, e = renderer.toneMappingExposure;
      renderer.toneMapping = tone.mapping;
      renderer.toneMappingExposure = tone.exposure;
      composer.render();
      renderer.toneMapping = m;
      renderer.toneMappingExposure = e;
    },
  };
}

// Luz de estudio para el render de producto: principal, contorno y una ventana rectangular
// encima (softbox), que da los brillos largos y suaves sobre carbono y plástico.
// Devuelve la principal para las sombras.
let areaReady = false;
export function productLights(scene) {
  if (!areaReady) { RectAreaLightUniformsLib.init(); areaReady = true; }
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(3, 5, 4);
  const rim = new THREE.DirectionalLight(0xc9d2ff, 1.8);
  rim.position.set(-4, 3, -4);
  const box = new THREE.RectAreaLight(0xffffff, 5, 4, 2.2);
  box.position.set(0.6, 4, 1.6);
  box.lookAt(0, 0, 0);
  scene.add(key, rim, box);
  return key;
}

// Sombras propias suaves del modelo con la luz principal (solo si el modelo las pide)
export function productShadows(renderer, key, size) {
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.01;
  const r = size * 0.75;
  Object.assign(key.shadow.camera, { left: -r, right: r, top: r, bottom: -r, near: 0.5, far: 20 });
  key.shadow.camera.updateProjectionMatrix();
}

// Une las piezas fijas que comparten material en una sola malla (mismo aspecto, muchas menos
// llamadas de dibujo: cada pieza se dibuja en la imagen, la oclusión y la sombra).
// Se dejan aparte las piezas transparentes (necesitan orden de dibujo) y lo que se mueve (keep).
export function mergeStatic(root, keep = []) {
  root.updateMatrixWorld(true);
  const inv = root.matrixWorld.clone().invert();
  const skip = new Set();
  keep.forEach((k) => k.traverse((o) => skip.add(o)));
  const groups = new Map();
  root.traverse((o) => {
    if (!o.isMesh || skip.has(o) || o.material.transparent || Array.isArray(o.material) || o.renderOrder) return;
    const g = o.geometry;
    const sig = [g.index ? 'i' : 'n', ...Object.keys(g.attributes).sort()].join(',');
    const key = o.material.uuid + '|' + sig;
    if (!groups.has(key)) groups.set(key, { mat: o.material, meshes: [], shadow: o.castShadow });
    groups.get(key).meshes.push(o);
  });
  for (const { mat, meshes, shadow } of groups.values()) {
    if (meshes.length < 2) continue;
    const geos = meshes.map((m) => m.geometry.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld)));
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    meshes.forEach((m) => m.removeFromParent());
    const mm = new THREE.Mesh(merged, mat);
    mm.castShadow = mm.receiveShadow = shadow;
    root.add(mm);
  }
}
