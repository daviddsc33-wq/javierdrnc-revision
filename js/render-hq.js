// Render de producto para el Mavic: estudio con caída de luz suave y materiales
// afinados (plástico mate con micro-textura, metal satinado, diafragma pavonado,
// hélices de plástico negro). Probado en lab/dron-3d.html.

import * as THREE from 'three';

// Estudio: softboxes con degradado (centro intenso, bordes suaves) para reflejos de producto
export function studioEnvHQ(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(128, 128, 10, 128, 128, 128);
  g.addColorStop(0, '#fff'); g.addColorStop(0.55, '#bbb'); g.addColorStop(1, '#000');
  x.fillStyle = g; x.fillRect(0, 0, 256, 256);
  const soft = new THREE.CanvasTexture(c); soft.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(1, 1);
  const panel = (w, h, px, py, pz, k, tint = [1, 1, 1]) => {
    const m = new THREE.MeshBasicMaterial({ map: soft, color: new THREE.Color(k * tint[0], k * tint[1], k * tint[2]), side: THREE.DoubleSide });
    const p = new THREE.Mesh(geo, m);
    p.scale.set(w, h, 1); p.position.set(px, py, pz); p.lookAt(0, 0, 0);
    scene.add(p);
  };
  panel(10, 4, 0, 8, 1, 6.0);                       // softbox cenital grande
  panel(2.2, 10, -7, 2, 3, 4.2, [1, 0.97, 0.93]);    // tira izquierda, algo cálida
  panel(1.6, 10, 7, 1, -1, 3.0, [0.9, 0.95, 1]);     // tira derecha, algo fría
  panel(12, 1.4, 0, 3, -7, 3.4);                     // contraluz: dibuja el borde
  panel(6, 1.2, 1, -5, 5, 0.6);                      // rebote bajo
  // acento frontal en cristales: disco con caída suave (un panel rectangular dejaba destellos cuadrados)
  {
    const m = new THREE.MeshBasicMaterial({ map: soft, color: new THREE.Color(2.6, 2.6, 2.6), side: THREE.DoubleSide });
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.6, 64), m);
    disc.position.set(4.5, 3, 6); disc.lookAt(0, 0, 0);
    scene.add(disc);
  }
  panel(3, 3, -3, 4, 6, 1.6);                        // relleno frontal suave
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.02);
  pm.dispose();
  return rt.texture;
}

// Plástico granulado tipo DJI, generado en el sombreado: grano fino en relieve y leves
// variaciones de brillo en función de la posición en el propio modelo (misma densidad en
// todas las piezas, sin depender de cómo se envuelve una textura). Se atenúa a distancia
// para no parpadear.
const GRAIN_GLSL = /* glsl */`
varying vec3 vObjPos;
uniform float uGrainFreq;
uniform float uGrainAmp;
uniform float uSmudgeFreq;
float gHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float gNoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(gHash(i), gHash(i + vec3(1, 0, 0)), f.x), mix(gHash(i + vec3(0, 1, 0)), gHash(i + vec3(1, 1, 0)), f.x), f.y),
             mix(mix(gHash(i + vec3(0, 0, 1)), gHash(i + vec3(1, 0, 1)), f.x), mix(gHash(i + vec3(0, 1, 1)), gHash(i + vec3(1, 1, 1)), f.x), f.y), f.z);
}
vec3 gPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDir) {
  vec3 vSigmaX = dFdx(surf_pos), vSigmaY = dFdy(surf_pos);
  vec3 R1 = cross(vSigmaY, surf_norm), R2 = cross(surf_norm, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDir;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}
`;

export function grainy(mat, { freq = 520, amp = 0.00032, smudge = 2.2 } = {}) {
  // Tres escalas que se relevan con la distancia, como en una foto:
  //  · cerca: grano fino en relieve (acabado granulado)
  //  · media: "piel de naranja" más ancha, que sigue viéndose cuando el grano ya no
  //  · lejos: el grano no resuelto se vuelve brillo más mate, con manchas suaves de tono
  //    y brillo, marcas de uso algo más satinadas y la tapa de la batería un pelo más lisa
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGrainFreq = { value: freq };
    sh.uniforms.uGrainAmp = { value: amp };
    sh.uniforms.uSmudgeFreq = { value: smudge };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GRAIN_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        diffuseColor.rgb *= 0.955 + 0.09 * (gNoise(vObjPos * 4.5) * 0.6 + gNoise(vObjPos * 17.0) * 0.4);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        {
          float fw = length(fwidth(vObjPos * uGrainFreq));
          float unresolved = clamp(fw * 0.9 - 0.4, 0.0, 1.0);
          roughnessFactor = mix(roughnessFactor, min(1.0, roughnessFactor * 1.18 + 0.04), unresolved);
          float mott = gNoise(vObjPos * uSmudgeFreq) * 0.55 + gNoise(vObjPos * uSmudgeFreq * 3.1) * 0.3 + gNoise(vObjPos * uSmudgeFreq * 9.0) * 0.15;
          roughnessFactor *= mix(0.83, 1.15, mott);
          float prints = smoothstep(0.66, 0.8, gNoise(vObjPos * 11.0 + 3.7)) * smoothstep(0.5, 0.7, gNoise(vObjPos * 2.3));
          roughnessFactor *= 1.0 - 0.16 * prints;
          float bat = step(-0.88, vObjPos.z) * step(vObjPos.z, -0.3) * step(0.08, vObjPos.y);
          roughnessFactor *= 1.0 - 0.12 * bat;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          vec3 gp = vObjPos * uGrainFreq;
          float amp = uGrainAmp * clamp(1.4 - length(fwidth(gp)) * 0.9, 0.0, 1.0);
          float h = (gNoise(gp) * 0.45 + gNoise(gp * 2.3) * 0.35 + gNoise(gp * 5.1) * 0.2) * amp;
          vec3 mp = vObjPos * 150.0;
          h += gNoise(mp) * uGrainAmp * 1.1 * clamp(1.4 - length(fwidth(mp)) * 0.9, 0.0, 1.0);   // piel de naranja suave, no estuco
          normal = gPerturb(-vViewPosition, normal, vec2(dFdx(h), dFdy(h)), faceDirection);
        }`);
  };
  mat.customProgramCacheKey = () => `grain3-${freq}-${amp}-${smudge}`;
  return mat;
}

// Cristal: solo refleja el entorno (las cajas de luz). Sin brillo de las luces directas,
// que en un cristal tan pulido salía como un punto diminuto que el bloom convertía en recuadro.
export function envOnlySpecular(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
      reflectedLight.directSpecular = vec3(0.0);
      #ifdef USE_CLEARCOAT
        clearcoatSpecularDirect = vec3(0.0);
      #endif`);
  };
  mat.customProgramCacheKey = () => 'env-only-specular';
  return mat;
}

// Carcasa de cámara: magnesio con micro-textura y, en las zonas que marca `mask` (expresión GLSL
// sobre vObjPos, 0–1), piel granulada: más mate, algo más oscura y con relieve de poro. Una sola
// superficie sin piezas superpuestas (una piel pegada encima dejaba aristas y huecos).
export function cameraSkin(mat, mask) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGrainFreq = { value: 1100 };
    sh.uniforms.uGrainAmp = { value: 0.0001 };
    sh.uniforms.uSmudgeFreq = { value: 3 };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GRAIN_GLSL + `\nfloat leatherMask() { vec3 p = vObjPos; return clamp(${mask}, 0.0, 1.0); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
        { float lm = leatherMask(); diffuseColor.rgb *= mix(1.0, 0.72, lm) * (0.97 + 0.06 * gNoise(vObjPos * 9.0)); }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        { float lm = leatherMask(); roughnessFactor = mix(roughnessFactor * (0.9 + 0.2 * gNoise(vObjPos * 3.0)), 0.86, lm); }`)
      .replace('#include <clearcoat_normal_fragment_begin>', `#include <clearcoat_normal_fragment_begin>`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float lm = leatherMask();
          vec3 gp = vObjPos * mix(1100.0, 2600.0, lm);
          float fade = clamp(1.4 - length(fwidth(gp)) * 0.9, 0.0, 1.0);
          float h = (gNoise(gp) * 0.6 + gNoise(gp * 2.1) * 0.4);
          h = mix(h * 0.0001, (1.0 - abs(h * 2.0 - 1.0)) * 0.0012, lm) * fade;   // poro de la piel: crestas
          normal = gPerturb(-vViewPosition, normal, vec2(dFdx(h), dFdy(h)), faceDirection);
        }`);
  };
  mat.customProgramCacheKey = () => 'camskin-' + mask;
  return mat;
}

// Pieza impresa en TPU: capas de impresión en relieve (líneas horizontales finas en el eje Y
// del objeto) y algo de brillo irregular. Se atenúan a distancia para no hacer moiré.
export function layerLines(mat, { pitch = 0.004, amp = 0.0006 } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uGrainFreq = { value: 1 };
    sh.uniforms.uGrainAmp = { value: amp };
    sh.uniforms.uSmudgeFreq = { value: 1 / pitch };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObjPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObjPos = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GRAIN_GLSL)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor *= 0.9 + 0.2 * gNoise(vObjPos * 30.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float ph = vObjPos.y * uSmudgeFreq * 6.2831853;
          float fade = clamp(1.6 - length(fwidth(vec2(ph))) * 0.5, 0.0, 1.0);
          float h = (abs(sin(ph)) - 0.6) * uGrainAmp * fade;
          normal = gPerturb(-vViewPosition, normal, vec2(dFdx(h), dFdy(h)), faceDirection);
        }`);
  };
  mat.customProgramCacheKey = () => `layers-${pitch}-${amp}`;
  return mat;
}

// Sustituye los materiales de un modelo por sus versiones de producto (copias:
// los de la flota no cambian). Se reconocen por el color base de materials().
export function upgradeMaterials(root) {
  const cache = new Map();
  const upgrade = (m) => {
    if (cache.has(m)) return cache.get(m);
    let n = m.clone();
    const hex = m.color ? m.color.getHex() : 0;
    if (m.isMeshPhysicalMaterial && (hex === 0x3a3b3f || hex === 0x1d1e21 || hex === 0x17181b)) {
      // plástico de carcasa: mate granulado (acabado DJI), sin brillo aterciopelado
      const light = hex === 0x3a3b3f;
      n = grainy(new THREE.MeshPhysicalMaterial({
        // gris oscuro de DJI (no negro): sobre el fondo negro necesita volumen
        color: light ? 0x45464b : hex === 0x17181b ? 0x1d1e21 : 0x242529,
        roughness: light ? 0.58 : 0.55, metalness: 0.02,
        clearcoat: 0.06, clearcoatRoughness: 0.55,
        specularIntensity: 0.7, envMapIntensity: 1.1, side: m.side,
      }));
    } else if (hex === 0x3a3b40 || hex === 0x8d9097) {
      // metal satinado
      n = new THREE.MeshPhysicalMaterial({ color: m.color, metalness: 1, roughness: 0.3, anisotropy: 0.75, anisotropyRotation: Math.PI / 2, side: m.side, envMapIntensity: 1.2 });
    } else if (hex === 0x6a6b72) {
      // láminas del diafragma: metal oscuro pavonado, visible con la luz rasante
      n = new THREE.MeshPhysicalMaterial({ color: 0x46464c, metalness: 0.7, roughness: 0.34, side: THREE.DoubleSide, envMapIntensity: 1.4 });
    } else if (hex === 0x101012) {
      // hélices: plástico negro satinado
      n = new THREE.MeshPhysicalMaterial({ color: 0x141416, roughness: 0.42, metalness: 0, clearcoat: 0.4, clearcoatRoughness: 0.35, side: THREE.DoubleSide, transparent: m.transparent, opacity: m.opacity });
    } else if (n.transparent && n.iridescence) {
      n.envMapIntensity = (n.envMapIntensity || 1) * 1.35;   // cristal: reflejos más vivos
      envOnlySpecular(n);
    }
    cache.set(m, n);
    return n;
  };
  root.traverse((o) => { if (o.isMesh) o.material = upgrade(o.material); });
}
