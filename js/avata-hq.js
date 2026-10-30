// DJI Avata 2 de Javi (fotos en ARCHIVOS/FOTOS/DRONES 7976-7990) en versión de producto.
// Escala real con las medidas oficiales (185 × 212 × 64 mm): 1 = 100 mm, +Z = morro, +Y = arriba.
// Cuerpo largo moldeado (loft de superelipses, como el Mavic) en plástico granulado gris DJI,
// cuatro aros protectores finos unidos, bastidor negro en X debajo con los motores hacia arriba,
// cámara en marco cuadrado con franjas naranjas y pestañas naranjas de la batería detrás.
// Sin logotipos.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { materials, buildProp } from './models.js';
import { buildLensHQ, curve1D, superPoint, ringsGeometry, sweep, line } from './mavic-hq.js';
import { grainy, envOnlySpecular } from './render-hq.js';
import { mesh, lathe, roundRect, flatPart } from './fpv5-hq.js';

const TAU = Math.PI * 2;
const V2 = (x, y) => new THREE.Vector2(x, y);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildAvataHQ() {
  const M = materials();
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  // Plástico DJI: mate granulado gris oscuro (carcasa) y casi negro (bastidor inferior)
  const shell = grainy(P({ color: 0x1e1f22, roughness: 0.56, metalness: 0.02, clearcoat: 0.06, clearcoatRoughness: 0.55, specularIntensity: 0.7, envMapIntensity: 1.1 }));
  const frame = grainy(P({ color: 0x131315, roughness: 0.6, metalness: 0.02, clearcoat: 0.04, clearcoatRoughness: 0.6 }), { freq: 600, amp: 0.00025, smudge: 3 });
  const orange = P({ color: 0xe06512, roughness: 0.42, metalness: 0, clearcoat: 0.3, clearcoatRoughness: 0.3 });
  const glossy = envOnlySpecular(P({ color: 0x050607, roughness: 0.22, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.18, envMapIntensity: 0.45 }));
  const rubber = P({ color: 0x0e0e10, roughness: 0.85, metalness: 0, sheen: 0.4, sheenColor: 0x2a2a2e });
  const motorMat = P({ color: 0x18181b, metalness: 0.8, roughness: 0.32, clearcoat: 0.2 });
  const steel = P({ color: 0xb4b7be, metalness: 1, roughness: 0.25 });
  const propMat = P({ color: 0x0f1012, roughness: 0.72, metalness: 0, clearcoat: 0.1, clearcoatRoughness: 0.6, side: THREE.DoubleSide });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  /* ---------- Cuerpo moldeado ---------- */
  // Estaciones de morro a cola: ancho, alto superior e inferior, cuadratura
  const Z0 = -0.92, Z1 = 0.62, Y = 0.38;   // cuerpo de ~170 mm de largo, bajo, apoyado sobre los aros
  const W = curve1D([0.34, 0.39, 0.4, 0.4, 0.39, 0.38, 0.38]);
  const HT = curve1D([0.07, 0.1, 0.105, 0.105, 0.1, 0.1, 0.1]);
  const HB = curve1D([0.05, 0.07, 0.08, 0.08, 0.08, 0.08, 0.08]);
  const rings = [];
  const N = 48, SEG = 64;
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const z = Z0 + (Z1 - Z0) * u;
    // remates redondeados en los extremos
    const e0 = Math.sqrt(Math.max(0, 1 - Math.pow(1 - Math.min(1, u / 0.07), 2)));
    const e1 = Math.sqrt(Math.max(0, 1 - Math.pow(1 - Math.min(1, (1 - u) / 0.05), 2)));
    const k = 0.25 + 0.75 * Math.min(e0, e1);
    const ring = [];
    for (let j = 0; j < SEG; j++) {
      const [x, y] = superPoint((j / SEG) * TAU, W(u) * k, HT(u) * k, HB(u) * k, 3.4);
      ring.push(V3(x, Y + y, z));
    }
    rings.push(ring);
  }
  mesh(ringsGeometry(rings), shell, body);
  // Cristal superior oscuro y franja trasera
  const top = mesh(new RoundedBoxGeometry(0.24, 0.01, 0.5, 3, 0.005), glossy, body);
  top.position.set(0, Y + 0.103, -0.2);
  // Pestañas naranjas de la batería y ventanas laterales de sensores
  for (const sx of [-1, 1]) {
    const tab = mesh(new RoundedBoxGeometry(0.03, 0.09, 0.05, 2, 0.01), orange, body);
    tab.position.set(sx * 0.19, Y + 0.03, -0.84);
    const win = mesh(new RoundedBoxGeometry(0.02, 0.07, 0.16, 2, 0.012), glossy, body);
    win.position.set(sx * 0.2, Y + 0.01, -0.55);
    const line_ = mesh(new RoundedBoxGeometry(0.022, 0.012, 0.11, 1, 0.004), orange, body);
    line_.position.set(sx * 0.2, Y - 0.03, -0.55);
  }

  /* ---------- Aros protectores ---------- */
  const RC = 0.44, CX = 0.47, CZ = 0.55, YR = 0.3;   // aros de ~95 mm que casi se tocan
  const centers = [[CX, CZ], [-CX, CZ], [CX, -CZ], [-CX, -CZ]];
  // Sección del aro: rectángulo de cantos redondeados (6,5 × 5 mm), torneado alrededor del centro
  const sec = [];
  for (let j = 0; j <= 24; j++) {
    const [x, y] = superPoint((j / 24) * TAU, 0.088, 0.03, 0.03, 3.4);   // banda de ~9 × 6 mm
    sec.push([RC + x, y]);
  }
  const ringGeo = lathe(sec, 160);
  for (const [x, z] of centers) mesh(ringGeo, shell, body).position.set(x, YR, z);
  /* ---------- Bastidor inferior, motores, hélices y patas ---------- */
  const base = lathe([[0, 0], [0.085, 0], [0.09, 0.008], [0.09, 0.045], [0.082, 0.05], [0, 0.05]], 40);
  const bell = lathe([[0, 0], [0.08, 0], [0.085, 0.006], [0.085, 0.06], [0.078, 0.068], [0.03, 0.072], [0, 0.072]], 48);
  const props = [];
  centers.forEach(([x, z], i) => {
    // brazo en X bajo el cuerpo, del centro al motor
    // brazo recto del bastidor en X, del centro al motor (se ve dentro de los aros desde arriba)
    const arm = sweep(line(V3(Math.sign(x) * 0.08, 0.2, z * 0.22), V3(x * 0.5, 0.17, z * 0.6), V3(x, 0.15, z)), 24, (u) => ({ w: 0.075 - 0.01 * u, h: 0.06, n: 3.4 }), 20);
    mesh(arm, frame, body);
    const m = new THREE.Group();
    m.position.set(x, 0.15, z);
    body.add(m);
    mesh(base, frame, m);
    const b = mesh(bell, motorMat, m); b.position.y = 0.05;
    mesh(new THREE.TorusGeometry(0.0855, 0.0018, 6, 48), steel, m).rotation.x = Math.PI / 2;
    m.children[2].position.y = 0.11;
    // pata de goma bajo el motor
    const foot = mesh(new RoundedBoxGeometry(0.14, 0.1, 0.1, 3, 0.035), rubber, body);
    foot.position.set(x, 0.05, z);
    foot.rotation.y = Math.atan2(x, z);
    const pr = buildProp({ radius: 0.37, blades: 3, chord: 0.11, smoke: false, dir: i % 2 ? 1 : -1 });
    pr.solid.children.forEach((c) => { c.material = propMat; });
    pr.group.position.y = 0.135;
    m.add(pr.group);
    mesh(lathe([[0, 0], [0.03, 0], [0.03, 0.02], [0.018, 0.03], [0, 0.032]], 24), motorMat, pr.group);
    props.push(pr);
  });
  // Placa central inferior
  mesh(new RoundedBoxGeometry(0.3, 0.11, 0.8, 3, 0.03), frame, body).position.set(0, 0.25, -0.05);   // une el bastidor con el cuerpo

  /* ---------- Cámara en marco cuadrado ---------- */
  const housing = new THREE.Group();
  housing.position.set(0, Y + 0.0, Z1 - 0.08);
  body.add(housing);
  {
    const s = roundRect(0.4, 0.36, 0.08);
    const h = new THREE.Path();
    const hw = 0.14, hh = 0.13, r = 0.035;
    h.moveTo(-hw + r, -hh); h.lineTo(hw - r, -hh); h.quadraticCurveTo(hw, -hh, hw, -hh + r);
    h.lineTo(hw, hh - r); h.quadraticCurveTo(hw, hh, hw - r, hh); h.lineTo(-hw + r, hh);
    h.quadraticCurveTo(-hw, hh, -hw, hh - r); h.lineTo(-hw, -hh + r); h.quadraticCurveTo(-hw, -hh, -hw + r, -hh);
    s.holes.push(h);
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.26, bevelEnabled: true, bevelThickness: 0.015, bevelSize: 0.015, bevelSegments: 3, curveSegments: 16 });
    g.translate(0, 0, 0.0);
    mesh(g, shell, housing);
  }
  for (const sx of [-1, 1]) {
    const strip = mesh(new RoundedBoxGeometry(0.03, 0.24, 0.02, 2, 0.01), orange, housing);
    strip.position.set(sx * 0.18, 0.0, 0.272);
  }
  // Cámara con estabilizador de un eje: bloque negro con aletas y la óptica completa
  const cam = new THREE.Group();
  cam.position.set(0, -0.01, 0.17);
  cam.rotation.x = 0.08;
  housing.add(cam);
  mesh(new RoundedBoxGeometry(0.22, 0.22, 0.2, 4, 0.035), frame, cam);
  for (let i = 0; i < 6; i++) {
    const fin = mesh(new RoundedBoxGeometry(0.2, 0.008, 0.06, 1, 0.003), frame, cam);
    fin.position.set(0, 0.115, -0.05 + i * 0.016 - 0.04);
  }
  const bezel = mesh(lathe([[0.1, 0], [0.104, 0.01], [0.104, 0.045], [0.095, 0.055], [0.085, 0.055]], 64), frame, cam);
  bezel.rotation.x = Math.PI / 2; bezel.position.z = 0.1;
  const lens = buildLensHQ(M, { r: 0.132, d: 0.2 });
  lens.setAperture(2.8);
  lens.group.scale.setScalar(0.085 / 0.132);
  lens.group.position.z = 0.16;
  cam.add(lens.group);
  for (const sx of [-1, 1]) {   // pivotes del estabilizador
    const pv = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 24), motorMat, cam);
    pv.rotation.z = Math.PI / 2; pv.position.set(sx * 0.125, 0, 0);
  }

  root.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, body, props, shadows: true, update(dt, speed = 0) { props.forEach((p) => p.update(dt, speed)); } };
}
