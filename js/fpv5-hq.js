// FPV 5" freestyle de Javi (GEPRC, fotos en ARCHIVOS/FOTOS/DRONES 8002-8018) en versión de producto.
// Escala real: 1 = 100 mm, +Z = morro, +Y = arriba. Entre ejes ~225 mm, hélices tribala de 5",
// cámara de acción tipo Osmo Action (70 × 44 × 33 mm) delante y arriba, sin batería (solo las cintas).
// Lo que lo hace creíble: perfiles torneados en vez de cilindros, cristales de verdad en las ópticas,
// carbono barnizado con canto mate y pequeñas imperfecciones, TPU impreso con sus capas y sombras propias.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { materials, buildProp } from './models.js';
import { buildLensHQ } from './mavic-hq.js';
import { grainy, envOnlySpecular, layerLines } from './render-hq.js';

const TAU = Math.PI * 2;
const V2 = (x, y) => new THREE.Vector2(x, y);
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

export function mesh(geo, mat, parent) {
  const m = new THREE.Mesh(geo, mat);
  if (parent) parent.add(m);
  return m;
}
// Perfil torneado alrededor del eje Y (puntos [radio, altura]); suave con spline si se pide
export function lathe(pts, seg = 64, smooth = false) {
  const v = pts.map(([r, y]) => V2(r, y));
  return new THREE.LatheGeometry(smooth ? new THREE.SplineCurve(v).getPoints(pts.length * 6) : v, seg);
}
// Contorno de esquinas redondeadas (plano XY)
export function roundRect(w, l, r) {
  const s = new THREE.Shape();
  const x = w / 2, y = l / 2;
  s.moveTo(-x + r, -y);
  s.lineTo(x - r, -y); s.quadraticCurveTo(x, -y, x, -y + r);
  s.lineTo(x, y - r); s.quadraticCurveTo(x, y, x - r, y);
  s.lineTo(-x + r, y); s.quadraticCurveTo(-x, y, -x, y - r);
  s.lineTo(-x, -y + r); s.quadraticCurveTo(-x, -y, -x + r, -y);
  return s;
}
// Pieza plana extruida con canto biselado, tumbada en XZ (el eje Y del contorno pasa a +Z)
export function flatPart(shape, t, mats, parent, bevel = 0.005) {
  const g = new THREE.ExtrudeGeometry(shape, { depth: t, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 20 });
  g.rotateX(Math.PI / 2);
  g.translate(0, t, 0);
  return mesh(g, mats, parent);
}

// Materiales de producto para los FPV (carbono, aluminio anodizado, TPU impreso, silicona…)
export function fpvMaterials(M = materials()) {
  const P = (o) => new THREE.MeshPhysicalMaterial(o);

  // Carbono: barniz con micro-imperfecciones (huellas, roces) y canto cortado gris mate
  const carbon = grainy(M.carbon.clone(), { freq: 700, amp: 0.00008, smudge: 3.5 });
  carbon.color.setHex(0x1a1a1e);
  carbon.roughness = 0.3;
  carbon.clearcoat = 1;
  carbon.clearcoatRoughness = 0.14;
  const carbonEdge = P({ color: 0x2e2e33, roughness: 0.8, metalness: 0.05 });
  const CF = [carbon, carbonEdge];
  const anod = P({ color: 0x111113, metalness: 0.85, roughness: 0.28, clearcoat: 0.3, clearcoatRoughness: 0.25 });
  const anodEdge = P({ color: 0x6c6e74, metalness: 1, roughness: 0.32 });       // filo mecanizado: aluminio a la vista
  const copper = P({ color: 0x8a4f2b, metalness: 1, roughness: 0.4 });
  const steel = P({ color: 0xb4b7be, metalness: 1, roughness: 0.24 });
  const socket = P({ color: 0x0a0a0b, metalness: 0.5, roughness: 0.6 });
  const tpu = layerLines(P({ color: 0x0d0d0f, roughness: 0.74, metalness: 0, sheen: 0.45, sheenRoughness: 0.6, sheenColor: 0x2c2c31 }));
  const tpuRed = layerLines(P({ color: 0xb01d17, roughness: 0.62, metalness: 0, sheen: 0.35, sheenColor: 0xff6b5a }));
  const nylonY = P({ color: 0xd9971a, roughness: 0.45, metalness: 0, clearcoat: 0.25 });
  const brass = P({ color: 0xc9a24a, metalness: 1, roughness: 0.3 });
  const silicone = P({ color: 0x9a1611, roughness: 0.48, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const siliconeBk = P({ color: 0x0f0f11, roughness: 0.48, metalness: 0, clearcoat: 0.35, clearcoatRoughness: 0.4 });
  const velcro = grainy(P({ color: 0x18181b, roughness: 0.96, metalness: 0, sheen: 0.7, sheenRoughness: 0.8, sheenColor: 0x45454c }), { freq: 1400, amp: 0.0003, smudge: 8 });
  const pcb = P({ color: 0x0e1210, roughness: 0.42, metalness: 0.1, clearcoat: 0.7, clearcoatRoughness: 0.2 });
  const camPlastic = grainy(P({ color: 0x151517, roughness: 0.62, metalness: 0.02, clearcoat: 0.06, clearcoatRoughness: 0.6 }), { freq: 900, amp: 0.00022, smudge: 6 });
  const glassDark = envOnlySpecular(P({ color: 0x040506, roughness: 0.03, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.5 }));
  const propMat = P({ color: 0x2c2e33, roughness: 0.22, metalness: 0, clearcoat: 0.6, clearcoatRoughness: 0.2, transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  return { carbon, carbonEdge, CF, anod, anodEdge, copper, steel, socket, tpu, tpuRed, nylonY, brass, silicone, siliconeBk, velcro, pcb, camPlastic, glassDark, propMat };
}

export function buildFPV5HQ() {
  const M = materials();
  const { carbon, carbonEdge, CF, anod, anodEdge, copper, steel, socket, tpu, tpuRed, nylonY, brass, silicone, siliconeBk, velcro, pcb, camPlastic, glassDark, propMat } = fpvMaterials(M);

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  /* ---------- Bastidor ---------- */
  // Placa inferior con cintura y placa superior más corta
  const bottom = new THREE.Shape();
  {
    const pts = [[0, 0.68], [0.17, 0.6], [0.2, 0.3], [0.16, 0.0], [0.2, -0.35], [0.19, -0.62], [0, -0.7]];
    const L = pts.map(([x, y]) => V2(x, y));
    const R = L.slice(1, -1).reverse().map((p) => V2(-p.x, p.y));
    const all = new THREE.SplineCurve([...L, ...R, L[0]]).getPoints(80);
    bottom.setFromPoints(all);
  }
  flatPart(bottom, 0.045, CF, body).position.set(0, -0.045, -0.05);
  flatPart(roundRect(0.33, 0.96, 0.08), 0.025, CF, body).position.set(0, 0.29, -0.12);

  // Separadores anodizados con filo mecanizado y tornillos de cabeza allen
  const standoff = lathe([[0.0, 0], [0.019, 0], [0.019, 0.006], [0.017, 0.012], [0.017, 0.278], [0.019, 0.284], [0.019, 0.29], [0, 0.29]], 20);
  const screwHead = lathe([[0, 0], [0.024, 0], [0.024, 0.009], [0.021, 0.013], [0, 0.013]], 24);
  const hexHole = new THREE.CylinderGeometry(0.009, 0.009, 0.003, 6);
  const screw = (parent, x, y, z) => {
    const g = new THREE.Group();
    g.position.set(x, y, z);
    parent.add(g);
    mesh(screwHead, steel, g);
    mesh(hexHole, socket, g).position.y = 0.0125;
    return g;
  };
  for (const [x, z] of [[0.14, 0.3], [-0.14, 0.3], [0.14, -0.52], [-0.14, -0.52]]) {
    mesh(standoff, anod, body).position.set(x, 0, z);
    screw(body, x, 0.315, z);
  }

  /* ---------- Electrónica entre placas ---------- */
  for (const y of [0.07, 0.17]) {
    const b = mesh(new RoundedBoxGeometry(0.3, 0.018, 0.3, 2, 0.006), pcb, body);
    b.position.set(0, y, -0.15);
  }
  for (const [x, z, w, d] of [[0.07, -0.08, 0.06, 0.05], [-0.08, -0.2, 0.05, 0.05], [0.08, -0.23, 0.04, 0.07], [-0.06, -0.06, 0.035, 0.035]]) {
    mesh(new RoundedBoxGeometry(w, 0.02, d, 1, 0.004), siliconeBk, body).position.set(x, 0.189, z);
  }
  // Condensador de baja ESR con funda y tapa ranurada
  const capG = new THREE.Group();
  capG.position.set(-0.1, 0.24, -0.5); capG.rotation.x = Math.PI / 2;
  body.add(capG);
  mesh(lathe([[0, -0.075], [0.046, -0.075], [0.049, -0.068], [0.049, 0.068], [0.046, 0.075], [0, 0.075]], 32), siliconeBk, capG);
  mesh(new THREE.CircleGeometry(0.04, 32), steel, capG).position.y = 0.0755;
  mesh(new RoundedBoxGeometry(0.2, 0.055, 0.26, 2, 0.02), siliconeBk, body).position.set(0.02, 0.06, -0.5);

  /* ---------- Brazos, patines, motores y hélices ---------- */
  const armShape = (L) => {
    const s = new THREE.Shape();
    s.moveTo(-0.12, 0);
    s.lineTo(-0.075, L - 0.13);
    s.absarc(0, L, 0.15, Math.PI + 1.05, -1.05, false);
    s.lineTo(0.12, 0);
    s.lineTo(-0.12, 0);
    const hole = new THREE.Path();
    hole.absellipse(0, L * 0.48, 0.03, L * 0.22, 0, TAU, false);
    s.holes.push(hole);
    return s;
  };
  // Patín de TPU: bloque con la cara inferior curvada y cantos redondeados
  const footGeo = new RoundedBoxGeometry(0.2, 0.15, 0.25, 4, 0.055);
  // Motor 2306: base con brazos y orificios, estator con bobinado visible por las ventanas,
  // campana cónica calada con imanes y tapa con radios
  const motorBase = lathe([[0, 0], [0.13, 0], [0.135, 0.006], [0.135, 0.03], [0.125, 0.04], [0.06, 0.045], [0, 0.045]], 48);
  const winding = new THREE.CylinderGeometry(0.11, 0.11, 0.05, 48, 1, true);
  const bellSide = lathe([[0.122, 0.0], [0.141, 0.004], [0.143, 0.02], [0.143, 0.085], [0.138, 0.098], [0.128, 0.104], [0.122, 0.104]], 64);
  const bellTop = (() => {
    const s = new THREE.Shape(); s.absarc(0, 0, 0.13, 0, TAU, false);
    for (let i = 0; i < 6; i++) {
      const a0 = (i / 6) * TAU + 0.12, a1 = ((i + 1) / 6) * TAU - 0.12;
      const h = new THREE.Path();
      h.absarc(0, 0, 0.105, a0, a1, false);
      h.absarc(0, 0, 0.045, a1, a0, true);
      s.holes.push(h);
    }
    const g = new THREE.ExtrudeGeometry(s, { depth: 0.012, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.003, bevelSegments: 2, curveSegments: 32 });
    g.rotateX(-Math.PI / 2);
    return g;
  })();
  const shaftNut = lathe([[0, 0], [0.034, 0], [0.034, 0.024], [0.026, 0.032], [0.012, 0.034], [0.012, 0.05], [0, 0.05]], 6);
  const props = [];
  [[38, -1], [-38, 1], [142, 1], [-142, -1]].forEach(([deg, dir]) => {
    const a = THREE.MathUtils.degToRad(deg);
    const d = V3(Math.sin(a), 0, Math.cos(a));
    const arm = flatPart(armShape(1.02), 0.055, CF, body);
    arm.position.copy(d.clone().multiplyScalar(0.1).add(V3(0, -0.005, -0.05)));
    arm.rotation.y = a;
    const hub = d.clone().multiplyScalar(1.12).add(V3(0, 0, -0.05));

    const foot = mesh(footGeo, tpu, body);
    foot.position.copy(hub).setY(-0.082);
    foot.rotation.y = a;

    const m = new THREE.Group();
    m.position.copy(hub).setY(0.05);
    body.add(m);
    mesh(motorBase, anod, m);
    const w = mesh(winding, copper, m); w.position.y = 0.07;
    mesh(new THREE.CylinderGeometry(0.105, 0.105, 0.05, 32), socket, m).position.y = 0.07;   // núcleo oscuro detrás del cobre
    const bell = new THREE.Group(); bell.position.y = 0.05; m.add(bell);
    mesh(bellSide, anod, bell);
    const top = mesh(bellTop, anod, bell); top.position.y = 0.104;
    mesh(new THREE.TorusGeometry(0.1415, 0.0025, 8, 64), anodEdge, bell).rotation.x = Math.PI / 2;
    bell.children[2].position.y = 0.098;
    const pr = buildProp({ radius: 0.63, blades: 3, chord: 0.13, smoke: true, dir, smokeOpacity: 0.6 });
    pr.solid.children.forEach((c) => { c.material = propMat; });
    pr.group.position.y = 0.17;
    m.add(pr.group);
    mesh(shaftNut, anod, pr.group).position.y = 0.012;
    props.push(pr);
  });

  /* ---------- Cámara FPV delantera ---------- */
  for (const sx of [-1, 1]) {
    const plate = new THREE.Shape();
    plate.moveTo(-0.13, -0.12); plate.lineTo(0.13, -0.12); plate.lineTo(0.13, 0.04);
    plate.quadraticCurveTo(0.13, 0.12, 0.05, 0.12); plate.lineTo(-0.13, 0.12); plate.lineTo(-0.13, -0.12);
    const hole = new THREE.Path(); hole.absarc(0.02, 0, 0.03, 0, TAU, true); plate.holes.push(hole);
    const side = flatPart(plate, 0.018, [anod, anodEdge], body, 0.003);
    side.rotation.z = Math.PI / 2;   // de pie: el contorno queda en el plano YZ y el grosor hacia -X
    side.position.set(sx * 0.12 + (sx > 0 ? 0.018 : 0), 0.15, 0.48);
  }
  const fcam = new THREE.Group();
  fcam.position.set(0, 0.15, 0.49);
  fcam.rotation.x = -0.3;
  body.add(fcam);
  mesh(new RoundedBoxGeometry(0.19, 0.19, 0.16, 4, 0.035), camPlastic, fcam);
  const fBarrel = mesh(lathe([[0.07, 0], [0.074, 0.01], [0.074, 0.05], [0.068, 0.06], [0.06, 0.06]], 48), anod, fcam);
  fBarrel.rotation.x = Math.PI / 2; fBarrel.position.z = 0.075;
  const fLens = buildLensHQ(M, { r: 0.132, d: 0.2 });
  fLens.setAperture(2.4);
  fLens.group.scale.setScalar(0.055 / 0.132);
  fLens.group.position.z = 0.135;
  fcam.add(fLens.group);

  /* ---------- Cámara de acción en su soporte de TPU ---------- */
  const mount = new THREE.Group();
  mount.position.set(0, 0.31, 0.28);
  body.add(mount);
  mesh(new RoundedBoxGeometry(0.26, 0.05, 0.22, 3, 0.02), tpu, mount).position.y = 0.025;
  for (const sx of [-1, 1]) {
    const cheek = mesh(new RoundedBoxGeometry(0.035, 0.2, 0.17, 3, 0.015), tpu, mount);
    cheek.position.set(sx * 0.11, 0.13, 0); cheek.rotation.x = -0.25;
  }
  const ac = new THREE.Group();
  ac.position.set(0, 0.73, 0.3);
  ac.rotation.x = -0.32;
  body.add(ac);
  // Cuerpo: caja de cantos muy redondeados con una junta perimetral
  mesh(new RoundedBoxGeometry(0.705, 0.442, 0.328, 6, 0.08), camPlastic, ac);
  const seam = mesh(new RoundedBoxGeometry(0.709, 0.446, 0.012, 6, 0.08), socket, ac);
  seam.position.z = -0.07;
  // Frontal: pantalla con cristal enrasado y módulo de la óptica en relieve
  const fscreen = mesh(new RoundedBoxGeometry(0.3, 0.3, 0.008, 3, 0.04), glassDark, ac);
  fscreen.position.set(0.17, 0.0, 0.163);
  const lensPod = mesh(lathe([[0.15, 0], [0.152, 0.008], [0.15, 0.03], [0.142, 0.038], [0.13, 0.04]], 64), camPlastic, ac);
  lensPod.rotation.x = Math.PI / 2; lensPod.position.set(-0.16, 0.0, 0.16);
  // Filtro ND: aro moleteado y cristal tintado; detrás, la óptica completa
  const knurl = new THREE.CylinderGeometry(0.14, 0.14, 0.04, 96, 1, true);
  {
    const p = knurl.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x), k = 1 + 0.012 * Math.cos(a * 48);
      p.setX(i, x * k); p.setZ(i, z * k);
    }
    knurl.computeVertexNormals();
  }
  const nd = new THREE.Group(); nd.position.set(-0.16, 0.0, 0.215); nd.rotation.x = Math.PI / 2; ac.add(nd);
  mesh(knurl, anod, nd);
  mesh(new THREE.TorusGeometry(0.128, 0.004, 8, 96), anodEdge, nd).rotation.x = Math.PI / 2;
  nd.children[1].position.y = 0.02;
  const acLens = buildLensHQ(M, { r: 0.132, d: 0.2 });
  acLens.setAperture(2.8);
  acLens.group.scale.setScalar(0.112 / 0.132);
  acLens.group.position.set(-0.16, 0.0, 0.232);
  ac.add(acLens.group);
  // Arriba: botón de grabar; detrás: pantalla grande
  const rec = mesh(lathe([[0, 0], [0.04, 0], [0.04, 0.008], [0.034, 0.014], [0, 0.014]], 32), tpuRed, ac);
  rec.position.set(0.2, 0.218, 0.02);
  const back = mesh(new RoundedBoxGeometry(0.52, 0.36, 0.008, 3, 0.04), glassDark, ac);
  back.position.z = -0.164;

  /* ---------- Cintas, conector y antenas ---------- */
  for (const z of [-0.08, -0.38]) {
    const curve = new THREE.CatmullRomCurve3([V3(-0.18, 0.31, z), V3(-0.2, 0.47, z), V3(-0.1, 0.6, z), V3(0.1, 0.6, z), V3(0.2, 0.47, z), V3(0.18, 0.31, z)]);
    // cinta plana barrida por la curva: 20 mm de ancho y 1,6 mm de grosor
    const pts = curve.getPoints(48);
    const ribbon = [];
    for (let i = 0; i < pts.length; i++) {
      const t = curve.getTangent(i / (pts.length - 1));
      const n = V3(0, 0, 1);
      const b = new THREE.Vector3().crossVectors(t, n).normalize();
      ribbon.push([pts[i].clone().addScaledVector(n, 0.1).addScaledVector(b, 0.008), pts[i].clone().addScaledVector(n, -0.1).addScaledVector(b, 0.008),
        pts[i].clone().addScaledVector(n, -0.1).addScaledVector(b, -0.008), pts[i].clone().addScaledVector(n, 0.1).addScaledVector(b, -0.008)]);
    }
    const pos = [], idx = [];
    ribbon.forEach((r) => r.forEach((p) => pos.push(p.x, p.y, p.z)));
    for (let i = 0; i < ribbon.length - 1; i++) for (let j = 0; j < 4; j++) {
      const a0 = i * 4 + j, b0 = i * 4 + ((j + 1) % 4), c0 = (i + 1) * 4 + j, d0 = (i + 1) * 4 + ((j + 1) % 4);
      idx.push(a0, c0, b0, b0, c0, d0);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    rg.setIndex(idx); rg.computeVertexNormals();
    mesh(rg, velcro, body);
    // hebilla de aluminio
    const buckle = mesh(new RoundedBoxGeometry(0.03, 0.06, 0.22, 2, 0.008), anodEdge, body);
    buckle.position.set(0.19, 0.4, z); buckle.rotation.z = -0.25;
  }
  // XT60: cuerpo con chaflán, pines de latón y cables de silicona
  const plug = new THREE.Group(); plug.position.set(0.05, 0.58, -0.3); plug.rotation.z = 0.5; body.add(plug);
  mesh(new RoundedBoxGeometry(0.16, 0.08, 0.1, 3, 0.02), nylonY, plug);
  for (const x of [-0.035, 0.035]) {
    const pin = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.03, 16), brass, plug);
    pin.position.set(x, 0.05, 0);
  }
  const wireR = new THREE.CatmullRomCurve3([V3(-0.06, 0.24, -0.45), V3(-0.05, 0.38, -0.38), V3(-0.01, 0.5, -0.3), V3(0.03, 0.555, -0.29)]);
  mesh(new THREE.TubeGeometry(wireR, 32, 0.021, 12), silicone, body);
  const wireB = new THREE.CatmullRomCurve3([V3(-0.12, 0.24, -0.45), V3(-0.1, 0.4, -0.39), V3(0.0, 0.53, -0.33), V3(0.07, 0.575, -0.31)]);
  mesh(new THREE.TubeGeometry(wireB, 32, 0.021, 12), siliconeBk, body);
  const redMount = mesh(new RoundedBoxGeometry(0.14, 0.2, 0.06, 3, 0.02), tpuRed, body);
  redMount.position.set(-0.06, 0.38, -0.55); redMount.rotation.x = 0.4;
  // Antenas tipo piruleta: cable, cuello de goma y cápsula torneada
  const antHead = lathe([[0, 0], [0.03, 0], [0.046, 0.012], [0.048, 0.03], [0.048, 0.11], [0.044, 0.125], [0.03, 0.132], [0, 0.133]], 32, true);
  for (const sx of [-1, 1]) {
    const ant = new THREE.Group();
    ant.position.set(sx * 0.09, 0.2, -0.62);
    ant.rotation.set(-0.75, 0, sx * -0.35);
    body.add(ant);
    mesh(new THREE.CylinderGeometry(0.012, 0.016, 0.3, 12), siliconeBk, ant).position.y = 0.15;
    mesh(antHead, tpu, ant).position.y = 0.3;
  }

  // Sombras propias (las piezas transparentes no proyectan)
  root.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });

  return { root, body, props, shadows: true, update(dt, speed = 0) { props.forEach((p) => p.update(dt, speed)); } };
}
