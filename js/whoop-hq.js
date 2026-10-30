// Cinewhoop de Javi (OddityRC, fotos en ARCHIVOS/FOTOS/DRONES 7963-7975 y cenitales 7991-7993)
// en versión de producto. Escala real: 1 = 100 mm, +Z = morro, +Y = arriba.
// Protectores de una pieza en plástico ahumado translúcido, araña de carbono encima con los motores
// invertidos (cuelgan bajo las almohadillas, la hélice queda abajo dentro del protector), cámara en
// carcasa de TPU delante y antenas en V detrás.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { materials, buildProp } from './models.js';
import { buildLensHQ } from './mavic-hq.js';
import { envOnlySpecular } from './render-hq.js';
import { mesh, lathe, roundRect, flatPart, fpvMaterials } from './fpv5-hq.js';

const TAU = Math.PI * 2;
const V2 = (x, y) => new THREE.Vector2(x, y);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function buildWhoopHQ() {
  const M = materials();
  const { CF, anod, anodEdge, copper, steel, socket, tpu, nylonY, silicone, siliconeBk, velcro, pcb } = fpvMaterials(M);
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  // Plástico ahumado de los protectores: translúcido, con reflejos de estudio en el canto
  const smoke = envOnlySpecular(P({ color: 0x2e3034, roughness: 0.14, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.06, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, envMapIntensity: 2.0 }));
  const clearProp = envOnlySpecular(P({ color: 0x2a2d32, roughness: 0.08, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, transparent: true, opacity: 0.2, envMapIntensity: 2.2, side: THREE.DoubleSide, depthWrite: false }));
  const redRing = P({ color: 0x7a1410, metalness: 0.85, roughness: 0.36 });   // anodizado rojo oscuro
  const capRed = P({ color: 0x8e1612, roughness: 0.45, clearcoat: 0.4 });

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  /* ---------- Protectores de una pieza ---------- */
  const R = 0.272, H = 0.12, C = 0.33;   // radio interior, alto y separación de los centros
  const centers = [[C, C], [-C, C], [C, -C], [-C, -C]];
  // Pared de cada aro: perfil con labio inferior hacia fuera y borde superior redondeado
  const wall = lathe([[R, 0.0], [R + 0.03, 0.0], [R + 0.032, 0.008], [R + 0.014, 0.014], [R + 0.012, H - 0.016], [R + 0.018, H - 0.01], [R + 0.016, H], [R + 0.004, H + 0.002], [R - 0.002, H - 0.008], [R, H - 0.02], [R, 0.0]], 128, true);
  for (const [x, z] of centers) mesh(wall, smoke, body).position.set(x, 0, z);
  // Puentes entre aros vecinos (el centro queda abierto, como en la pieza real)
  const bridge = new RoundedBoxGeometry(0.14, H * 0.8, 0.02, 2, 0.008);
  for (const [x, z, ry] of [[0, C, 0], [0, -C, 0], [C, 0, Math.PI / 2], [-C, 0, Math.PI / 2]]) {   // donde los aros casi se tocan
    const b = mesh(bridge, smoke, body);
    b.position.set(x, H * 0.42, z); b.rotation.y = ry;
  }
  // Base de la cámara y de la pila: bandeja estrecha de lado a lado del morro a la cola
  const keel = flatPart(roundRect(0.24, 0.86, 0.06), 0.016, CF, body, 0.003);
  keel.position.y = -0.007;
  // Patitas bajo el labio exterior de cada aro
  const footGeo = new RoundedBoxGeometry(0.05, 0.07, 0.03, 2, 0.012);
  for (const [x, z] of centers) {
    const a = Math.atan2(x, z);
    const f = mesh(footGeo, smoke, body);
    f.position.set(x + Math.sin(a) * (R + 0.01), -0.04, z + Math.cos(a) * (R + 0.01));
    f.rotation.y = a;
  }

  /* ---------- Araña de carbono, motores invertidos y hélices ---------- */
  const spider = new THREE.Shape();
  {
    // cuerpo central y cuatro brazos hasta las almohadillas de los motores
    const pts = [];
    for (let i = 0; i < 4; i++) {
      const a = Math.PI / 4 - (i * TAU) / 4;   // en sentido horario: cada brazo enlaza con el siguiente
      const ax = Math.sin(a), ay = Math.cos(a);
      const px = -ay, py = ax;
      pts.push(V2(ax * 0.14 - px * 0.07, ay * 0.14 - py * 0.07));
      pts.push(V2(ax * 0.36 - px * 0.04, ay * 0.36 - py * 0.04));
      for (let k = -4; k <= 4; k++) {   // almohadilla redonda
        const t = a - (k / 4) * (Math.PI * 0.8);   // de un lado del brazo al otro por fuera
        pts.push(V2(ax * 0.465 + Math.sin(t) * 0.09, ay * 0.465 + Math.cos(t) * 0.09));
      }
      pts.push(V2(ax * 0.36 + px * 0.04, ay * 0.36 + py * 0.04));
      pts.push(V2(ax * 0.14 + px * 0.07, ay * 0.14 + py * 0.07));
    }
    spider.setFromPoints(pts);
    for (const [x, z] of centers) { const h = new THREE.Path(); h.absarc(x, -z, 0.03, 0, TAU, true); spider.holes.push(h); }
    for (const [x, y] of [[0, 0.1], [0, -0.1]]) { const h = new THREE.Path(); h.absellipse(x, y, 0.035, 0.05, 0, TAU, true); spider.holes.push(h); }
  }
  flatPart(spider, 0.025, CF, body, 0.004).position.y = 0.16;
  flatPart(roundRect(0.22, 0.5, 0.06), 0.018, CF, body, 0.003).position.set(0, 0.34, -0.02);
  const screwHead = lathe([[0, 0], [0.016, 0], [0.016, 0.006], [0.014, 0.009], [0, 0.009]], 20);
  const hex = new THREE.CylinderGeometry(0.006, 0.006, 0.002, 6);
  const screw = (x, y, z) => { mesh(screwHead, steel, body).position.set(x, y, z); mesh(hex, socket, body).position.set(x, y + 0.0085, z); };
  for (const [x, z] of [[0.07, 0.18], [-0.07, 0.18], [0.07, -0.22], [-0.07, -0.22]]) {
    mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.155, 12), anod, body).position.set(x, 0.262, z);
    screw(x, 0.358, z);
  }
  // Motor 1205 invertido: base con bobinado visible por arriba, campana negra con aro rojo abajo
  const base = lathe([[0, 0], [0.07, 0], [0.074, -0.005], [0.074, -0.025], [0.062, -0.03], [0, -0.03]], 40);
  const bell = lathe([[0.0, 0], [0.072, 0], [0.076, -0.006], [0.076, -0.07], [0.07, -0.076], [0.02, -0.08], [0.0, -0.08]], 48);
  const props = [];
  centers.forEach(([x, z], i) => {
    const m = new THREE.Group();
    m.position.set(x, 0.16, z);
    body.add(m);
    for (let k = 0; k < 4; k++) {
      const t = (k / 4) * TAU + Math.PI / 4;
      screw(x + Math.cos(t) * 0.06, 0.185, z + Math.sin(t) * 0.06);
    }
    const w = mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.006, 24), copper, m); w.position.y = 0.012;   // bobinado visto por el hueco
    mesh(base, anod, m);
    const b = mesh(bell, anod, m); b.position.y = -0.03;
    const ring = mesh(new THREE.TorusGeometry(0.0745, 0.0032, 8, 48), redRing, m);
    ring.rotation.x = Math.PI / 2; ring.position.y = -0.102;
    mesh(new THREE.TorusGeometry(0.0765, 0.0018, 6, 48), anodEdge, m).rotation.x = Math.PI / 2;
    const pr = buildProp({ radius: 0.25, blades: 5, chord: 0.085, smoke: false, dir: i % 2 ? 1 : -1 });
    pr.solid.children.forEach((c) => { c.material = clearProp; });
    pr.group.position.y = -0.125;
    pr.group.rotation.x = Math.PI;   // invertida: empuja hacia arriba desde abajo
    m.add(pr.group);
    props.push(pr);
  });

  // Cables de los motores: tres hilos finos por brazo, del motor a la placa central
  const wireMats = [siliconeBk, P({ color: 0x2c2c30, roughness: 0.5, clearcoat: 0.3 }), P({ color: 0x45464c, roughness: 0.5, clearcoat: 0.3 })];
  centers.forEach(([x, z]) => {
    const len = Math.hypot(x, z), ux = x / len, uz = z / len, px = -uz, pz = ux;
    for (let k = -1; k <= 1; k++) {
      const off = k * 0.012;
      const c = new THREE.CatmullRomCurve3([
        V3(x * 0.86 + px * off, 0.19, z * 0.86 + pz * off),
        V3(x * 0.6 + px * off, 0.192, z * 0.6 + pz * off),
        V3(x * 0.3 + px * off * 2, 0.2, z * 0.3 + pz * off * 2),
        V3(ux * 0.08 + px * off * 3, 0.215, uz * 0.08 + pz * off * 3),
      ]);
      mesh(new THREE.TubeGeometry(c, 24, 0.0045, 6), wireMats[k + 1], body);
    }
  });

  /* ---------- Electrónica, cámara y cola ---------- */
  for (const y of [0.21, 0.28]) {
    const b = mesh(new RoundedBoxGeometry(0.2, 0.014, 0.2, 2, 0.005), pcb, body);
    b.position.set(0, y, -0.03);
  }
  // Componentes de las placas: chips, condensadores cerámicos y conectores
  const chip = new RoundedBoxGeometry(0.04, 0.008, 0.04, 1, 0.002);
  const smd = new THREE.BoxGeometry(0.012, 0.006, 0.008);
  const metalCan = P({ color: 0x9a9da4, metalness: 1, roughness: 0.3 });
  for (const [x, z] of [[0.04, 0.02], [-0.05, -0.06], [0.03, -0.09]]) mesh(chip, siliconeBk, body).position.set(x, 0.221, z - 0.03);
  for (let i = 0; i < 14; i++) {
    const a = i * 2.39, r = 0.04 + (i % 5) * 0.012;
    const c = mesh(smd, i % 3 ? P({ color: 0x5a4a38, roughness: 0.6 }) : metalCan, body);
    c.position.set(Math.cos(a) * r, 0.219, Math.sin(a) * r - 0.03); c.rotation.y = a;
  }
  for (const [x, z] of [[0.085, 0.03], [-0.085, -0.08]]) mesh(new RoundedBoxGeometry(0.03, 0.02, 0.05, 1, 0.004), P({ color: 0xe8e2d0, roughness: 0.6 }), body).position.set(x, 0.29, z);
  // Antenas del receptor: dos hilos finos con funda blanca
  for (const sx of [-1, 1]) {
    const c = new THREE.CatmullRomCurve3([V3(sx * 0.06, 0.29, -0.12), V3(sx * 0.12, 0.27, -0.24), V3(sx * 0.2, 0.22, -0.32)]);
    mesh(new THREE.TubeGeometry(c, 16, 0.004, 6), P({ color: 0xd9d6cc, roughness: 0.55 }), body);
  }

  // Cámara en carcasa de TPU con orejas, inclinada hacia arriba; óptica completa delante
  const cam = new THREE.Group();
  cam.position.set(0, 0.2, 0.36);
  cam.rotation.x = -0.22;
  body.add(cam);
  // Carcasa de TPU angulosa: frontal alto, techo que cae hacia atrás, cantos achaflanados
  {
    const prof = new THREE.Shape();
    prof.moveTo(-0.11, -0.12); prof.lineTo(0.11, -0.12); prof.lineTo(0.11, 0.115);
    prof.lineTo(0.08, 0.13); prof.lineTo(-0.07, 0.1); prof.lineTo(-0.11, 0.05); prof.lineTo(-0.11, -0.12);
    const g = new THREE.ExtrudeGeometry(prof, { depth: 0.22, bevelEnabled: true, bevelThickness: 0.018, bevelSize: 0.018, bevelSegments: 3 });
    g.translate(0, 0, -0.11);
    g.rotateY(-Math.PI / 2);   // el perfil (z, y) queda de lado; el ancho, de lado a lado
    mesh(g, tpu, cam);
  }
  for (const sx of [-1, 1]) {
    const ear = mesh(new THREE.ConeGeometry(0.035, 0.07, 4), tpu, cam);
    ear.position.set(sx * 0.1, 0.15, -0.04); ear.rotation.y = Math.PI / 4;
  }
  const bezel = mesh(lathe([[0.085, 0], [0.09, 0.008], [0.09, 0.03], [0.082, 0.036], [0.072, 0.036]], 64), anod, cam);
  bezel.rotation.x = Math.PI / 2; bezel.position.z = 0.11;
  const lens = buildLensHQ(M, { r: 0.132, d: 0.2 });
  lens.setAperture(2.4);
  lens.group.scale.setScalar(0.07 / 0.132);
  lens.group.position.z = 0.15;
  cam.add(lens.group);
  // Cinta de batería, XT30 con cable rojo y condensador
  const strap = mesh(new RoundedBoxGeometry(0.05, 0.012, 0.42, 2, 0.005), velcro, body);
  strap.position.set(0, 0.36, -0.05);
  const plug = new THREE.Group(); plug.position.set(0.04, 0.5, -0.3); plug.rotation.set(0.3, 0, 0.4); body.add(plug);
  mesh(new RoundedBoxGeometry(0.1, 0.06, 0.07, 2, 0.012), nylonY, plug);
  const wire = new THREE.CatmullRomCurve3([V3(0.0, 0.3, -0.18), V3(0.02, 0.38, -0.25), V3(0.04, 0.46, -0.29)]);
  mesh(new THREE.TubeGeometry(wire, 20, 0.016, 10), silicone, body);
  const cap = new THREE.Group(); cap.position.set(-0.07, 0.24, -0.25); cap.rotation.x = Math.PI / 2; body.add(cap);
  mesh(lathe([[0, -0.05], [0.032, -0.05], [0.034, -0.045], [0.034, 0.045], [0.032, 0.05], [0, 0.05]], 24), capRed, cap);
  mesh(new THREE.CircleGeometry(0.028, 24), steel, cap).position.y = 0.0505;
  // Antenas en V: cuello de goma y cápsula grande torneada
  const head = lathe([[0, 0], [0.045, 0], [0.062, 0.015], [0.064, 0.04], [0.064, 0.12], [0.058, 0.138], [0.04, 0.146], [0, 0.147]], 32, true);
  for (const sx of [-1, 1]) {
    const ant = new THREE.Group();
    ant.position.set(sx * 0.02, 0.3, -0.36);
    ant.rotation.set(-0.2, 0, sx * -0.62);
    body.add(ant);
    mesh(new THREE.CylinderGeometry(0.014, 0.02, 0.34, 12), siliconeBk, ant).position.y = 0.17;
    mesh(head, tpu, ant).position.y = 0.33;
  }

  root.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
  return { root, body, props, shadows: true, update(dt, speed = 0) { props.forEach((p) => p.update(dt, speed)); } };
}
