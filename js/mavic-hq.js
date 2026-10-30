// Mavic 4 Pro dibujado en alta fidelidad (laboratorio).
// Unidad: 1 = 100 mm. Proporciones tomadas de las fotos del dron de Javi (vista cenital,
// frontal, lateral y trasera) y ajustadas a las medidas oficiales desplegado:
// 329,7 × 390,2 × 135,2 mm sin hélices. +Z = morro, +Y = arriba.
//
// Fuselaje: "loft" de secciones superelípticas. Cámara: esfera con frontal en escudo,
// ventana cuadrada para la óptica principal y dos ópticas pequeñas debajo; las ópticas
// (con su diafragma animable) y las hélices se reutilizan de buildMavic().

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { materials, buildMavic } from './models.js';

const TAU = Math.PI * 2;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

/* ================= Utilidades ================= */

// Catmull-Rom 1D sobre puntos de control equiespaciados en [0, 1]
export function curve1D(pts) {
  const n = pts.length - 1;
  return (u) => {
    const f = Math.min(n - 1e-6, Math.max(0, u * n));
    const i = Math.floor(f), t = f - i;
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(n, i + 2)];
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
  };
}

// Superelipse: anchura w, alto superior ht, inferior hb, cuadratura n
export function superPoint(t, w, ht, hb, n) {
  const c = Math.cos(t), s = Math.sin(t);
  const e = 2 / n;
  return [(w / 2) * Math.sign(c) * Math.abs(c) ** e, (s >= 0 ? ht : hb) * Math.sign(s) * Math.abs(s) ** e];
}

// Malla cerrada a partir de anillos con el mismo número de puntos
export function ringsGeometry(rings, closeStart = true, closeEnd = true) {
  const seg = rings[0].length;
  const pos = [], idx = [];
  rings.forEach((r) => r.forEach((p) => pos.push(p.x, p.y, p.z)));
  for (let i = 0; i < rings.length - 1; i++) {
    for (let j = 0; j < seg; j++) {
      const a = i * seg + j, b = i * seg + ((j + 1) % seg), c = (i + 1) * seg + j, d = (i + 1) * seg + ((j + 1) % seg);
      idx.push(a, c, b, b, c, d);
    }
  }
  const cap = (ri, end) => {
    const ctr = new THREE.Vector3();
    rings[ri].forEach((p) => ctr.add(p));
    ctr.multiplyScalar(1 / seg);
    const ci = pos.length / 3;
    pos.push(ctr.x, ctr.y, ctr.z);
    for (let j = 0; j < seg; j++) {
      const a = ri * seg + j, b = ri * seg + ((j + 1) % seg);
      end ? idx.push(ci, a, b) : idx.push(ci, b, a);
    }
  };
  if (closeStart) cap(0, false);
  if (closeEnd) cap(rings.length - 1, true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  return outward(g);
}

// Garantiza caras hacia fuera (volumen con signo positivo); si no, invierte el orden
export function outward(g) {
  const p = g.attributes.position, idx = g.index.array;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let vol = 0;
  for (let i = 0; i < idx.length; i += 3) {
    a.fromBufferAttribute(p, idx[i]); b.fromBufferAttribute(p, idx[i + 1]); c.fromBufferAttribute(p, idx[i + 2]);
    vol += a.dot(b.clone().cross(c));
  }
  if (vol < 0) {
    for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
    g.index.needsUpdate = true;
  }
  g.computeVertexNormals();
  return g;
}

// Barrido de una sección superelíptica (w × h, cuadratura n) a lo largo de una curva
export function sweep(curve, steps, secFn, seg = 32) {
  const rings = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const p = curve.getPointAt(u);
    const T = curve.getTangentAt(u).normalize();
    const ref = Math.abs(T.y) > 0.9 ? V3(0, 0, 1) : V3(0, 1, 0);
    const side = new THREE.Vector3().crossVectors(T, ref).normalize();
    const up = new THREE.Vector3().crossVectors(side, T).normalize();
    const { w, h, n } = secFn(u);
    const ring = [];
    for (let j = 0; j < seg; j++) {
      const [x, y] = superPoint((j / seg) * TAU, w, h / 2, h / 2, n);
      ring.push(p.clone().addScaledVector(side, x).addScaledVector(up, y));
    }
    rings.push(ring);
  }
  return ringsGeometry(rings);
}

export const line = (...pts) => new THREE.CatmullRomCurve3(pts, false, 'centripetal');

function mesh(geo, mat, parent) {
  const m = new THREE.Mesh(geo, mat);
  if (parent) parent.add(m);
  return m;
}

function rbox(w, h, d, r, mat, parent, pos) {
  const m = mesh(new RoundedBoxGeometry(w, h, d, 4, Math.min(r, w / 2, h / 2, d / 2) * 0.999), mat, parent);
  if (pos) m.position.copy(pos);
  return m;
}

/* ================= Fuselaje ================= */

const Z0 = -0.95, Z1 = 0.86;          // cola y morro (181 mm de cuerpo)
const F = {
  w:  curve1D([0.50, 0.58, 0.60, 0.61, 0.63, 0.70, 0.78, 0.74, 0.62]),
  ht: curve1D([0.25, 0.34, 0.36, 0.37, 0.37, 0.38, 0.39, 0.38, 0.32]),
  hb: curve1D([0.29, 0.36, 0.38, 0.38, 0.38, 0.38, 0.36, 0.32, 0.27]),
  yc: curve1D([0.03, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.01, -0.01]),
  n:  curve1D([2.6, 3.4, 4.0, 4.2, 4.2, 4.0, 3.6, 3.3, 3.0]),
};
const SEG = 112;
const uAt = (z) => (z - Z0) / (Z1 - Z0);

function skin(u, t, s = 1) {
  const z = Z0 + (Z1 - Z0) * u;
  const [x, y] = superPoint(t, F.w(u) * s, F.ht(u) * s, F.hb(u) * s, F.n(u));
  return V3(x, y + F.yc(u), z);
}
function skinNormal(u, t) {
  const e = 1e-3;
  const a = skin(Math.min(1, u + e), t).sub(skin(Math.max(0, u - e), t));
  const b = skin(u, t + e).sub(skin(u, t - e));
  const n = new THREE.Vector3().crossVectors(b, a).normalize();
  // que apunte hacia fuera del eje
  const p = skin(u, t); const ctr = V3(0, F.yc(u), p.z);
  if (n.dot(p.clone().sub(ctr)) < 0) n.negate();
  return n;
}

function fuselageGeometry() {
  const rings = [];
  const ring = (u, s, dz) => Array.from({ length: SEG }, (_, j) => { const p = skin(u, (j / SEG) * TAU, s); p.z += dz; return p; });
  const capSteps = 7;
  for (let k = capSteps; k >= 1; k--) {              // cola redondeada
    const a = (k / capSteps) * (Math.PI / 2);
    rings.push(ring(0, Math.max(0.04, Math.cos(a)), -Math.sin(a) * 0.1));
  }
  const N = 110;
  for (let i = 0; i <= N; i++) rings.push(ring(i / N, 1, 0));
  for (let k = 1; k <= 3; k++) {                     // morro: borde suave hacia el hueco de la cámara
    const a = (k / 3) * (Math.PI / 2) * 0.6;
    rings.push(ring(1, Math.cos(a) * (1 - 0.05 * k), Math.sin(a) * 0.035));
  }
  return ringsGeometry(rings);
}

// Pieza orientada sobre la piel: X sigue el eje X del mundo (o Z si along), Z = normal
function onSkin(u, t, geo, mat, parent, { lift = 0.003, along = false } = {}) {
  const p = skin(u, t), N = skinNormal(u, t);
  const ref = along ? V3(0, 0, 1) : V3(1, 0, 0);
  let X = ref.clone().addScaledVector(N, -ref.dot(N));
  if (X.lengthSq() < 1e-6) X = V3(0, 0, 1).addScaledVector(N, -N.z);
  X.normalize();
  const Y = new THREE.Vector3().crossVectors(N, X);
  const m = mesh(geo, mat, parent);
  m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, N));
  m.position.copy(p).addScaledVector(N, lift);
  return m;
}

const seamTube = (pts, mat, parent, r = 0.0028) => mesh(new THREE.TubeGeometry(line(...pts), Math.max(96, pts.length * 4), r, 12, false), mat, parent);
const ringAt = (u, t0, t1, n = 96, s = 0.9985) => Array.from({ length: n + 1 }, (_, j) => skin(u, t0 + ((t1 - t0) * j) / n, s));
const lineAlong = (t, u0, u1, n = 96, s = 0.9985) => Array.from({ length: n + 1 }, (_, j) => skin(u0 + ((u1 - u0) * j) / n, t, s));

/* ================= Brazo, motor y pata ================= */

function motorAssembly(M, parent, hub, { front, sx }) {
  const g = new THREE.Group();
  g.position.copy(hub);
  parent.add(g);

  // Cápsula del extremo del brazo (sostiene motor y pata)
  const pod = [[0.001, -0.16], [0.07, -0.16], [0.105, -0.13], [0.118, -0.06], [0.115, 0.0], [0.1, 0.03], [0.001, 0.03]];
  mesh(new THREE.LatheGeometry(new THREE.SplineCurve(pod.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(40), 128), M.shell, g);

  // Motor: estator negro con aros y campana superior
  const stator = mesh(new THREE.CylinderGeometry(0.1, 0.104, 0.12, 64), M.shellDark, g);
  stator.position.y = 0.09;
  for (let i = 0; i < 4; i++) {
    const r = mesh(new THREE.TorusGeometry(0.104, 0.004, 6, 64), M.satin, g);
    r.rotation.x = Math.PI / 2; r.position.y = 0.045 + i * 0.026;
  }
  const bell = mesh(new THREE.CylinderGeometry(0.088, 0.1, 0.05, 64), M.satin, g);
  bell.position.y = 0.175;
  const slot = new RoundedBoxGeometry(0.014, 0.01, 0.05, 2, 0.004);
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * TAU;
    const s = mesh(slot, M.wall, g);
    s.position.set(Math.cos(a) * 0.055, 0.2, Math.sin(a) * 0.055);
    s.rotation.y = -a + Math.PI / 2;
  }

  // Ventana de luz en la cara exterior y LED
  const win = new THREE.MeshPhysicalMaterial({ color: 0x0b0b0d, roughness: 0.08, clearcoat: 1, metalness: 0.1 });
  const w = rbox(0.06, 0.035, 0.012, 0.01, win, g, V3(sx * 0.0, -0.09, (front ? 1 : -1) * 0.112));
  w.rotation.y = 0;
  const led = rbox(0.04, 0.012, 0.008, 0.004, front ? M.led : M.ledRed, g, V3(0, -0.04, (front ? 1 : -1) * 0.118));
  return g;
}

/* ================= Óptica principal de alta fidelidad ================= */
// Pensada para el primer plano de la web. Coordenadas locales: radio r, profundidad d
// (la óptica se coloca a escala 0,5 dentro de la ventana cuadrada).

function canvasTexture(size, draw, color = true) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = color ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 8;
  return t;
}

// Polvo y velo del cristal frontal: casi invisibles, rompen la perfección digital
function dustTexture() {
  return canvasTexture(1024, (x, s) => {
    x.fillStyle = '#000'; x.fillRect(0, 0, s, s);
    const haze = x.createRadialGradient(s * 0.42, s * 0.38, 0, s / 2, s / 2, s / 2);
    haze.addColorStop(0, 'rgba(120,125,140,0.10)'); haze.addColorStop(1, 'rgba(0,0,0,0)');
    x.fillStyle = haze; x.fillRect(0, 0, s, s);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 220; i++) {
      const a = rnd() * TAU, d = Math.sqrt(rnd()) * s * 0.46;
      const px = s / 2 + Math.cos(a) * d, py = s / 2 + Math.sin(a) * d;
      const r = 0.6 + rnd() * rnd() * 2.6;
      x.fillStyle = `rgba(230,232,240,${0.25 + rnd() * 0.5})`;
      x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill();
    }
    // un par de micro-arañazos finos
    x.strokeStyle = 'rgba(220,225,235,0.18)'; x.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
      const cx = s * (0.3 + rnd() * 0.4), cy = s * (0.3 + rnd() * 0.4), len = s * (0.05 + rnd() * 0.08), a = rnd() * Math.PI;
      x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len); x.stroke();
    }
  });
}

// Fondo: sensor 4/3 oscuro con brillo violeta y verde, dentro de un halo azul profundo
function sensorTexture() {
  return canvasTexture(512, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, '#20214f'); g.addColorStop(0.45, '#12123a'); g.addColorStop(0.8, '#06061a'); g.addColorStop(1, '#000');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
    const w = s * 0.34, h = w * 0.75;
    const sg = x.createLinearGradient(s / 2 - w / 2, s / 2 - h / 2, s / 2 + w / 2, s / 2 + h / 2);
    sg.addColorStop(0, '#22184a'); sg.addColorStop(0.45, '#0a0b1e'); sg.addColorStop(0.72, '#0f2c2a'); sg.addColorStop(1, '#090918');
    x.fillStyle = sg; x.fillRect(s / 2 - w / 2, s / 2 - h / 2, w, h);
    x.strokeStyle = 'rgba(160,150,255,0.07)'; x.lineWidth = 1;
    x.strokeRect(s / 2 - w / 2, s / 2 - h / 2, w, h);
  });
}

// Reflejo interno ("fantasma") suave para mezcla aditiva
function ghostTexture() {
  return canvasTexture(256, (x, s) => {
    const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.35, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g; x.fillRect(0, 0, s, s);
  });
}

// Estrías mate de la pared interior (antirreflejos)
function baffleTexture() {
  return canvasTexture(256, (x, s) => {
    x.fillStyle = '#0a0a0b'; x.fillRect(0, 0, s, s);
    for (let i = 0; i < s; i += 8) {
      x.fillStyle = '#16161a'; x.fillRect(0, i, s, 3);
    }
  });
}

// Casquete esférico mirando a +Z (convexo) o -Z (cóncavo)
function lensCap(baseR, bulge, seg = 96) {
  const R = (baseR * baseR + bulge * bulge) / (2 * Math.abs(bulge));
  const theta = Math.asin(Math.min(1, baseR / R));
  const g = new THREE.SphereGeometry(R, seg, 24, 0, TAU, 0, theta);
  g.rotateX(Math.PI / 2);
  g.translate(0, 0, -(R - Math.abs(bulge)));
  if (bulge < 0) g.scale(1, 1, -1);
  return g;
}

function coatedGlass({ opacity, thick, env = 2.6, tint = 0x05050a }) {
  return new THREE.MeshPhysicalMaterial({
    color: tint, metalness: 0, roughness: 0.07,   // un pelo de difusión: reflejos redondeados, no recortes duros
    transparent: true, opacity, depthWrite: false, side: THREE.DoubleSide,
    clearcoat: 1, clearcoatRoughness: 0.06,
    iridescence: 1, iridescenceIOR: 1.85, iridescenceThicknessRange: thick,
    envMapIntensity: env, specularIntensity: 1,
  });
}

// Diafragma de 9 láminas abombadas de acero pavonado
function buildIrisHQ(maxRadius, count = 9) {
  const group = new THREE.Group();
  const bladeMat = new THREE.MeshPhysicalMaterial({ color: 0x2a2a2f, metalness: 0.8, roughness: 0.42, anisotropy: 0.4, envMapIntensity: 1.05, side: THREE.DoubleSide });
  const span = (Math.PI / count) * 1.75;
  const steps = 32;
  const makeGeo = (outer) => {
    const shape = new THREE.Shape();
    for (let i = 0; i <= steps; i++) {
      const b = -span + (2 * span * i) / steps;
      const d = 1 / Math.pow(Math.cos(b), 0.55);          // borde: entre recta y arco (polígono redondeado)
      const px = Math.sin(b) * d, py = Math.cos(b) * d;
      i === 0 ? shape.moveTo(px, py) : shape.lineTo(px, py);
    }
    for (let i = 0; i <= 14; i++) {
      const b = span - (2 * span * i) / 14;
      shape.lineTo(Math.sin(b) * outer, Math.cos(b) * outer);
    }
    shape.closePath();
    const g = new THREE.ExtrudeGeometry(shape, { depth: 0.0006, bevelEnabled: true, bevelThickness: 0.0009, bevelSize: 0.018, bevelSegments: 3, curveSegments: 6 });
    // abombado: el borde interior se adelanta hacia la luz
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const d = Math.hypot(p.getX(i), p.getY(i));
      p.setZ(i, p.getZ(i) + 0.006 * Math.max(0, 1 - (d - 1) / (outer - 1)));
    }
    g.computeVertexNormals();
    return g;
  };
  // Las láminas se rehacen según la apertura; cada forma se guarda (pasos del 4 %) para no
  // reconstruirla en mitad del scroll. optic.js las precalcula todas al preparar la escena.
  const geoCache = new Map();
  let level = null;
  const blades = [];
  for (let i = 0; i < count; i++) {
    const pivot = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BufferGeometry(), bladeMat);
    m.rotation.y = 0.1;
    m.position.z = i * 0.0002;            // ligero solape escalonado
    pivot.add(m);
    pivot.userData.base = (i / count) * TAU;
    group.add(pivot);
    blades.push({ pivot, m });
  }
  const set = (N) => {
    const open = THREE.MathUtils.clamp((11 - N) / 9, 0, 1);
    const a = maxRadius * (2.0 / N);
    const want = Math.max(1.6, (maxRadius * 1.32) / a);
    const lv = Math.round(Math.log(want) / Math.log(1.04));
    if (lv !== level) {
      level = lv;
      let geo = geoCache.get(lv);
      if (!geo) geoCache.set(lv, (geo = makeGeo(Math.pow(1.04, lv))));
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

export function buildLensHQ(M, { r = 0.132, d = 0.2 } = {}) {
  const g = new THREE.Group();
  const latheZ = (pts, seg = 160) => { const geo = new THREE.LatheGeometry(pts.map(([a, b]) => new THREE.Vector2(a, b)), seg); geo.rotateX(Math.PI / 2); return geo; };

  // Barril mecanizado: anodizado oscuro con un chaflán de aluminio que capta un hilo de luz
  mesh(latheZ([[r * 0.8, -d], [r * 0.8, -0.006], [r * 0.85, 0.008], [r * 0.98, 0.0155], [r * 1.04, 0.0135], [r * 1.1, 0.006], [r * 1.13, -0.012], [r * 1.13, -0.05]]), M.ring, g);
  // metal satinado sin cepillar: el cepillado concentraba la luz en dos puntos que el bloom volvía recuadros
  const chamferMat = new THREE.MeshStandardMaterial({ color: 0x5a5c62, metalness: 0.9, roughness: 0.45, envMapIntensity: 0.8 });
  const chamfer = mesh(new THREE.TorusGeometry(r * 0.99, 0.0012, 8, 220), chamferMat, g);
  chamfer.position.z = 0.0158;
  const chamfer2 = mesh(new THREE.TorusGeometry(r * 0.852, 0.0008, 8, 220), chamferMat, g);
  chamfer2.position.z = 0.0083;

  // Pared interior estriada y aros antirreflejos escalonados
  const bt = baffleTexture(); bt.wrapS = bt.wrapT = THREE.RepeatWrapping; bt.repeat.set(1, 6);
  const wall = mesh(new THREE.CylinderGeometry(r * 0.8, r * 0.8, d, 128, 1, true), new THREE.MeshStandardMaterial({ map: bt, roughness: 0.92, metalness: 0, side: THREE.BackSide }), g);
  wall.rotation.x = Math.PI / 2; wall.position.z = -d / 2;
  for (const [z, ri] of [[-0.012, 0.76], [-0.03, 0.72], [-0.1, 0.7], [-0.15, 0.66]]) {
    const b = mesh(new THREE.RingGeometry(r * ri, r * 0.8, 128), M.wall, g);
    b.position.z = z;
    const e = mesh(new THREE.TorusGeometry(r * ri, 0.0008, 6, 160), M.ring, g);   // filo del aro
    e.position.z = z + 0.0005;
  }

  // Sin luces rasantes: sus reflejos en los cristales salían como puntos cuadrados.
  // Las láminas se leen con los reflejos del estudio.

  // Diafragma
  const iris = buildIrisHQ(r * 0.6);
  iris.group.position.z = -d * 0.34;
  g.add(iris.group);

  // Fondo: sensor con brillo violeta (su intensidad sigue a la apertura)
  const sensorMat = new THREE.MeshBasicMaterial({ map: sensorTexture() });
  const sensor = mesh(new THREE.CircleGeometry(r * 0.8, 96), sensorMat, g);
  sensor.position.z = -d + 0.002;

  // Elementos de cristal: cada superficie refleja el estudio a su profundidad (paralaje real)
  const elems = [
    [lensCap(r * 0.85, r * 0.2), 0.004, coatedGlass({ opacity: 0.2, thick: [260, 640], env: 3.0 })],   // frontal convexo
    [lensCap(r * 0.8, -r * 0.1), -0.012, coatedGlass({ opacity: 0.1, thick: [420, 820], env: 2.2 })], // segundo, cóncavo
    [lensCap(r * 0.74, r * 0.12), -0.05, coatedGlass({ opacity: 0.1, thick: [300, 700], env: 2.0, tint: 0x0b0716 })],
    [lensCap(r * 0.62, r * 0.11), -d * 0.62, coatedGlass({ opacity: 0.16, thick: [350, 760], env: 1.8, tint: 0x120a26 })],
    [lensCap(r * 0.56, -r * 0.08), -d * 0.82, coatedGlass({ opacity: 0.12, thick: [450, 900], env: 1.6, tint: 0x0a1020 })],
  ];
  elems.forEach(([geo, z, mat], i) => {
    const m = mesh(geo, mat, g);
    m.position.z = z;
    m.renderOrder = 3 + (elems.length - i);
  });

  // Reflejos internos de colores a distintas profundidades
  const gt = ghostTexture();
  const ghosts = [
    [0x7dffb8, r * 0.1, -r * 0.22, r * 0.16, -0.02, 0.22],
    [0xff7ae6, r * 0.05, -r * 0.34, r * 0.28, -0.06, 0.16],
    [0xffb85c, r * 0.07, r * 0.18, -r * 0.3, -0.11, 0.14],
    [0x8fb4ff, r * 0.035, -r * 0.42, r * 0.38, -0.08, 0.2],
  ];
  // Nacen de la luz que entra por la apertura: con el diafragma cerrado casi desaparecen
  const ghostMats = [];
  for (const [col, size, x, y, z, op] of ghosts) {
    const m = mesh(new THREE.CircleGeometry(size, 48), new THREE.MeshBasicMaterial({ map: gt, color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false }), g);
    m.position.set(x, y, z);
    m.renderOrder = 9;
    m.userData.base = op;
    ghostMats.push(m);   // la malla, no el material: el render de producto sustituye los materiales por copias
  }

  // Polvo y velo sobre el cristal frontal
  const dust = mesh(lensCap(r * 0.85, r * 0.2).scale(1.002, 1.002, 1.002), new THREE.MeshBasicMaterial({ map: dustTexture(), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }), g);
  dust.position.z = 0.0042;
  dust.renderOrder = 10;
  {
    // proyección plana del polvo sobre el casquete
    const p = dust.geometry.attributes.position, uv = dust.geometry.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / (r * 1.7) + 0.5, p.getY(i) / (r * 1.7) + 0.5);
  }

  return {
    group: g,
    setAperture(N) {
      const open = iris.set(N);
      sensor.material.color.setScalar(0.25 + 1.05 * open * open);
      const lit = 0.06 + 0.94 * open * open;
      for (const gm of ghostMats) gm.material.opacity = gm.userData.base * lit;
      return open;
    },
  };
}

/* ================= Cámara ================= */

// Escudo frontal con ventana cuadrada (principal) y dos pequeñas
function shieldShape() {
  // ≈ 0,6 R de ancho a cada lado, de +0,74 R a −0,70 R de alto, esquinas muy redondeadas
  const p = roundedRectPath(0, 0.005, 0.34, 0.41, 0.13, false);
  return new THREE.Shape(p.getPoints(64));
}
function roundedRectPath(cx, cy, w, h, r, clockwise) {
  const p = new THREE.Path();
  const x0 = cx - w / 2, y0 = cy - h / 2;
  if (!clockwise) {
    p.moveTo(x0 + r, y0); p.lineTo(x0 + w - r, y0); p.quadraticCurveTo(x0 + w, y0, x0 + w, y0 + r);
    p.lineTo(x0 + w, y0 + h - r); p.quadraticCurveTo(x0 + w, y0 + h, x0 + w - r, y0 + h);
    p.lineTo(x0 + r, y0 + h); p.quadraticCurveTo(x0, y0 + h, x0, y0 + h - r);
    p.lineTo(x0, y0 + r); p.quadraticCurveTo(x0, y0, x0 + r, y0);
  } else {
    p.moveTo(x0 + r, y0); p.quadraticCurveTo(x0, y0, x0, y0 + r);
    p.lineTo(x0, y0 + h - r); p.quadraticCurveTo(x0, y0 + h, x0 + r, y0 + h);
    p.lineTo(x0 + w - r, y0 + h); p.quadraticCurveTo(x0 + w, y0 + h, x0 + w, y0 + h - r);
    p.lineTo(x0 + w, y0 + r); p.quadraticCurveTo(x0 + w, y0, x0 + w - r, y0);
    p.lineTo(x0 + r, y0);
  }
  return p;
}

function buildCamera(M, base) {
  const R = 0.285;                      // radio de la esfera (≈ 57 mm de diámetro)
  const gimbal = new THREE.Group();     // guiñada/cabeceo (fijo al cuerpo)
  const roll = new THREE.Group();       // alabeo libre de 360°
  gimbal.add(roll);

  // Cuerpo de la cámara: esfera con frontal aplanado
  const prof = [];
  const zf = R * 0.6;                   // plano frontal (cara de ≈ 0,8 R de radio)
  const rf = Math.sqrt(R * R - zf * zf);
  prof.push([rf * 0.98, zf]);          // la cara frontal va aparte, con los huecos de las ópticas
  for (let i = 0; i <= 40; i++) {
    const a = Math.acos(zf / R) + (i / 40) * (Math.PI - Math.acos(zf / R) - 0.25);
    prof.push([Math.sin(a) * R, Math.cos(a) * R]);
  }
  prof.push([0.0001, -R * 0.97]);
  const podGeo = new THREE.LatheGeometry(prof.map(([x, y]) => new THREE.Vector2(x, y)), 128);
  podGeo.rotateX(Math.PI / 2);
  mesh(podGeo, M.pod, roll);

  // Escudo frontal en relieve con los huecos de las ópticas
  // Cara frontal de la esfera con huecos (si fuera maciza taparía el diafragma)
  const capShape = new THREE.Shape(); capShape.absarc(0, 0, rf * 0.985, 0, TAU, false);
  const shield = shieldShape();
  const main = { x: 0, y: 0.105, w: 0.18, h: 0.16, r: 0.045 };
  const small = [{ x: -0.085, y: -0.1, r: 0.056 }, { x: 0.085, y: -0.1, r: 0.062 }];
  shield.holes.push(roundedRectPath(main.x, main.y, main.w, main.h, main.r, true));
  for (const s of small) { const h = new THREE.Path(); h.absarc(s.x, s.y, s.r, 0, TAU, true); shield.holes.push(h); }
  capShape.holes.push(...shield.holes);
  const cap = mesh(new THREE.ShapeGeometry(capShape, 64), M.pod, roll);
  cap.position.z = zf;
  const backing = mesh(new THREE.CircleGeometry(rf, 64), M.wall, roll);   // fondo negro tras las ópticas
  backing.position.z = zf - 0.11;
  const shieldGeo = new THREE.ExtrudeGeometry(shield, { depth: 0.018, bevelEnabled: true, bevelThickness: 0.008, bevelSize: 0.008, bevelSegments: 4, curveSegments: 48 });
  // frontal plano: con tan pocos vértices el abombado marcaba pliegues
  const bulge = () => 0;
  {
    const p = shieldGeo.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, p.getZ(i) + bulge(p.getX(i), p.getY(i)));
    shieldGeo.computeVertexNormals();
  }
  const faceMat = new THREE.MeshPhysicalMaterial({ color: 0x17181b, roughness: 0.55, metalness: 0.05, clearcoat: 0.15, clearcoatRoughness: 0.6 });
  const face = mesh(shieldGeo, faceMat, roll);
  face.position.z = zf - 0.012;

  // Marco de la ventana principal (bisel interior oscuro, profundo)
  const frameShape = (() => {
    const s = new THREE.Shape(roundedRectPath(main.x, main.y, main.w + 0.004, main.h + 0.004, main.r, false).getPoints(48));
    s.holes.push(roundedRectPath(main.x, main.y, main.w - 0.03, main.h - 0.03, main.r * 0.7, true));
    return s;
  })();
  const frame = mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 0.05, bevelEnabled: false, curveSegments: 32 }), M.wall, roll);
  frame.position.z = zf - 0.045 + bulge(main.x, main.y);
  const lipPath = roundedRectPath(main.x, main.y, main.w - 0.004, main.h - 0.004, main.r * 0.95, false);
  // contorno cerrado sin el punto repetido del final (evita un pellizco en la unión)
  const loop = (path) => new THREE.CatmullRomCurve3(path.getPoints(96).slice(0, -1).map((v) => V3(v.x, v.y, 0)), true);
  const lip = mesh(new THREE.TubeGeometry(loop(lipPath), 256, 0.0016, 8, true), M.ring, roll);
  lip.position.z = zf + 0.026;
  const innerLip = mesh(new THREE.TubeGeometry(loop(roundedRectPath(main.x, main.y, main.w - 0.032, main.h - 0.032, main.r * 0.7, false)), 256, 0.0011, 6, true), M.ring, roll);
  innerLip.position.z = zf + 0.004;
  for (const sm of small) {
    const fr = mesh(new THREE.TorusGeometry(sm.r * 0.98, 0.006, 10, 96), M.wall, roll);
    fr.position.set(sm.x, sm.y, zf + 0.022);
    const hi = mesh(new THREE.TorusGeometry(sm.r * 1.03, 0.0012, 6, 96), M.ring, roll);
    hi.position.set(sm.x, sm.y, zf + 0.026);
  }
  // Nervios en "Y": bajan desde las esquinas de la ventana y separan las ópticas pequeñas
  const rib = (x0, y0, x1, y1) => {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const r = rbox(0.011, len, 0.016, 0.005, faceMat, roll, V3((x0 + x1) / 2, (y0 + y1) / 2, zf + 0.016));
    r.rotation.z = Math.atan2(x1 - x0, y0 - y1);
    return r;
  };
  const yb = main.y - main.h / 2;           // borde inferior de la ventana
  rib(-main.w / 2 + 0.02, yb + 0.004, -0.008, -0.03);
  rib(main.w / 2 - 0.02, yb + 0.004, 0.008, -0.03);
  rib(0, -0.03, 0, -0.165);

  // Ópticas reutilizadas (diafragma animable en la principal)
  const L = base.lenses;
  const place = (lens, x, y, scale) => {
    lens.group.removeFromParent();
    lens.group.position.set(x, y, zf + 0.006 + bulge(x, y));
    lens.group.scale.setScalar(scale);
    roll.add(lens.group);
    // las luces rasantes se pensaron para la lente a escala 0,78: mismo alcance relativo
    lens.group.traverse((o) => { if (o.isSpotLight) o.distance *= scale / 0.78; });
  };
  // Óptica principal nueva (alta fidelidad); la anterior queda oculta para comparar en el laboratorio
  const mainHQ = buildLensHQ(M);
  place(mainHQ, main.x, main.y, 0.5);
  place(L.main, main.x, main.y, 0.5);
  L.main.group.traverse((o) => { if (o.isMesh && o.material.emissiveMap) o.visible = false; });
  L.main.group.visible = false;
  place(L.mid, small[0].x, small[0].y, 0.62);
  place(L.tele, small[1].x, small[1].y, 0.7);

  // Aro oscuro de giro detrás del frontal (la junta del alabeo)
  const gap = mesh(new THREE.TorusGeometry(R * 0.995, 0.008, 8, 128), M.wall, gimbal);
  gap.position.z = -0.02;

  // Brazo del gimbal en el lado izquierdo (bloque vertical) y tapa del motor derecho
  rbox(0.06, 0.24, 0.16, 0.028, M.shellDark, gimbal, V3(-R - 0.005, 0.0, -0.05));
  const capR = mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.05, 48), M.shell, gimbal);
  capR.rotation.z = Math.PI / 2; capR.position.set(R + 0.005, 0.0, -0.03);

  return { gimbal, roll, lenses: { main: mainHQ, mid: L.mid, tele: L.tele }, oldMain: L.main, R, zf };
}

/* ================= Puntas de las palas ================= */

const TIP = new THREE.MeshPhysicalMaterial({ color: 0xff6a1a, roughness: 0.45, clearcoat: 0.4, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 });
function addTips(pr) {
  for (const blade of pr.solid.children) {
    if (!blade.isMesh || blade.userData.tip) continue;
    const g = blade.geometry, p = g.attributes.position;
    let maxX = 0;
    for (let i = 0; i < p.count; i++) maxX = Math.max(maxX, p.getX(i));
    const src = g.index ? g.index.array : [...Array(p.count).keys()];
    const keep = [];
    for (let i = 0; i < src.length; i += 3) {
      if ([src[i], src[i + 1], src[i + 2]].every((v) => p.getX(v) > maxX * 0.9)) keep.push(src[i], src[i + 1], src[i + 2]);
    }
    const tg = new THREE.BufferGeometry();
    tg.setAttribute('position', p);
    if (g.attributes.normal) tg.setAttribute('normal', g.attributes.normal);
    tg.setIndex(keep);
    const tip = new THREE.Mesh(tg, TIP);
    tip.userData.tip = true;
    blade.add(tip);
  }
}

/* ================= Ensamblaje ================= */

// Construcción por pasos: cada `yield` es un punto donde la web puede ceder un fotograma
// (buildMavicHQAsync) para que el scroll no se quede pillado. buildMavicHQ lo hace de una vez.
export function buildMavicHQ() {
  const it = mavicSteps();
  let r = it.next();
  while (!r.done) r = it.next();
  return r.value;
}
export async function buildMavicHQAsync(pause) {
  const it = mavicSteps();
  let r = it.next();
  while (!r.done) { await pause(); r = it.next(); }
  return r.value;
}

function* mavicSteps() {
  const M = materials();
  const base = buildMavic();
  yield;
  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  // ---- Fuselaje ----
  mesh(fuselageGeometry(), M.shell, body);

  // Juntas: tapa de batería (anillo inferior y laterales) y línea de partición
  seamTube(ringAt(0.36, Math.PI + 0.05, TAU - 0.05), M.wall, body);
  seamTube(lineAlong(-0.28, 0.06, 0.36), M.wall, body);
  seamTube(lineAlong(Math.PI + 0.28, 0.06, 0.36), M.wall, body);
  seamTube(lineAlong(0.2, 0.36, 0.95), M.wall, body);
  seamTube(lineAlong(Math.PI - 0.2, 0.36, 0.95), M.wall, body);

  // Rejilla trasera superior: ranuras paralelas de lado a lado (como en la foto trasera),
  // hundidas en un rebaje oscuro
  onSkin(0.065, Math.PI / 2, new RoundedBoxGeometry(0.3, 0.13, 0.004, 3, 0.03), M.wall, body, { lift: -0.0005 });
  const slot = new RoundedBoxGeometry(0.26, 0.009, 0.008, 2, 0.004);
  for (let i = 0; i < 7; i++) onSkin(0.03 + i * 0.012, Math.PI / 2, slot, M.shellDark, body, { lift: 0.0015 });
  // Panel trasero de la batería con indicadores
  onSkin(0.005, -Math.PI / 2 + 0.0001, new RoundedBoxGeometry(0.06, 0.03, 0.01, 2, 0.01), M.wall, body);

  // Trasera: cuatro indicadores de batería y el botón de encendido
  {
    const back = new THREE.Group();
    back.position.set(0, -0.01, Z0 - 0.101);   // sobre la cara trasera (el remate de la cola llega a Z0 - 0,1)
    back.rotation.y = Math.PI;
    body.add(back);
    const ledMat = new THREE.MeshPhysicalMaterial({ color: 0x0d0d0f, roughness: 0.15, clearcoat: 1 });
    for (let i = 0; i < 4; i++) {
      const d = mesh(new THREE.CylinderGeometry(0.0065, 0.0065, 0.006, 16), ledMat, back);
      d.rotation.x = Math.PI / 2; d.position.set(-0.03 + i * 0.02, 0, 0);
    }
    rbox(0.055, 0.026, 0.01, 0.012, M.shellDark, back, V3(-0.085, 0.0, 0));
  }
  // Tapa de goma del puerto lateral y tornillos de la base
  onSkin(0.3, -0.05, new RoundedBoxGeometry(0.13, 0.04, 0.008, 3, 0.012), M.rubber, body, { along: true, lift: 0.0 });
  const screwGeo = new THREE.CylinderGeometry(0.009, 0.009, 0.006, 18); screwGeo.rotateX(Math.PI / 2);
  for (const [u, t] of [[0.18, -Math.PI / 2 - 0.45], [0.18, -Math.PI / 2 + 0.45], [0.78, -Math.PI / 2 - 0.4], [0.78, -Math.PI / 2 + 0.4]]) {
    onSkin(u, t, screwGeo, M.wall, body, { lift: 0.0 });
  }

  // Sensores de visión: ojos salientes (cúpula + cristal)
  const eyeMat = new THREE.MeshPhysicalMaterial({ color: 0x050506, roughness: 0.03, metalness: 0.2, clearcoat: 1, iridescence: 0.5, iridescenceIOR: 1.6 });
  const dome = new THREE.CylinderGeometry(0.036, 0.042, 0.022, 40); dome.rotateX(Math.PI / 2);
  const glass = new THREE.SphereGeometry(0.025, 32, 16, 0, TAU, 0, Math.PI / 2); glass.rotateX(Math.PI / 2);
  const eye = (u, t) => {
    const d = onSkin(u, t, dome, M.shell, body, { lift: 0.008 });
    const e = onSkin(u, t, glass, eyeMat, body, { lift: 0.014 });
    return [d, e];
  };
  eye(0.5, Math.PI / 2);                              // centro del lomo
  eye(0.8, Math.PI / 2 - 0.42); eye(0.8, Math.PI / 2 + 0.42);   // delanteros superiores
  eye(0.62, 0.05); eye(0.62, Math.PI - 0.05);          // laterales
  eye(0.55, -Math.PI / 2 - 0.4); eye(0.55, -Math.PI / 2 + 0.4); // inferiores
  // Ventana lateral rectangular (sensor ToF / luz)
  const tofMat = new THREE.MeshPhysicalMaterial({ color: 0x0c0c0e, roughness: 0.1, clearcoat: 1 });
  onSkin(0.24, -0.15, new RoundedBoxGeometry(0.1, 0.06, 0.01, 2, 0.015), tofMat, body, { along: true });
  onSkin(0.24, Math.PI + 0.15, new RoundedBoxGeometry(0.1, 0.06, 0.01, 2, 0.015), tofMat, body, { along: true });
  // Rejillas laterales delanteras
  const vent = new RoundedBoxGeometry(0.012, 0.07, 0.01, 2, 0.005);
  for (const t of [0.42, Math.PI - 0.42]) for (let i = 0; i < 5; i++) onSkin(0.83 + i * 0.018, t, vent, M.wall, body, { lift: -0.001 });

  // Orejas del morro (alojan los sensores frontales sobre la cámara)
  for (const sx of [-1, 1]) {
    const ear = rbox(0.13, 0.11, 0.17, 0.05, M.shell, body, V3(sx * 0.2, 0.33, 0.8));
    const d = mesh(dome, M.shell, body); d.position.set(sx * 0.2, 0.335, 0.884);
    const e = mesh(glass, eyeMat, body); e.position.set(sx * 0.2, 0.335, 0.892);
  }

  yield;
  // ---- Brazos: delanteros bajos, traseros altos y largos ----
  const armSec = (u) => ({ w: 0.13 - 0.02 * u, h: 0.095 - 0.012 * u, n: 3.4 });
  const arms = [
    { root: V3(0.3, -0.18, -0.06), hub: V3(1.72, -0.06, 0.42), front: true, sx: 1, dir: 1 },
    { root: V3(-0.3, -0.18, -0.06), hub: V3(-1.72, -0.06, 0.42), front: true, sx: -1, dir: -1 },
    { root: V3(0.26, 0.2, -0.86), hub: V3(1.15, 0.04, -2.5), front: false, sx: 1, dir: -1 },
    { root: V3(-0.26, 0.2, -0.86), hub: V3(-1.15, 0.04, -2.5), front: false, sx: -1, dir: 1 },
  ];
  const propCtl = [];
  for (const [i, a] of arms.entries()) {
    if (i === 2) yield;
    const mid = a.root.clone().lerp(a.hub, 0.18).add(V3(a.sx * 0.06, a.front ? 0.0 : -0.02, 0));
    // el brazo arranca dentro del cuerpo y se ensancha al salir (sin aristas de unión)
    const inside = a.root.clone().add(a.root.clone().sub(mid).setY(0).normalize().multiplyScalar(0.09));
    const flare = (u) => 1 - THREE.MathUtils.smoothstep(u, 0.0, 0.14);
    const armFlared = (u) => ({ w: 0.13 - 0.02 * u + 0.075 * flare(u), h: 0.095 - 0.012 * u + 0.05 * flare(u), n: 3.0 + 0.6 * (1 - flare(u)) });
    mesh(sweep(line(inside, a.root, mid, a.hub.clone().add(V3(0, -0.04, 0))), 96, armFlared, 48), M.shell, body);
    // bisagra: cubo redondeado y hundido, no un cilindro de tapa plana
    const knuckleProf = [[0.0005, -0.06], [0.05, -0.06], [0.062, -0.052], [0.066, -0.035], [0.066, 0.03], [0.06, 0.05], [0.045, 0.058], [0.0005, 0.06]];
    const knuckle = mesh(new THREE.LatheGeometry(new THREE.SplineCurve(knuckleProf.map(([x, y]) => new THREE.Vector2(x, y))).getPoints(32), 96), M.shellDark, body);
    knuckle.position.copy(a.root).add(V3(0, a.front ? -0.005 : 0.0, 0));
    // motor, pata y hélice
    const g = motorAssembly(M, body, a.hub, a);
    const pr = base.props[i];
    if (pr) addTips(pr);
    if (pr) {
      pr.group.removeFromParent();
      pr.group.position.set(0, 0.215, 0);
      g.add(pr.group);
      propCtl.push(pr);
    }
  }
  yield;

  // ---- Cámara ----
  const cam = buildCamera(M, base);
  cam.gimbal.position.set(0, -0.03, 0.99);
  body.add(cam.gimbal);
  // Collar del morro que abraza la esfera
  const collarProf = [[cam.R + 0.006, -0.14], [cam.R + 0.026, -0.155], [cam.R + 0.032, -0.12], [cam.R + 0.018, -0.095], [cam.R + 0.006, -0.1]];
  const collar = new THREE.LatheGeometry(collarProf.map(([x, y]) => new THREE.Vector2(x, y)), 96);
  collar.rotateX(Math.PI / 2);
  const col = mesh(collar, M.shell, body);
  col.position.copy(cam.gimbal.position);
  const screw = new THREE.CylinderGeometry(0.011, 0.011, 0.008, 20); screw.rotateX(Math.PI / 2);
  for (const a of [0.62, 2.52, 3.76, 5.66]) {
    const sc = mesh(screw, M.wall, body);
    sc.position.copy(cam.gimbal.position).add(V3(Math.cos(a) * (cam.R + 0.024), Math.sin(a) * (cam.R + 0.024), -0.095));
  }

  return {
    root,
    body,
    gimbal: cam.gimbal,
    roll: cam.roll,
    lenses: cam.lenses,
    oldMain: cam.oldMain,
    anchors: { main: cam.lenses.main.group, mid: cam.lenses.mid.group, tele: cam.lenses.tele.group },
    props: propCtl,
    update(dt, speed = 0) {
      for (const pr of propCtl) pr.update(dt, speed);
    },
  };
}
