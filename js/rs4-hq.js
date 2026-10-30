// Equipo de tierra de Javi: Sony A7 IV con zoom estándar sobre DJI RS 4 Mini con su trípode
// (fotos en ARCHIVOS/FOTOS/DRONES 8019-8051). Escala real: 1 = 100 mm, +Z = hacia donde mira
// la cámara, +Y = arriba. Estabilizador en plástico gris claro granulado, cámara negra con piel
// granulada en la empuñadura, objetivo con anillos estriados y la óptica completa del Mavic.
// Sin logotipos.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { materials } from './models.js';
import { buildLensHQ, sweep, line, ringsGeometry, superPoint, curve1D } from './mavic-hq.js';
import { grainy, envOnlySpecular, cameraSkin } from './render-hq.js';
import { mesh, lathe } from './fpv5-hq.js';

const TAU = Math.PI * 2;
const V3 = (x, y, z) => new THREE.Vector3(x, y, z);

// Anillo estriado (agarre del zoom y del enfoque): cilindro abierto con relieve en coseno
function ribbedRing(r, h, ribs, depth, seg = 160) {
  const g = new THREE.CylinderGeometry(r, r, h, seg, 1, true);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), a = Math.atan2(z, x);
    const k = 1 + (depth / r) * Math.max(0, Math.cos(a * ribs));
    p.setX(i, x * k); p.setZ(i, z * k);
  }
  g.computeVertexNormals();
  return g;
}

// Loft de secciones superelípticas a lo largo de un eje (como el fuselaje del Mavic).
// axis 'x': secciones en (z, y); axis 'y': secciones en (x, z). f(u) → { w, h, n, c? } (c = desplazamiento)
function loft(axis, a0, a1, f, N = 40, SEG = 48, round = [true, true], rl = 0.08 * Math.abs(a1 - a0)) {
  const rings = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, t = a0 + (a1 - a0) * u;
    // extremos redondeados en una distancia real rl (así dos piezas superpuestas se redondean igual)
    const edge = Math.min(round[0] ? Math.abs(t - a0) : Infinity, round[1] ? Math.abs(a1 - t) : Infinity);
    const e = Math.sqrt(Math.max(0, 1 - Math.pow(1 - Math.min(1, edge / rl), 2)));
    const k = 0.04 + 0.96 * e;   // el remate cierra casi del todo: una tapa plana grande sombreaba como un hueco
    const { w, h, n, c = [0, 0] } = f(u);
    const ring = [];
    for (let j = 0; j < SEG; j++) {
      const [p, q] = superPoint((j / SEG) * TAU, w * k, (h / 2) * k, (h / 2) * k, n);
      ring.push(axis === 'x' ? V3(t, q + c[1], p + c[0]) : V3(p + c[0], t, q + c[1]));
    }
    rings.push(ring);
  }
  return ringsGeometry(rings);
}

export function buildRS4HQ() {
  const M = materials();
  const P = (o) => new THREE.MeshPhysicalMaterial(o);
  // Estabilizador en grafito oscuro: en un color claro cualquier simplificación salta a la vista
  const grey = grainy(P({ color: 0x26272a, roughness: 0.52, metalness: 0.04, clearcoat: 0.12, clearcoatRoughness: 0.45, specularIntensity: 0.8 }), { freq: 700, amp: 0.00016, smudge: 3 });
  const greyDark = grainy(P({ color: 0x17181a, roughness: 0.5, metalness: 0.1, clearcoat: 0.1 }), { freq: 700, amp: 0.00012, smudge: 3 });
  // Cámara: magnesio negro con micro-textura y algo de barniz; piel granulada más mate y con relieve
  // Negro de verdad con el render HQ: base muy oscura y poco reflejo de estudio (si no, el barniz lo vuelve gris azulado)
  const camBody = grainy(P({ color: 0x050506, roughness: 0.34, metalness: 0.02, clearcoat: 0.08, clearcoatRoughness: 0.3, specularIntensity: 0.42, envMapIntensity: 0.45 }), { freq: 1100, amp: 0.0001, smudge: 3 });
  const leather = grainy(P({ color: 0x040405, roughness: 0.9, specularIntensity: 0.35, metalness: 0, sheen: 0.15, sheenRoughness: 0.8, sheenColor: 0x1a1a1d, envMapIntensity: 0.5 }), { freq: 2800, amp: 0.0011, smudge: 6 });
  const rubber = P({ color: 0x040405, roughness: 0.9, specularIntensity: 0.35, metalness: 0, sheen: 0.25, sheenColor: 0x1c1c1f, envMapIntensity: 0.5 });
  const metal = P({ color: 0x141416, metalness: 0.85, roughness: 0.34, envMapIntensity: 0.8 });
  const steel = P({ color: 0xb4b7be, metalness: 1, roughness: 0.25 });
  const red = P({ color: 0xc8261c, roughness: 0.35, metalness: 0.2, emissive: 0x3a0503 });
  const screen = P({ color: 0x0c0d10, roughness: 0.14, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6 });   // pantalla apagada: cristal que refleja el estudio

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);

  /* ---------- Trípode y empuñadura ---------- */
  const hub = mesh(lathe([[0, 0], [0.2, 0], [0.22, 0.05], [0.2, 0.16], [0.17, 0.2], [0, 0.2]], 48), grey, body);
  hub.position.y = 0.92;
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * TAU + Math.PI / 6;
    const foot = V3(Math.sin(a) * 0.9, 0.6, Math.cos(a) * 0.9);   // mini trípode: patas cortas, anchas y casi planas
    mesh(sweep(line(V3(Math.sin(a) * 0.12, 0.98, Math.cos(a) * 0.12), V3(Math.sin(a) * 0.45, 0.78, Math.cos(a) * 0.45), foot), 24, (u) => ({ w: 0.24 - 0.04 * u, h: 0.1 - 0.02 * u, n: 3.4 }), 20), grey, body);
    const pad = mesh(new RoundedBoxGeometry(0.2, 0.06, 0.24, 2, 0.025), rubber, body);
    pad.position.copy(foot).setY(0.6); pad.rotation.y = a;
  }
  // Empuñadura: cuerpo torneado con cintura, pantalla y botones en la cara frontal
  // sección de cuadrado redondeado (cara frontal plana para la pantalla), con cintura para la mano
  const gw = curve1D([0.36, 0.37, 0.34, 0.34, 0.36, 0.38]);
  mesh(loft('y', 1.1, 2.3, (u) => ({ w: gw(u), h: gw(u) * 0.98, n: 3.2 }), 40, 48), grey, body);
  for (const y of [1.16, 1.3]) {   // aros de la tapa inferior de la batería
    const r = mesh(new THREE.TorusGeometry(0.18, 0.006, 6, 48), greyDark, body); r.rotation.x = Math.PI / 2; r.position.y = y;
  }
  const scr = mesh(new RoundedBoxGeometry(0.2, 0.22, 0.02, 3, 0.03), screen, body);
  scr.position.set(0, 1.95, 0.178);
  const rec = mesh(lathe([[0, 0], [0.045, 0], [0.045, 0.012], [0.035, 0.02], [0, 0.02]], 32), red, body);
  rec.rotation.x = Math.PI / 2; rec.position.set(0, 1.62, 0.17);
  const joy = mesh(lathe([[0, 0], [0.04, 0], [0.04, 0.03], [0.03, 0.045], [0, 0.05]], 24), metal, body);
  joy.rotation.x = Math.PI / 2; joy.position.set(0, 1.76, 0.172);
  // Ruedecilla lateral
  const wheel = mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.04, 32), greyDark, body);
  wheel.rotation.z = Math.PI / 2; wheel.position.set(0.185, 1.85, 0.05);

  /* ---------- Ejes como en el RS 4 Mini real ---------- */
  // Giro sobre la empuñadura; alabeo en el cilindro grande bajo y detrás de la cámara; brazo curvo
  // con ranura hasta la placa vertical del lateral, que lleva el disco de inclinación y arriba la
  // caja con el aro rojo.
  const motor = (r, h) => lathe([[0, -h / 2], [r * 0.9, -h / 2], [r, -h / 2 + 0.025], [r, h / 2 - 0.025], [r * 0.9, h / 2], [0, h / 2]], 64);
  // Mordaza de liberación rápida de la empuñadura, con pomo lateral
  mesh(new RoundedBoxGeometry(0.38, 0.12, 0.32, 3, 0.03), greyDark, body).position.set(0, 2.33, 0);
  const knob = mesh(ribbedRing(0.05, 0.06, 18, 0.006, 48), greyDark, body);
  knob.rotation.z = Math.PI / 2; knob.position.set(0.23, 2.33, 0);
  const pan = mesh(motor(0.22, 0.24), grey, body);
  pan.position.y = 2.5;
  mesh(new THREE.TorusGeometry(0.221, 0.004, 6, 64), greyDark, body).rotation.x = Math.PI / 2;
  body.children[body.children.length - 1].position.y = 2.5;
  // Codo del giro al alabeo
  mesh(sweep(line(V3(0, 2.6, -0.02), V3(0, 2.66, -0.18), V3(0, 2.72, -0.3)), 20, () => ({ w: 0.2, h: 0.14, n: 3.4 }), 20), grey, body);
  const roll = mesh(motor(0.25, 0.3), grey, body);
  roll.rotation.x = Math.PI / 2; roll.position.set(0, 2.74, -0.46);
  mesh(new THREE.CircleGeometry(0.19, 48), greyDark, body).position.set(0, 2.74, -0.612);
  body.children[body.children.length - 1].rotation.y = Math.PI;
  // Brazo curvo con ranura, del alabeo al lateral izquierdo de la cámara
  mesh(sweep(line(V3(0.12, 2.74, -0.32), V3(0.55, 2.74, -0.3), V3(0.84, 2.78, -0.12), V3(0.88, 2.86, 0.02)), 40, () => ({ w: 0.18, h: 0.12, n: 3.4 }), 20), grey, body);
  const slot = mesh(new RoundedBoxGeometry(0.34, 0.03, 0.02, 2, 0.01), greyDark, body);
  slot.position.set(0.5, 2.74, -0.36); slot.rotation.y = 0.12;
  // Placa vertical de inclinación, disco del motor y caja superior con el aro rojo
  mesh(new RoundedBoxGeometry(0.09, 1.0, 0.3, 3, 0.03), grey, body).position.set(0.88, 3.28, 0.05);
  const tilt = mesh(motor(0.27, 0.14), grey, body);
  tilt.rotation.z = Math.PI / 2; tilt.position.set(0.99, 3.18, 0.05);
  mesh(new THREE.CircleGeometry(0.2, 48), greyDark, body).position.set(1.061, 3.18, 0.05);
  body.children[body.children.length - 1].rotation.y = Math.PI / 2;
  mesh(new RoundedBoxGeometry(0.16, 0.32, 0.28, 3, 0.04), grey, body).position.set(0.89, 3.92, 0.05);
  const ring = mesh(new THREE.TorusGeometry(0.075, 0.013, 10, 48), red, body);
  ring.rotation.y = Math.PI / 2; ring.position.set(0.972, 3.98, 0.05);
  mesh(new THREE.CircleGeometry(0.062, 32), metal, body).position.set(0.971, 3.98, 0.05);
  body.children[body.children.length - 1].rotation.y = Math.PI / 2;
  // Placa de liberación rápida de la cámara: base oscura y travesaño hasta la placa vertical
  mesh(new RoundedBoxGeometry(0.62, 0.06, 0.66, 2, 0.02), greyDark, body).position.set(0.1, 2.74, 0.08);
  mesh(new RoundedBoxGeometry(0.42, 0.07, 0.2, 2, 0.02), greyDark, body).position.set(0.62, 2.74, 0.05);
  const qrKnob = mesh(ribbedRing(0.045, 0.05, 16, 0.005, 40), metal, body);
  qrKnob.rotation.x = Math.PI / 2; qrKnob.position.set(0.3, 2.72, 0.43);

  // Agarre extensible: barra ancha casi paralela a la empuñadura, algo abierta, con soporte y rosca arriba
  mesh(new RoundedBoxGeometry(0.12, 0.2, 0.18, 2, 0.03), greyDark, body).position.set(-0.22, 1.55, 0.0);
  mesh(sweep(line(V3(-0.3, 1.45, 0.0), V3(-0.4, 1.9, -0.02), V3(-0.48, 2.32, -0.04)), 24, () => ({ w: 0.25, h: 0.22, n: 3.6 }), 28), grey, body);
  const thread = mesh(new THREE.TorusGeometry(0.04, 0.012, 8, 32), steel, body);
  thread.position.set(-0.49, 2.36, -0.04); thread.rotation.set(Math.PI / 2, 0, 0.18);

  /* ---------- Sony A7 IV ---------- */
  // Origen en el centro del cuerpo; la cámara mira a +Z, su derecha (empuñadura) es -X.
  const cam = new THREE.Group();
  cam.position.set(0.1, 3.2, 0.1);
  body.add(cam);
  // Cuerpo: loft de lado a lado, sección casi rectangular de cantos suaves
  // Un solo loft de lado a lado: en la zona de la empuñadura (−X) la sección crece hacia delante y se
  // redondea, sin la arista que dejaba una empuñadura pegada al cuerpo
  const gripK = (u) => 1 - THREE.MathUtils.smoothstep(u, 0.16, 0.4);
  const bodySec = (u) => {
    const g = gripK(u);
    return { w: 0.5 + 0.26 * g, h: 0.8 + 0.05 * g, n: 5 - 2.2 * g, c: [0.13 * g, -0.01 * g] };
  };
  // Piel: banda central de la empuñadura (−X) y frontal izquierdo alrededor de la bayoneta
  const shell = cameraSkin(P({ color: 0x050506, roughness: 0.34, metalness: 0.02, clearcoat: 0.08, clearcoatRoughness: 0.3, specularIntensity: 0.42, envMapIntensity: 0.45 }),
    'smoothstep(-0.2, -0.27, p.x) * smoothstep(0.36, 0.3, abs(p.y + 0.02)) + smoothstep(0.21, 0.25, p.z) * smoothstep(-0.25, -0.2, p.x) * smoothstep(0.46, 0.4, p.x) * smoothstep(0.3, 0.24, p.y + 0.02) * smoothstep(-0.4, -0.34, p.y)');
  mesh(loft('x', -0.655, 0.655, bodySec, 70, 72, [true, true], 0.105), shell, cam);
  // Piel granulada de la empuñadura: la misma superficie, un pelo por fuera, solo en esa zona
  // Empuñadura orgánica: más profunda en el centro, con la piel granulada
  // Joroba del visor: loft redondeado que nace del cuerpo (la mitad inferior queda dentro)
  const shellPlain = cameraSkin(P({ color: 0x050506, roughness: 0.34, metalness: 0.02, clearcoat: 0.08, clearcoatRoughness: 0.3, specularIntensity: 0.42, envMapIntensity: 0.45 }), '0.0');
  const hump = mesh(loft('x', -0.22, 0.34, (u) => ({ w: 0.42 - 0.04 * Math.abs(u - 0.5), h: 0.5, n: 3.4 }), 30, 56, [true, true], 0.09), shellPlain, cam);
  hump.position.set(0, 0.42, -0.03);
  // Zapata: raíl metálico con su tapa
  mesh(new RoundedBoxGeometry(0.2, 0.02, 0.2, 2, 0.006), steel, cam).position.set(0.06, 0.668, -0.03);
  mesh(new RoundedBoxGeometry(0.17, 0.03, 0.17, 2, 0.01), rubber, cam).position.set(0.06, 0.686, -0.03);
  // Frontal en piel granulada alrededor de la bayoneta
  // Diales y botones superiores (lado de la empuñadura)
  const dial = (x, y, z, r, h, ribs) => {
    const d = mesh(ribbedRing(r, h, ribs, r * 0.06, 72), metal, cam); d.position.set(x, y, z);
    const cap = mesh(new THREE.CircleGeometry(r * 0.96, 40), camBody, cam); cap.position.set(x, y + h / 2, z); cap.rotation.x = -Math.PI / 2;
  };
  dial(-0.24, 0.43, -0.02, 0.085, 0.06, 36);      // modo (dos pisos)
  dial(-0.24, 0.48, -0.02, 0.075, 0.045, 36);
  dial(-0.47, 0.43, -0.14, 0.075, 0.06, 30);      // compensación
  dial(-0.5, 0.36, 0.3, 0.06, 0.04, 30);          // dial frontal sobre la empuñadura
  const shutter = mesh(lathe([[0, 0], [0.055, 0], [0.058, 0.02], [0.05, 0.04], [0, 0.045]], 32), steel, cam);
  shutter.position.set(-0.49, 0.43, 0.2);
  const power = mesh(new THREE.TorusGeometry(0.07, 0.014, 8, 40), metal, cam);
  power.rotation.x = Math.PI / 2; power.position.set(-0.49, 0.43, 0.2);
  for (const [x, z] of [[-0.33, 0.12], [-0.37, -0.02]]) {
    const b = mesh(lathe([[0, 0], [0.03, 0], [0.03, 0.02], [0, 0.022]], 20), metal, cam); b.position.set(x, 0.41, z);
  }
  // Detrás: pantalla abatible, ocular de goma, rueda trasera, botonera y joystick
  const lcd = mesh(new RoundedBoxGeometry(0.76, 0.52, 0.05, 3, 0.04), camBody, cam);
  lcd.position.set(0.08, -0.07, -0.285);
  const glass = mesh(new RoundedBoxGeometry(0.68, 0.45, 0.006, 2, 0.02), screen, cam);
  glass.position.set(0.08, -0.07, -0.312);
  const eye = mesh(new RoundedBoxGeometry(0.3, 0.22, 0.14, 4, 0.07), rubber, cam);
  eye.position.set(0.06, 0.5, -0.3);
  const ocular = mesh(new RoundedBoxGeometry(0.2, 0.12, 0.01, 2, 0.04), screen, cam);
  ocular.position.set(0.06, 0.5, -0.372);
  const wheelR = mesh(ribbedRing(0.085, 0.03, 36, 0.005, 60), metal, cam);
  wheelR.rotation.x = Math.PI / 2; wheelR.position.set(-0.47, -0.12, -0.275);
  for (const [x, y] of [[-0.42, 0.22], [-0.52, 0.22], [-0.47, 0.06], [-0.47, -0.3], [-0.38, -0.3], [-0.56, -0.3]]) {
    const b = mesh(lathe([[0, 0], [0.026, 0], [0.026, 0.014], [0, 0.016]], 16), metal, cam);
    b.rotation.x = -Math.PI / 2; b.position.set(x, y, -0.27);
  }
  // Orejetas de la correa y tapas de conectores
  for (const sx of [-1, 1]) {
    const lug = mesh(new THREE.TorusGeometry(0.035, 0.01, 8, 24), steel, cam);
    lug.rotation.y = Math.PI / 2; lug.position.set(sx * 0.66, 0.3, 0.05);
  }
  for (let i = 0; i < 3; i++) mesh(new RoundedBoxGeometry(0.012, 0.16, 0.2, 2, 0.02), rubber, cam).position.set(0.66, 0.12 - i * 0.2, 0.0);
  // Bayoneta: aro metálico y botón de desbloqueo
  const lensG = new THREE.Group();
  lensG.position.set(0.1, -0.06, 0.255);
  lensG.rotation.x = Math.PI / 2;   // el eje del torneado (Y) pasa a +Z
  cam.add(lensG);
  mesh(lathe([[0.27, -0.005], [0.31, -0.005], [0.315, 0.012], [0.3, 0.025], [0.27, 0.025]], 96), steel, lensG);
  const release = mesh(lathe([[0, 0], [0.04, 0], [0.04, 0.02], [0.03, 0.03], [0, 0.03]], 24), metal, cam);
  release.rotation.x = Math.PI / 2; release.position.set(0.47, -0.2, 0.255);

  /* ---------- Objetivo zoom 24-70 f/2.8 ---------- */
  // Perfil real: base estrecha, anillo de zoom ancho, panel de interruptores, anillo de enfoque y
  // frontal que se abre hasta la rosca del filtro
  mesh(lathe([[0.3, 0.025], [0.36, 0.035], [0.4, 0.07], [0.405, 0.16], [0.41, 0.17], [0.41, 0.53], [0.415, 0.54], [0.415, 0.63],
    [0.42, 0.64], [0.42, 0.81], [0.43, 0.83], [0.452, 0.86], [0.452, 1.16], [0.448, 1.19], [0.43, 1.205], [0.395, 1.21]], 128), camBody, lensG);
  const zoom = mesh(ribbedRing(0.418, 0.34, 80, 0.012, 160), rubber, lensG); zoom.position.y = 0.35;
  const focus = mesh(ribbedRing(0.428, 0.16, 140, 0.008, 160), rubber, lensG); focus.position.y = 0.725;
  // Interruptores y botón de bloqueo del enfoque en el lateral
  const sw = new THREE.Group(); sw.position.set(-0.41, 0.585, 0); sw.rotation.z = Math.PI / 2; lensG.add(sw);
  mesh(new RoundedBoxGeometry(0.06, 0.012, 0.14, 2, 0.006), metal, sw);
  const hold = mesh(lathe([[0, 0], [0.025, 0], [0.025, 0.014], [0, 0.016]], 16), metal, lensG);
  hold.rotation.z = Math.PI / 2; hold.position.set(-0.415, 0.585, 0.16);
  // Línea fina del índice y aro de la rosca del filtro
  mesh(new THREE.TorusGeometry(0.4535, 0.003, 6, 120), metal, lensG).position.y = 1.16;
  lensG.children[lensG.children.length - 1].rotation.x = Math.PI / 2;
  const opt = buildLensHQ(M, { r: 0.132, d: 0.2 });
  opt.setAperture(2);   // abierto del todo: desde fuera se ve cristal y reflejos, no las láminas
  opt.group.scale.setScalar(0.38 / 0.132);
  opt.group.rotation.x = -Math.PI / 2;   // vuelve a mirar a +Z dentro del grupo girado
  opt.group.position.y = 1.165;
  lensG.add(opt.group);

  root.traverse((o) => { if (o.isMesh && !o.material.transparent) { o.castShadow = true; o.receiveShadow = true; } });
  // Curva de tono propia: la cámara es negra y AgX la levantaba a gris azulado
  return { root, body, props: [], shadows: true, tone: { mapping: THREE.ACESFilmicToneMapping, exposure: 1.15 }, update() {} };
}
