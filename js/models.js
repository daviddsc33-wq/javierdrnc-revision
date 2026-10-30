// Modelos procedurales de la flota de Javi.
// Unidad: 1 = 100 mm. Proporciones tomadas de la ficha oficial de DJI
// (Mavic 4 Pro desplegado: 329 × 390 × 135 mm) y de configuraciones FPV estándar.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

const TAU = Math.PI * 2;
const V2 = (x, y) => new THREE.Vector2(x, y);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* ------------------------------------------------------------------ */
/* Entorno de estudio: softboxes en negro, para reflejos de producto  */
/* ------------------------------------------------------------------ */

export function createStudioEnv(renderer) {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  const geo = new THREE.PlaneGeometry(1, 1);
  const panel = (w, h, x, y, z, k) => {
    const m = new THREE.MeshBasicMaterial({ color: new THREE.Color(k, k, k), side: THREE.DoubleSide });
    const p = new THREE.Mesh(geo, m);
    p.scale.set(w, h, 1);
    p.position.set(x, y, z);
    p.lookAt(0, 0, 0);
    scene.add(p);
  };
  panel(9, 3.2, 0, 7, 1.5, 3.2);     // softbox cenital
  panel(1.4, 9, -7, 1.5, 2.5, 2.4);  // tira lateral izquierda
  panel(1.0, 9, 7, 0.5, -1.5, 1.4);  // tira lateral derecha
  panel(10, 1.0, 0, 2.5, -7, 1.8);   // contra (borde)
  panel(5, 0.8, 2, -5, 5, 0.35);     // relleno bajo
  panel(0.6, 4, 4, 3, 6, 2.0);       // acento frontal (brillo en cristales)
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(scene, 0.035);
  pm.dispose();
  return rt.texture;
}

/* ------------------------------------------------------------------ */
/* Texturas generadas                                                  */
/* ------------------------------------------------------------------ */

function canvasTex(size, draw, { repeat = 1, color = false } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

function grainTexture() {
  return canvasTex(512, (x, s) => {
    const img = x.createImageData(s, s);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = 128 + (Math.random() - 0.5) * 70;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    x.putImageData(img, 0, 0);
  }, { repeat: 5 });
}

function carbonTexture() {
  return canvasTex(256, (x, s) => {
    x.fillStyle = '#111';
    x.fillRect(0, 0, s, s);
    const n = 16, w = s / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const horiz = (i + j) % 2 === 0;
        const g = x.createLinearGradient(i * w, j * w, horiz ? i * w + w : i * w, horiz ? j * w : j * w + w);
        g.addColorStop(0, '#0d0d0e');
        g.addColorStop(0.5, '#2a2a2c');
        g.addColorStop(1, '#0d0d0e');
        x.fillStyle = g;
        x.fillRect(i * w + 0.5, j * w + 0.5, w - 1, w - 1);
      }
    }
  }, { repeat: 3, color: true });
}

function glowTexture() {
  return canvasTex(256, (x, s) => {
    x.fillStyle = '#000';
    x.fillRect(0, 0, s, s);
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(70,52,150,1)');
    g.addColorStop(0.35, 'rgba(34,22,84,1)');
    g.addColorStop(0.7, 'rgba(10,7,26,1)');
    g.addColorStop(1, 'rgba(0,0,0,1)');
    x.fillStyle = g;
    x.fillRect(0, 0, s, s);
    // reflejo de ventana en el elemento trasero
    const h = x.createRadialGradient(s * 0.36, s * 0.32, 0, s * 0.36, s * 0.32, s * 0.16);
    h.addColorStop(0, 'rgba(235,228,255,0.85)');
    h.addColorStop(0.5, 'rgba(160,140,255,0.25)');
    h.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = h;
    x.fillRect(0, 0, s, s);
    x.strokeStyle = 'rgba(190,175,255,0.22)';
    x.lineWidth = 3;
    x.beginPath();
    x.arc(s / 2, s / 2, s * 0.3, Math.PI * 1.05, Math.PI * 1.55);
    x.stroke();
  }, { color: true });
}

function blurDiscTexture(blades = 2) {
  return canvasTex(512, (x, s) => {
    const c = s / 2;
    x.clearRect(0, 0, s, s);
    for (let i = 0; i < 360; i++) {
      const a = (i / 360) * TAU;
      const k = 0.5 + 0.5 * Math.cos(a * blades);
      x.strokeStyle = `rgba(40,40,44,${0.08 + 0.32 * k * k})`;
      x.lineWidth = 3;
      x.beginPath();
      x.moveTo(c + Math.cos(a) * c * 0.12, c + Math.sin(a) * c * 0.12);
      x.lineTo(c + Math.cos(a) * c * 0.98, c + Math.sin(a) * c * 0.98);
      x.stroke();
    }
    const fade = x.createRadialGradient(c, c, c * 0.1, c, c, c);
    fade.addColorStop(0, 'rgba(0,0,0,0)');
    fade.addColorStop(0.9, 'rgba(0,0,0,0)');
    fade.addColorStop(1, 'rgba(0,0,0,1)');
    x.globalCompositeOperation = 'destination-out';
    x.fillStyle = fade;
    x.fillRect(0, 0, s, s);
  }, { color: true });
}

// Grabado del anillo frontal: datos reales de la óptica, sin logotipos.
function engravingTexture(top, bottom = '') {
  return canvasTex(1024, (x, s) => {
    const c = s / 2;
    x.fillStyle = '#060607';
    x.fillRect(0, 0, s, s);
    x.fillStyle = 'rgba(235,235,240,0.82)';
    x.font = '400 34px "Fragment Mono", ui-monospace, monospace';
    x.textBaseline = 'middle';
    const arc = (text, radius, flip) => {
      const track = 3;
      const widths = text.split('').map((ch) => x.measureText(ch).width + track);
      const total = widths.reduce((a, b) => a + b, 0);
      let a = (flip ? Math.PI / 2 : -Math.PI / 2) + (flip ? 1 : -1) * (total / radius) / 2;
      text.split('').forEach((ch, i) => {
        const w = widths[i] / radius;
        const mid = a + (flip ? -w / 2 : w / 2);
        x.save();
        x.translate(c + Math.cos(mid) * radius, c + Math.sin(mid) * radius);
        x.rotate(mid + (flip ? -Math.PI / 2 : Math.PI / 2));
        x.fillText(ch, -x.measureText(ch).width / 2, 0);
        x.restore();
        a += flip ? -w : w;
      });
    };
    arc(top, c * 0.865, false);
    if (bottom) arc(bottom, c * 0.865, true);
    x.strokeStyle = 'rgba(235,235,240,0.32)';
    x.lineWidth = 2;
    for (let i = 0; i < 120; i++) {
      const t = (i / 120) * TAU;
      const r1 = c * 0.975, r2 = c * (i % 10 === 0 ? 0.94 : 0.958);
      x.beginPath();
      x.moveTo(c + Math.cos(t) * r1, c + Math.sin(t) * r1);
      x.lineTo(c + Math.cos(t) * r2, c + Math.sin(t) * r2);
      x.stroke();
    }
  }, { color: true });
}

/* ------------------------------------------------------------------ */
/* Materiales compartidos                                              */
/* ------------------------------------------------------------------ */

let MATS = null;
export function materials() {
  if (MATS) return MATS;
  const grain = grainTexture();
  const carbon = carbonTexture();
  MATS = {
    shell: new THREE.MeshPhysicalMaterial({
      color: 0x3a3b3f, roughness: 0.52, metalness: 0.08,
      clearcoat: 0.3, clearcoatRoughness: 0.55,
      bumpMap: grain, bumpScale: 0.35,
    }),
    shellDark: new THREE.MeshPhysicalMaterial({
      color: 0x1d1e21, roughness: 0.48, metalness: 0.1, clearcoat: 0.25, clearcoatRoughness: 0.55,
      bumpMap: grain, bumpScale: 0.25,
    }),
    ring: new THREE.MeshStandardMaterial({ color: 0x1a1a1c, metalness: 0.92, roughness: 0.3, side: THREE.DoubleSide }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xb8bac2, metalness: 1, roughness: 0.16 }),
    satin: new THREE.MeshStandardMaterial({ color: 0x3a3b40, metalness: 0.85, roughness: 0.34 }),
    alu: new THREE.MeshStandardMaterial({ color: 0x8d9097, metalness: 1, roughness: 0.28 }),
    blade: new THREE.MeshStandardMaterial({ color: 0x6a6b72, metalness: 0.88, roughness: 0.3, envMapIntensity: 2.2, side: THREE.DoubleSide }),
    wall: new THREE.MeshStandardMaterial({ color: 0x050506, metalness: 0.2, roughness: 0.85, side: THREE.DoubleSide }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x07070c, metalness: 0, roughness: 0.03,
      transparent: true, opacity: 0.32, depthWrite: false,
      clearcoat: 1, clearcoatRoughness: 0.02,
      iridescence: 1, iridescenceIOR: 1.7, iridescenceThicknessRange: [180, 560],
      envMapIntensity: 2.4, specularIntensity: 1,
    }),
    innerGlass: new THREE.MeshPhysicalMaterial({
      color: 0x120a26, metalness: 0, roughness: 0.05,
      transparent: true, opacity: 0.22, depthWrite: false,
      clearcoat: 1, iridescence: 0.9, iridescenceIOR: 1.5,
      envMapIntensity: 1.8,
    }),
    carbon: new THREE.MeshPhysicalMaterial({
      color: 0x707076, map: carbon, roughness: 0.42, metalness: 0.15,
      clearcoat: 0.55, clearcoatRoughness: 0.28, envMapIntensity: 0.55,
    }),
    rubber: new THREE.MeshStandardMaterial({ color: 0x141415, roughness: 0.9, metalness: 0 }),
    prop: new THREE.MeshPhysicalMaterial({
      color: 0x101012, roughness: 0.32, metalness: 0.05, clearcoat: 0.7, side: THREE.DoubleSide,
    }),
    propSmoke: new THREE.MeshPhysicalMaterial({
      color: 0x2a2a30, roughness: 0.15, metalness: 0, transparent: true, opacity: 0.78,
      clearcoat: 1, side: THREE.DoubleSide, depthWrite: false,
    }),
    led: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.6, 0.55) }),
    ledRed: new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 0.15, 0.12) }),
    label: new THREE.MeshStandardMaterial({ color: 0x3c3c40, roughness: 0.7, metalness: 0.1 }),
  };
  MATS.shellDS = MATS.shell.clone();
  MATS.shellDS.side = THREE.DoubleSide;
  MATS.shellDarkDS = MATS.shellDark.clone();
  MATS.shellDarkDS.side = THREE.DoubleSide;
  MATS.pod = MATS.shell.clone();
  MATS.pod.bumpMap = null;
  MATS.pod.side = THREE.DoubleSide;
  return MATS;
}

/* ------------------------------------------------------------------ */
/* Utilidades geométricas                                              */
/* ------------------------------------------------------------------ */

function mesh(geo, mat, parent) {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = false;
  m.receiveShadow = false;
  if (parent) parent.add(m);
  return m;
}

// Lathe con el eje mirando a +Z
function latheZ(points, seg = 96) {
  const g = new THREE.LatheGeometry(points.map(([x, y]) => V2(x, y)), seg);
  g.rotateX(Math.PI / 2);
  return g;
}

function capGeometry(baseR, bulge, seg = 64) {
  const R = (baseR * baseR + bulge * bulge) / (2 * bulge);
  const theta = Math.asin(Math.min(1, baseR / R));
  const g = new THREE.SphereGeometry(R, seg, 16, 0, TAU, 0, theta);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -(R - bulge));
  return g;
}

function beam(from, to, w, h, mat, parent, radius) {
  const len = from.distanceTo(to);
  const g = new RoundedBoxGeometry(w, h, len, 3, radius ?? Math.min(w, h) * 0.45);
  const m = mesh(g, mat, parent);
  m.position.copy(from).add(to).multiplyScalar(0.5);
  const dir = to.clone().sub(from).normalize();
  m.quaternion.setFromUnitVectors(V3(0, 0, 1), dir);
  return m;
}

function cylY(r, h, mat, parent, seg = 48, rTop) {
  return mesh(new THREE.CylinderGeometry(rTop ?? r, r, h, seg), mat, parent);
}

/* ------------------------------------------------------------------ */
/* Diafragma de 9 láminas                                              */
/* ------------------------------------------------------------------ */
// Cada lámina se construye en coordenadas normalizadas a la apertura
// (borde interior a distancia 1 del centro) y se escala con el radio de
// apertura. El borde mezcla recta y círculo: polígono redondeado real.

function buildIris(maxRadius, count = 9) {
  const M = materials();
  const group = new THREE.Group();
  const span = (Math.PI / count) * 1.75;
  const steps = 28;
  // Geometría en coordenadas normalizadas (borde interior a distancia 1).
  // El borde exterior se recalcula para no salir nunca de la pared del barril.
  const makeGeo = (outer) => {
    const shape = new THREE.Shape();
    for (let i = 0; i <= steps; i++) {
      const b = -span + (2 * span * i) / steps;
      const d = 1 / Math.pow(Math.cos(b), 0.55);
      const x = Math.sin(b) * d, y = Math.cos(b) * d;
      i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
    }
    for (let i = 0; i <= 12; i++) {
      const b = span - (2 * span * i) / 12;
      shape.lineTo(Math.sin(b) * outer, Math.cos(b) * outer);
    }
    shape.closePath();
    return new THREE.ExtrudeGeometry(shape, { depth: 0.0008, bevelEnabled: true, bevelThickness: 0.0005, bevelSize: 0.035, bevelSegments: 2, curveSegments: 4 });
  };
  let outer = 0;
  let geo = null;

  const blades = [];
  for (let i = 0; i < count; i++) {
    const pivot = new THREE.Group();
    const m = mesh(new THREE.BufferGeometry(), M.blade, pivot);
    m.rotation.y = 0.12;
    m.position.z = i * 0.00012;
    pivot.userData.base = (i / count) * TAU;
    group.add(pivot);
    blades.push({ pivot, m });
  }

  // N: número f. Radio de apertura ∝ 1/N.
  const set = (N) => {
    const open = THREE.MathUtils.clamp((11 - N) / 9, 0, 1);
    const a = maxRadius * (2.0 / N);
    const want = Math.max(1.6, (maxRadius * 1.32) / a);
    if (!geo || Math.abs(want - outer) / outer > 0.04) {
      outer = want;
      geo?.dispose();
      geo = makeGeo(outer);
      for (const { m } of blades) m.geometry = geo;
    }
    const twist = (1 - open) * 0.42;
    for (const { pivot, m } of blades) {
      pivot.rotation.z = pivot.userData.base + twist;
      m.scale.set(a, a, 1);
    }
    return open;
  };
  set(11);
  return { group, set };
}

/* ------------------------------------------------------------------ */
/* Objetivo (barril, cristales, grabado, diafragma)                    */
/* ------------------------------------------------------------------ */

function buildLens({ r, depth, iris = false, engraving = null, glowBoost = 1 }) {
  const M = materials();
  const g = new THREE.Group();

  // Bisel mecanizado
  mesh(latheZ([
    [r * 0.80, -depth], [r * 0.80, -0.006], [r * 0.85, 0.008], [r * 0.98, 0.0155],
    [r * 1.04, 0.0135], [r * 1.10, 0.006], [r * 1.13, -0.012], [r * 1.13, -0.05],
  ], 128), M.ring, g);

  // Filo brillante
  const rim = mesh(new THREE.TorusGeometry(r * 0.985, 0.0016, 8, 180), M.chrome, g);
  rim.position.z = 0.0158;
  const rim2 = mesh(new THREE.TorusGeometry(r * 0.852, 0.0011, 8, 180), M.chrome, g);
  rim2.position.z = 0.0082;

  // Pared interior (profundidad)
  const wall = mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, depth, 96, 1, true), M.wall, g);
  wall.rotation.x = Math.PI / 2;
  wall.position.z = -depth / 2;

  // Anillo grabado
  if (engraving) {
    const eng = engravingTexture(...[].concat(engraving));
    const ring = mesh(new THREE.RingGeometry(r * 0.58, r * 0.8, 160), new THREE.MeshStandardMaterial({
      map: eng, emissiveMap: eng, emissive: new THREE.Color(0.55, 0.55, 0.58),
      roughness: 0.55, metalness: 0.3,
    }), g);
    ring.position.z = -0.006;
  } else {
    const ring = mesh(new THREE.RingGeometry(r * 0.5, r * 0.8, 96), M.ring, g);
    ring.position.z = -depth * 0.25;
  }

  // Diafragma
  let irisCtl = null;
  if (iris) {
    // Luz rasante dentro del barril: barre las láminas desde el borde
    const rake = new THREE.SpotLight(0xf2eeff, 11, r * 3, 0.9, 0.6, 0);
    rake.position.set(-r * 0.72, r * 0.62, -depth * 0.2);
    rake.target.position.set(r * 0.2, -r * 0.15, -depth * 0.36);
    g.add(rake, rake.target);
    const rake2 = new THREE.SpotLight(0xd9d2ff, 4, r * 3, 0.9, 0.7, 0);
    rake2.position.set(r * 0.7, -r * 0.6, -depth * 0.22);
    rake2.target.position.set(-r * 0.1, r * 0.1, -depth * 0.36);
    g.add(rake2, rake2.target);
    irisCtl = buildIris(r * 0.6);
    irisCtl.group.position.z = -depth * 0.34;
    g.add(irisCtl.group);
  }

  // Interior: elemento trasero + "sensor" con reflejo violeta
  const glowMat = new THREE.MeshBasicMaterial({ map: glowTexture(), color: new THREE.Color(0.6 * glowBoost, 0.6 * glowBoost, 0.6 * glowBoost) });
  const glow = mesh(new THREE.CircleGeometry(r * 0.8, 64), glowMat, g);
  glow.position.z = -depth + 0.002;

  const back = mesh(capGeometry(r * 0.62, r * 0.12), M.innerGlass, g);
  back.position.z = -depth * 0.62;
  const mid = mesh(capGeometry(r * 0.76, r * 0.14), M.innerGlass, g);
  mid.position.z = -depth * 0.12;

  // Cristal frontal
  const front = mesh(capGeometry(r * 0.85, r * 0.2, 96), M.glass, g);
  front.position.z = 0.004;
  front.renderOrder = 3;

  return {
    group: g,
    setAperture(N) {
      const open = irisCtl ? irisCtl.set(N) : 1;
      const k = (0.18 + 0.95 * open * open) * glowBoost;
      glowMat.color.setScalar(k);
      return open;
    },
  };
}

/* ------------------------------------------------------------------ */
/* Hélices                                                             */
/* ------------------------------------------------------------------ */

function buildBlade(len, chord, { pitch = 0.42, sweep = 0.08 } = {}) {
  const s = new THREE.Shape();
  const N = 22;
  const top = [], bot = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const x = 0.06 * len + u * len * 0.94;
    const c = chord * (0.55 + 1.1 * Math.sin(Math.min(1, u * 1.25) * Math.PI * 0.55) - 0.75 * u * u);
    const sw = sweep * len * u * u;
    top.push([x, c * 0.62 + sw]);
    bot.push([x, -c * 0.38 + sw]);
  }
  s.moveTo(top[0][0], top[0][1]);
  top.forEach(([x, y]) => s.lineTo(x, y));
  bot.reverse().forEach(([x, y]) => s.lineTo(x, y));
  s.closePath();
  const g = new THREE.ShapeGeometry(s, 4);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i);
    const u = x / len;
    const t = pitch * (1 - 0.65 * u);
    p.setXYZ(i, x, y * Math.cos(t), y * Math.sin(t));
  }
  g.rotateX(-Math.PI / 2);
  g.computeVertexNormals();
  return g;
}

export function buildProp({ radius, blades = 2, chord = 0.14, smoke = false, dir = 1, smokeOpacity = 0.78 }) {
  const M = materials();
  const g = new THREE.Group();
  const bladeGeo = buildBlade(radius, chord);
  const solid = new THREE.Group();
  for (let i = 0; i < blades; i++) {
    const b = mesh(bladeGeo, smoke ? M.propSmoke : M.prop, solid);
    b.rotation.y = (i / blades) * TAU;
    if (dir < 0) b.scale.z = -1;
  }
  g.add(solid);
  cylY(0.055, 0.05, M.satin, g, 24);
  const blurMat = new THREE.MeshBasicMaterial({ map: blurDiscTexture(blades), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide });
  const disc = mesh(new THREE.CircleGeometry(radius, 96), blurMat, g);
  disc.rotation.x = -Math.PI / 2;
  disc.position.y = 0.004;
  return {
    group: g,
    solid,
    dir,
    angle: Math.random() * TAU,
    update(dt, speed) {
      this.angle += dt * speed * 60 * this.dir;
      solid.rotation.y = this.angle;
      const blur = THREE.MathUtils.smoothstep(speed, 0.25, 0.75);
      blurMat.opacity = blur * 0.85;
      solid.visible = blur < 0.98;
      solid.children.forEach((c) => {
        c.material.transparent = true;
        c.material.opacity = smoke ? smokeOpacity * (1 - blur) : 1 - blur * 0.9;
      });
    },
  };
}

function motor(parent, pos, { r = 0.15, h = 0.18, bell = 0x3a3b40 } = {}) {
  const M = materials();
  const g = new THREE.Group();
  g.position.copy(pos);
  parent.add(g);
  const base = cylY(r, h, M.shell, g, 48);
  base.position.y = -h * 0.2;
  const b = cylY(r * 0.92, h * 0.38, M.satin, g, 48);
  b.position.y = h * 0.45;
  const ring = cylY(r * 0.94, h * 0.06, M.chrome, g, 48);
  ring.position.y = h * 0.28;
  return g;
}

/* ------------------------------------------------------------------ */
/* DJI Mavic 4 Pro                                                     */
/* ------------------------------------------------------------------ */

export function buildMavic({ props = true } = {}) {
  const M = materials();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Fuselaje: caja redondeada deformada (morro afilado y lomo abombado)
  const fg = new RoundedBoxGeometry(1.04, 0.56, 2.36, 10, 0.16);
  const p = fg.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const zn = z / 1.18;
    if (zn > 0) {
      x *= 1 - 0.3 * zn * zn;
      if (y > 0) y *= 1 - 0.5 * zn * zn;
      else y *= 1 - 0.25 * zn * zn;
      y -= 0.04 * zn * zn;
    } else {
      x *= 1 - 0.14 * zn * zn;
      if (y > 0) y *= 1 - 0.12 * zn * zn;
    }
    if (y > 0) y += 0.06 * Math.max(0, 1 - (x / 0.6) ** 2) * (1 - 0.5 * Math.abs(zn));
    p.setXYZ(i, x, y, z);
  }
  fg.computeVertexNormals();
  mesh(fg, M.shell, body);

  // Batería enrasada en el lomo: se apoya en la altura real del fuselaje
  let topY = 0;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), x = p.getX(i);
    if (z > -0.9 && z < 0.1 && Math.abs(x) < 0.3) topY = Math.max(topY, p.getY(i));
  }
  const bat = mesh(new RoundedBoxGeometry(0.8, 0.12, 1.1, 6, 0.05), M.shellDark, body);
  bat.position.set(0, topY - 0.048, -0.4);
  const grip = mesh(new RoundedBoxGeometry(0.5, 0.02, 0.12, 2, 0.008), M.wall, body);
  grip.position.set(0, topY + 0.006, -0.9);

  // Sensores de visión frontales
  const eyeGeo = new THREE.CircleGeometry(0.055, 32);
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x050507, roughness: 0.05, clearcoat: 1, metalness: 0.2, iridescence: 0.6 });
  for (const sx of [-1, 1]) {
    const e = mesh(eyeGeo, eyeMat, body);
    e.position.set(sx * 0.22, 0.08, 1.08);
    e.rotation.set(-0.45, sx * 0.18, 0);
    const er = mesh(new THREE.RingGeometry(0.055, 0.07, 32), M.ring, body);
    er.position.copy(e.position);
    er.rotation.copy(e.rotation);
    er.position.z += 0.001;
  }

  // Brazos y motores
  const motors = [];
  const arms = [
    { from: V3(0.4, 0.1, 0.66), to: V3(1.68, 0.16, 1.16), front: true, dir: 1 },
    { from: V3(-0.4, 0.1, 0.66), to: V3(-1.68, 0.16, 1.16), front: true, dir: -1 },
    { from: V3(0.44, -0.06, -0.78), to: V3(1.52, -0.1, -1.2), front: false, dir: -1 },
    { from: V3(-0.44, -0.06, -0.78), to: V3(-1.52, -0.1, -1.2), front: false, dir: 1 },
  ];
  const propCtl = [];
  for (const a of arms) {
    beam(a.from, a.to, 0.18, 0.11, M.shell, body, 0.05);
    const m = motor(body, a.to, { r: 0.135, h: 0.19 });
    motors.push(m);
    if (a.front) {
      const leg = cylY(0.035, 0.26, M.shellDark, m, 16, 0.045);
      leg.position.set(0, -0.2, 0.04);
      const led = mesh(new RoundedBoxGeometry(0.06, 0.03, 0.02, 2, 0.008), M.led, m);
      led.position.set(0, -0.05, 0.155);
    } else {
      const leg = beam(V3(0, -0.06, 0), V3(0.0, -0.36, -0.08), 0.06, 0.08, M.shellDark, m, 0.03);
      leg.position.add(V3(0, 0, 0));
      const tail = mesh(new RoundedBoxGeometry(0.05, 0.025, 0.02, 2, 0.008), M.ledRed, m);
      tail.position.set(0, -0.04, -0.155);
    }
    if (props) {
      const pr = buildProp({ radius: 1.18, blades: 2, chord: 0.13, dir: a.dir });
      pr.group.position.y = 0.17;
      m.add(pr.group);
      propCtl.push(pr);
    }
  }

  // Gimbal de giro libre + cámara triple
  const gimbal = new THREE.Group();
  gimbal.position.set(0, -0.14, 1.33);
  gimbal.scale.setScalar(0.78);
  body.add(gimbal);

  const bracket = mesh(new RoundedBoxGeometry(0.46, 0.24, 0.42, 6, 0.1), M.shellDark, body);
  bracket.position.set(0, -0.24, 0.98);
  const motorHousing = mesh(new THREE.CylinderGeometry(0.21, 0.23, 0.14, 64), M.shell, gimbal);
  motorHousing.rotation.x = Math.PI / 2;
  motorHousing.position.z = -0.41;
  const motorRing = mesh(new THREE.TorusGeometry(0.215, 0.006, 8, 96), M.chrome, gimbal);
  motorRing.position.z = -0.34;

  const roll = new THREE.Group();
  gimbal.add(roll);

  const podProfile = [];
  for (let i = 0; i < 12; i++) {
    const t = Math.PI / 2 - (i / 11) * (Math.PI / 2);
    podProfile.push([0.29 + 0.13 * Math.cos(t), 0.17 + 0.13 * Math.sin(t)]);
  }
  podProfile.push([0.42, 0.02]);
  for (let i = 1; i < 14; i++) {
    const t = -(i / 13) * (Math.PI / 2);
    podProfile.push([0.42 * Math.cos(t) + 0.0001, 0.02 + 0.34 * Math.sin(t)]);
  }
  const pod = mesh(latheZ(podProfile, 160), M.pod, roll);

  // Cara frontal con huecos para las tres ópticas
  const faceShape = new THREE.Shape();
  faceShape.absarc(0, 0, 0.2905, 0, TAU, false);
  for (const [x, y, rr] of [[0, 0.098, 0.132], [-0.094, -0.125, 0.075], [0.094, -0.125, 0.075]]) {
    const h = new THREE.Path();
    h.absarc(x, y, rr * 1.1, 0, TAU, true);
    faceShape.holes.push(h);
  }
  const facePlate = mesh(new THREE.ShapeGeometry(faceShape, 64), new THREE.MeshPhysicalMaterial({ color: 0x1d1e21, roughness: 0.5, metalness: 0.1, clearcoat: 0.25, clearcoatRoughness: 0.55, side: THREE.DoubleSide }), roll);
  facePlate.position.z = 0.3;

  const lenses = {};
  const main = buildLens({ r: 0.132, depth: 0.2, iris: true, engraving: ['4/3 CMOS · 100MP · 6K HDR', '1:2.0–11  f=28mm'], glowBoost: 1 });
  main.group.position.set(0, 0.098, 0.3);
  roll.add(main.group);
  const mid = buildLens({ r: 0.075, depth: 0.16, glowBoost: 0.7 });
  mid.group.position.set(-0.094, -0.125, 0.3);
  roll.add(mid.group);
  const tele = buildLens({ r: 0.075, depth: 0.16, glowBoost: 0.7 });
  tele.group.position.set(0.094, -0.125, 0.3);
  roll.add(tele.group);
  mid.setAperture(2.8);
  tele.setAperture(2.8);
  lenses.main = main; lenses.mid = mid; lenses.tele = tele;

  // Sensor de luz pequeño
  const tiny = mesh(new THREE.CircleGeometry(0.016, 24), new THREE.MeshPhysicalMaterial({ color: 0x0a0a0c, roughness: 0.1, clearcoat: 1 }), roll);
  tiny.position.set(0.19, 0.17, 0.3008);

  return {
    root,
    body,
    gimbal,
    roll,
    lenses,
    anchors: {
      main: main.group,
      mid: mid.group,
      tele: tele.group,
    },
    props: propCtl,
    update(dt, speed = 0) {
      for (const pr of propCtl) pr.update(dt, speed);
    },
  };
}

/* ------------------------------------------------------------------ */
/* FPV 7" de largo alcance                                             */
/* ------------------------------------------------------------------ */

export function buildFPV7() {
  const M = materials();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // Placas inferior y superior (fibra de carbono)
  const plate = (w, l, t, y) => {
    const m = mesh(new RoundedBoxGeometry(w, t, l, 3, 0.02), M.carbon, body);
    m.position.y = y;
    return m;
  };
  plate(0.5, 1.5, 0.05, 0);
  plate(0.42, 1.25, 0.03, 0.36);

  // Brazos en X (true-X estirado)
  const props = [];
  const ends = [];
  const angles = [42, 138, -42, -138];
  angles.forEach((deg, i) => {
    const a = THREE.MathUtils.degToRad(deg);
    const dir = V3(Math.sin(a), 0, Math.cos(a));
    const from = dir.clone().multiplyScalar(0.18);
    const to = dir.clone().multiplyScalar(1.56);
    const arm = beam(from, to, 0.24, 0.06, M.carbon, body, 0.02);
    arm.position.y = -0.01;
    ends.push(to);
    const m = motor(body, to.clone().setY(0.1), { r: 0.17, h: 0.21 });
    const pr = buildProp({ radius: 0.89, blades: 3, chord: 0.12, smoke: true, dir: i % 2 ? 1 : -1 });
    pr.group.position.y = 0.16;
    m.add(pr.group);
    props.push(pr);
  });

  // Separadores de aluminio
  for (const [x, z] of [[0.17, 0.5], [-0.17, 0.5], [0.17, -0.5], [-0.17, -0.5]]) {
    const s = cylY(0.022, 0.34, M.alu, body, 16);
    s.position.set(x, 0.18, z);
  }

  // Pila electrónica (FC/ESC)
  const stack = mesh(new RoundedBoxGeometry(0.32, 0.12, 0.32, 2, 0.02), M.shellDark, body);
  stack.position.set(0, 0.12, -0.05);

  // Batería con cinta
  const bat = mesh(new RoundedBoxGeometry(0.44, 0.34, 1.0, 4, 0.06), M.shellDark, body);
  bat.position.set(0, 0.56, -0.08);
  const lab = mesh(new RoundedBoxGeometry(0.445, 0.12, 0.7, 2, 0.02), M.label, body);
  lab.position.set(0, 0.6, -0.08);
  const strap = mesh(new RoundedBoxGeometry(0.47, 0.37, 0.12, 2, 0.03), M.rubber, body);
  strap.position.set(0, 0.55, 0.12);

  // Cámara FPV entre placas
  const camBox = mesh(new RoundedBoxGeometry(0.22, 0.22, 0.2, 3, 0.05), M.shellDark, body);
  camBox.position.set(0, 0.2, 0.72);
  camBox.rotation.x = -0.35;
  const camLens = buildLens({ r: 0.06, depth: 0.06, glowBoost: 0.8 });
  camLens.setAperture(2);
  camLens.group.position.set(0, 0.24, 0.83);
  camLens.group.rotation.x = -0.35;
  body.add(camLens.group);

  // Cámara de acción superior
  const ac = new THREE.Group();
  ac.position.set(0, 0.86, 0.46);
  ac.rotation.x = -0.42;
  body.add(ac);
  mesh(new RoundedBoxGeometry(0.62, 0.44, 0.33, 4, 0.06), M.shell, ac);
  const acLens = buildLens({ r: 0.1, depth: 0.08, glowBoost: 0.9 });
  acLens.setAperture(2.8);
  acLens.group.position.set(0.12, 0.02, 0.165);
  ac.add(acLens.group);
  const mount = mesh(new RoundedBoxGeometry(0.2, 0.22, 0.16, 2, 0.03), M.rubber, body);
  mount.position.set(0, 0.66, 0.42);

  // Antenas y GPS
  const ant = cylY(0.018, 0.5, M.rubber, body, 12);
  ant.position.set(0.12, 0.62, -0.72);
  ant.rotation.x = -0.5;
  const cap = mesh(new THREE.SphereGeometry(0.05, 16, 12), M.rubber, body);
  cap.position.set(0.12, 0.84, -0.86);
  const gps = mesh(new RoundedBoxGeometry(0.22, 0.06, 0.22, 2, 0.03), M.shellDark, body);
  gps.position.set(-0.08, 0.42, -0.6);

  return { root, body, props, update(dt, speed = 0) { props.forEach((p) => p.update(dt, speed)); } };
}

/* ------------------------------------------------------------------ */
/* Cinewhoop 2,5" (sub-250 g)                                          */
/* ------------------------------------------------------------------ */

function ductProfile(r, h) {
  return [
    [r + 0.035, -h * 0.5], [r, -h * 0.5], [r - 0.004, -h * 0.1], [r - 0.002, h * 0.25],
    [r + 0.01, h * 0.45], [r + 0.04, h * 0.52], [r + 0.065, h * 0.45], [r + 0.06, h * 0.1], [r + 0.04, -h * 0.5],
  ];
}

export function buildWhoop() {
  const M = materials();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const props = [];
  const off = 0.4;
  const centers = [[off, off], [-off, off], [off, -off], [-off, -off]];

  // Marco inferior con huecos para hélices
  const R = 0.38;
  // Placa: cuadrado redondeado grande
  const rr = new THREE.Shape();
  const s = 0.86, cr = 0.36;
  rr.moveTo(-s + cr, -s);
  rr.lineTo(s - cr, -s); rr.quadraticCurveTo(s, -s, s, -s + cr);
  rr.lineTo(s, s - cr); rr.quadraticCurveTo(s, s, s - cr, s);
  rr.lineTo(-s + cr, s); rr.quadraticCurveTo(-s, s, -s, s - cr);
  rr.lineTo(-s, -s + cr); rr.quadraticCurveTo(-s, -s, -s + cr, -s);
  for (const [x, z] of centers) {
    const h = new THREE.Path();
    h.absarc(x, z, R - 0.01, 0, TAU, true);
    rr.holes.push(h);
  }
  const frameGeo = new THREE.ExtrudeGeometry(rr, { depth: 0.04, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 48 });
  frameGeo.rotateX(Math.PI / 2);
  const frame = mesh(frameGeo, M.carbon, body);
  frame.position.y = -0.06;

  // Conductos
  for (const [x, z] of centers) {
    const d = mesh(new THREE.LatheGeometry(ductProfile(R, 0.26).map(([a, b]) => V2(a, b)), 96), M.shellDarkDS, body);
    d.position.set(x, 0.06, z);
    const m = motor(body, V3(x, -0.02, z), { r: 0.1, h: 0.12 });
    const pr = buildProp({ radius: 0.33, blades: 3, chord: 0.09, smoke: true, dir: x * z > 0 ? 1 : -1 });
    pr.group.position.y = 0.1;
    m.add(pr.group);
    props.push(pr);
  }

  // Cuerpo central, batería y cámara
  const core = mesh(new RoundedBoxGeometry(0.34, 0.18, 0.5, 4, 0.06), M.shell, body);
  core.position.set(0, 0.06, 0);
  const bat = mesh(new RoundedBoxGeometry(0.3, 0.16, 0.56, 4, 0.05), M.shellDark, body);
  bat.position.set(0, 0.25, -0.06);
  const lab = mesh(new RoundedBoxGeometry(0.305, 0.05, 0.4, 2, 0.015), M.label, body);
  lab.position.set(0, 0.29, -0.06);
  const cam = mesh(new RoundedBoxGeometry(0.2, 0.16, 0.16, 3, 0.04), M.shellDark, body);
  cam.position.set(0, 0.13, 0.3);
  cam.rotation.x = -0.25;
  const lens = buildLens({ r: 0.05, depth: 0.05, glowBoost: 0.8 });
  lens.setAperture(2);
  lens.group.position.set(0, 0.15, 0.385);
  lens.group.rotation.x = -0.25;
  body.add(lens.group);
  const ant = cylY(0.012, 0.22, M.rubber, body, 10);
  ant.position.set(0, 0.3, -0.38);
  ant.rotation.x = -0.6;

  return { root, body, props, update(dt, speed = 0) { props.forEach((p) => p.update(dt, speed)); } };
}

/* ------------------------------------------------------------------ */
/* DJI Avata 2                                                         */
/* ------------------------------------------------------------------ */

export function buildAvata() {
  const M = materials();
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  const props = [];
  const R = 0.36;
  const centers = [[0.54, 0.5], [-0.54, 0.5], [0.54, -0.58], [-0.54, -0.58]];

  // Guardas integradas: conductos gruesos con labio superior redondeado
  const ductProf = [
    [R, -0.15], [R, 0.1], [R + 0.012, 0.15], [R + 0.05, 0.172], [R + 0.085, 0.15],
    [R + 0.1, 0.1], [R + 0.1, -0.1], [R + 0.075, -0.155], [R + 0.03, -0.165], [R, -0.15],
  ].map(([x, y]) => V2(x, y));
  const ductGeo = new THREE.LatheGeometry(ductProf, 96);
  for (const [x, z] of centers) {
    const d = mesh(ductGeo, M.shellDS, body);
    d.position.set(x, 0, z);
    const m = motor(body, V3(x, -0.08, z), { r: 0.1, h: 0.11 });
    const pr = buildProp({ radius: R - 0.02, blades: 3, chord: 0.1, dir: x * z > 0 ? 1 : -1 });
    pr.group.position.y = 0.09;
    m.add(pr.group);
    props.push(pr);
    for (const k of [0, 1, 2]) {
      const a = (k / 3) * TAU + 0.6;
      beam(V3(x, -0.12, z), V3(x + Math.cos(a) * R, -0.12, z + Math.sin(a) * R), 0.035, 0.03, M.shellDark, body, 0.012);
    }
  }

  // Puentes entre conductos (marco perimetral continuo)
  const bridge = (ax, az, bx, bz) => {
    const from = V3(ax, 0.06, az), to = V3(bx, 0.06, bz);
    beam(from, to, 0.16, 0.16, M.shell, body, 0.06);
  };
  bridge(0.54, 0.5 - R - 0.04, 0.54, -0.58 + R + 0.04);
  bridge(-0.54, 0.5 - R - 0.04, -0.54, -0.58 + R + 0.04);

  // Cuerpo central: casco alargado con morro caído
  const cg = new RoundedBoxGeometry(0.66, 0.42, 1.46, 10, 0.18);
  const cp = cg.attributes.position;
  for (let i = 0; i < cp.count; i++) {
    let x = cp.getX(i), y = cp.getY(i), z = cp.getZ(i);
    const zn = z / 0.73;
    if (zn > 0 && y > 0) y *= 1 - 0.45 * zn * zn;
    if (zn > 0) x *= 1 - 0.18 * zn * zn;
    if (y > 0) y += 0.05 * Math.max(0, 1 - (x / 0.33) ** 2);
    cp.setXYZ(i, x, y, z);
  }
  cg.computeVertexNormals();
  const core = mesh(cg, M.shell, body);
  core.position.set(0, 0.1, -0.02);
  // brazos del cuerpo a cada conducto
  for (const [x, z] of centers) {
    const dir = V3(x, 0, z).normalize();
    const to = V3(x, 0.04, z).sub(dir.clone().multiplyScalar(R + 0.06));
    beam(V3(Math.sign(x) * 0.22, 0.04, z * 0.55), to, 0.2, 0.12, M.shell, body, 0.05);
  }

  // Batería trasera
  const bat = mesh(new RoundedBoxGeometry(0.5, 0.16, 0.62, 6, 0.06), M.shellDark, body);
  bat.position.set(0, 0.33, -0.36);
  const lab = mesh(new RoundedBoxGeometry(0.505, 0.04, 0.4, 2, 0.015), M.label, body);
  lab.position.set(0, 0.4, -0.36);

  // Cámara frontal en gimbal de un eje bajo visera
  const visor = mesh(new RoundedBoxGeometry(0.46, 0.08, 0.26, 4, 0.04), M.shellDark, body);
  visor.position.set(0, 0.2, 0.7);
  const camG = new THREE.Group();
  camG.position.set(0, 0.06, 0.8);
  body.add(camG);
  for (const sx of [-1, 1]) {
    const arm = mesh(new RoundedBoxGeometry(0.05, 0.2, 0.14, 2, 0.02), M.shellDark, camG);
    arm.position.set(sx * 0.17, 0.02, -0.04);
  }
  const head = mesh(new RoundedBoxGeometry(0.28, 0.22, 0.2, 6, 0.08), M.shell, camG);
  head.rotation.x = -0.15;
  const lens = buildLens({ r: 0.064, depth: 0.07, glowBoost: 0.9 });
  lens.setAperture(2.8);
  lens.group.position.set(0, 0.0, 0.105);
  lens.group.rotation.x = -0.15;
  camG.add(lens.group);

  // Luces de cola
  for (const sx of [-1, 1]) {
    const l = mesh(new RoundedBoxGeometry(0.1, 0.03, 0.02, 2, 0.008), M.led, body);
    l.position.set(sx * 0.18, 0.18, -0.74);
  }

  return { root, body, props, update(dt, speed = 0) { props.forEach((p) => p.update(dt, speed)); } };
}
