// JAVI — coreografía de scroll, vídeo y controles.

import { sourceFor, clipSource, encodedSource as encodedReel, upgradePictures } from './media.js';

// Se resuelve al arrancar la entrada de la portada (ver runIntro): da paso a la descarga del reel
let startReel;
const introStarted = new Promise((r) => { startReel = r; });

const gsap = window.gsap;
const ScrollTrigger = window.ScrollTrigger;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const saveData = navigator.connection?.saveData === true;
const dpr = Math.min(window.devicePixelRatio || 1, 2);

if (gsap && ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
if (!location.hash) window.scrollTo(0, 0);

// En la primera visita `load` puede llegar segundos tarde: si el visitante ya ha bajado,
// no hay que devolverlo al reel.
let userScrolled = false;
const markScrolled = () => { userScrolled = true; };
['wheel', 'touchmove', 'keydown', 'pointerdown'].forEach((t) =>
  window.addEventListener(t, markScrolled, { once: true, passive: true }));

/* ---------------------------------------------------------------- */
/* Scroll suave                                                      */
/* ---------------------------------------------------------------- */

let lenis = null;
if (!reduced && window.Lenis && gsap) {
  lenis = new window.Lenis({ lerp: 0.085, wheelMultiplier: 1, smoothWheel: true });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}

// La sección de fotografía fija su altura por JS; si Lenis se queda con la altura antigua,
// el scroll se detiene o corre sobre un hueco negro. Se re-mide en cada recálculo.
if (lenis && ScrollTrigger) ScrollTrigger.addEventListener('refresh', () => lenis.resize());
if (ScrollTrigger && 'ResizeObserver' in window) {
  let lastH = 0;
  let t = null;
  new ResizeObserver(() => {
    const h = document.documentElement.scrollHeight;
    if (Math.abs(h - lastH) < 4) return;
    lastH = h;
    clearTimeout(t);
    t = setTimeout(() => ScrollTrigger.refresh(), 200);
  }).observe(document.body);
}

function scrollToTarget(target) {
  if (lenis) lenis.scrollTo(target, { duration: 1.6, easing: (t) => 1 - Math.pow(1 - t, 4) });
  else target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth' });
}

$$('a[href^="#"]').forEach((a) => {
  a.addEventListener('click', (e) => {
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    const el = id === '#top' ? document.body : $(id);
    if (!el) return;
    e.preventDefault();
    scrollToTarget(id === '#top' ? 0 : el);
  });
});

/* ---------------------------------------------------------------- */
/* Vídeo: códec y resolución justos, carga al acercarse,             */
/* pausa fuera de vista y liberación de memoria lejos de pantalla     */
/* ---------------------------------------------------------------- */

upgradePictures();

const videos = $$('video.media');
const inView = new Set();

async function ensureSource(v) {
  if (v.src || v.dataset.resolving) return;
  v.dataset.resolving = '1';
  try {
    const src = await sourceFor(v);
    if (src && !v.src) { v.src = src; v.preload = 'auto'; }
  } finally {
    delete v.dataset.resolving;
  }
  if (inView.has(v) && !reduced && !document.hidden) v.play().catch(() => {});
}

// Reproducir y, si el navegador soltó el decodificador (pestaña oculta, memoria),
// recargar la fuente en el mismo punto: así nunca se queda en negro.
function resume(v) {
  if (reduced || document.hidden || !v.src) return;
  // (si aún está descargando, se espera: recargar solo reiniciaría la descarga)
  if (v.error || (v.readyState < 2 && v.networkState !== HTMLMediaElement.NETWORK_LOADING)) {
    const t = v.currentTime;
    v.load();
    if (t) v.addEventListener('loadedmetadata', () => { v.currentTime = t; }, { once: true });
  }
  v.play().catch(() => {});
}

// Si un códec falla al decodificar, pasar a H.264 (lo reproduce cualquier navegador);
// si ya era H.264, un reintento.
videos.forEach((v) => v.addEventListener('error', () => {
  const src = v.getAttribute('src');
  if (!src || v.dataset.retried) return;
  v.dataset.retried = '1';
  const fallback = src.replace(/\.(av1|hevc)\.mp4$/, '.h264.mp4');
  v.src = fallback;
  if (inView.has(v)) resume(v);
}));

// Vigilante: un vídeo visible que lleva 3 s sin avanzar se reactiva o se recarga.
const lastTime = new WeakMap();
setInterval(() => {
  if (document.hidden || reduced) return;
  inView.forEach((v) => {
    if (!v.src) return;
    const prev = lastTime.get(v);
    lastTime.set(v, v.currentTime);
    if (prev === undefined || v.currentTime !== prev) return;
    if (v.paused) v.play().catch(() => {});
    else resume(v);
  });
}, 3000);

// Cerca de pantalla: preparar la fuente
const nearIO = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) ensureSource(e.target);
}, { rootMargin: '120% 0px' });

// En pantalla: reproducir; fuera: pausar
const playIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const v = e.target;
    if (e.isIntersecting) {
      inView.add(v);
      if (reduced) continue;
      if (!v.src) ensureSource(v);
      else resume(v);
    } else {
      inView.delete(v);
      v.pause();
    }
  }
}, { threshold: 0.18 });

// Muy lejos (más de tres pantallas): soltar el vídeo para liberar memoria y decodificador
const farIO = new IntersectionObserver((entries) => {
  for (const e of entries) {
    const v = e.target;
    if (!e.isIntersecting && v.src) {
      v.pause();
      v.removeAttribute('src');
      v.load();
      delete v.dataset.retried;
    }
  }
}, { rootMargin: '300% 0px' });

videos.forEach((v) => {
  v.muted = true;
  nearIO.observe(v);
  playIO.observe(v);
  farIO.observe(v);
});

// Pestaña oculta: nada se reproduce
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    videos.forEach((v) => v.pause());
    hero.pauseForHidden?.();
  } else {
    inView.forEach(resume);
    hero.resumeFromHidden?.();
  }
});

// Volver con el botón atrás (caché de página): reanudar igual que al volver a la pestaña
window.addEventListener('pageshow', (e) => { if (e.persisted) inView.forEach(resume); });

/* ---------------------------------------------------------------- */
/* Hero: montaje con cortes (o el reel de Javi en un solo archivo)   */
/* ---------------------------------------------------------------- */

const reelEl = $('[data-reel]');
const hero = {
  clips: [],
  layers: [],
  index: 0,
  cut: 4.2,
  started: performance.now(),
  playing: true,
  timer: null,
};

function initReel() {
  if (!reelEl) return;
  try { hero.clips = JSON.parse(reelEl.dataset.clips || '[]'); } catch { hero.clips = []; }
  // En vertical, los clips oscuros (desktopOnly) se quedan en negro al recortarse: se omiten
  if (window.matchMedia('(max-aspect-ratio: 1/1)').matches) {
    const bright = hero.clips.filter((c) => !c.desktopOnly);
    if (bright.length) hero.clips = bright;
  }
  hero.cut = parseFloat(reelEl.dataset.cut || '4.2');

  const poster = new Image();
  poster.className = 'hero__poster';
  poster.alt = '';
  poster.decoding = 'async';
  poster.fetchPriority = 'high';
  poster.src = reelEl.dataset.poster;
  reelEl.appendChild(poster);

  for (let i = 0; i < 2; i++) {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto';
    v.crossOrigin = 'anonymous';   // los vídeos se sirven desde R2 (otro origen): sin CORS el fundido de sonido (Web Audio) quedaría en silencio
    v.setAttribute('playsinline', '');
    v.setAttribute('aria-hidden', 'true');
    reelEl.appendChild(v);
    hero.layers.push(v);
  }
  // Las URL se resuelven una vez (códec y resolución para la pantalla actual)
  const urls = [];
  const src = (i) => urls[i % urls.length];
  const single = hero.clips.length === 1;
  // El reel no empieza a descargarse hasta que arranca la entrada: en conexiones lentas sus MB
  // competían con fuentes y scripts y el texto de portada tardaba en pintarse (se ve el póster)
  Promise.all([...hero.clips.map((c) => clipSource(c, window)), introStarted]).then((list) => {
    urls.push(...list.slice(0, hero.clips.length));
    hero.layers[0].src = src(0);
    if (single) hero.layers[0].loop = true;
    else hero.layers[1].src = src(1);
  });

  const show = (v) => {
    hero.layers.forEach((l) => l.classList.toggle('is-on', l === v));
    // reiniciar el empuje lento en cada corte
    v.style.animation = 'none'; void v.offsetWidth; v.style.animation = '';
  };

  // Showreel con audio: botón para activar y quitar el sonido (los navegadores solo
  // permiten arrancar en silencio; el sonido se activa con el gesto del visitante)
  const sound = $('[data-sound]');
  if (sound && single && hero.clips[0].audio) {
    const label = $('[data-sound-label]', sound);
    sound.hidden = false;
    sound.addEventListener('click', () => {
      const on = sound.getAttribute('aria-pressed') !== 'true';
      hero.layers.forEach((l) => { l.muted = !on; });
      sound.setAttribute('aria-pressed', String(on));
      sound.setAttribute('aria-label', on ? 'Silenciar el showreel' : 'Activar el sonido del showreel');
      label.textContent = on ? 'Silenciar' : 'Sonido';
      if (on && hero.layers[0].paused && !reduced) hero.layers[0].play().catch(() => {});
      if (on) connectFade();
    });

    // El sonido se apaga con el scroll desde que el reel empieza a irse (v: 1 → 0 mientras el telón
    // negro lo tapa). Curva en decibelios, que es como oye el oído: una pendiente suave desde el primer
    // píxel (se nota que se aleja) que a mitad de salida solo ha bajado ~3,5 dB (se sigue oyendo bien);
    // después cae con suavidad hasta un hilo (−28 dB) cuando el reel desaparece.
    // Con Web Audio (GainNode) para que también funcione en iPhone, donde el volumen
    // del vídeo no se puede cambiar.
    let gain = null, actx = null;
    const statement = $('.statement');
    const visible = () => {
      if (!statement) return 1;
      return Math.min(1, Math.max(0, statement.getBoundingClientRect().top / window.innerHeight));
    };
    const level = () => {
      const d = 1 - visible();
      return Math.pow(10, (-4 * d - 24 * Math.pow(d, 4)) / 20);
    };
    const applyLevel = () => {
      const g = level();
      if (gain) gain.gain.setTargetAtTime(g, actx.currentTime, 0.06);
      else hero.layers[0].volume = g;
    };
    function connectFade() {
      if (!gain) {
        try {
          actx = new (window.AudioContext || window.webkitAudioContext)();
          gain = actx.createGain();
          actx.createMediaElementSource(hero.layers[0]).connect(gain).connect(actx.destination);
        } catch { gain = null; }
      }
      actx?.resume?.();
      applyLevel();
    }
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking || sound.getAttribute('aria-pressed') !== 'true') return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; applyLevel(); });
    }, { passive: true });
  }

  const first = hero.layers[0];
  const begin = () => {
    if (reduced) return;
    first.play().then(() => { show(first); poster.style.opacity = '0'; }).catch(() => {});
    if (!single) schedule();
  };
  first.addEventListener('canplay', begin, { once: true });

  function schedule() {
    clearTimeout(hero.timer);
    hero.timer = setTimeout(cutNext, hero.cut * 1000);
  }
  function cutNext() {
    if (!hero.playing) return;
    const cur = hero.layers[hero.index % 2];
    const next = hero.layers[(hero.index + 1) % 2];
    next.currentTime = 0;
    next.play().then(() => {
      show(next);
      hero.index++;
      setTimeout(() => {
        cur.pause();
        cur.src = src(hero.index + 1);
        cur.load();
      }, 600);
      schedule();
    }).catch(schedule);
  }

  hero.pause = () => { hero.playing = false; clearTimeout(hero.timer); hero.layers.forEach((l) => l.pause()); };
  let hiddenPaused = false;
  hero.pauseForHidden = () => { if (hero.playing) { hero.pause(); hiddenPaused = true; } };
  hero.resumeFromHidden = () => { if (hiddenPaused) { hiddenPaused = false; hero.resume(); } };
  hero.resume = () => {
    if (hero.playing || reduced) return;
    hero.playing = true;
    const cur = hero.layers[hero.index % 2];
    cur.play().catch(() => {});
    if (!single) schedule();
  };
}
initReel();

// Código de tiempo del reel (25 fps). Con el showreel sigue el tiempo del propio
// vídeo: arranca con él y vuelve a cero en cada vuelta del bucle.
const tc = $('[data-timecode]');
const soundProgress = $('[data-sound-progress]');
function tick() {
  const reel = hero.clips.length === 1 ? hero.layers[0] : null;
  if (reel && soundProgress && reel.duration) {
    soundProgress.style.strokeDashoffset = (1 - reel.currentTime / reel.duration).toFixed(4);
  }
  if (tc && (reel || hero.playing)) {
    const s = reel ? reel.currentTime : (performance.now() - hero.started) / 1000;
    const f = Math.floor((s % 1) * 25);
    const pad = (n) => String(n).padStart(2, '0');
    tc.textContent = `${pad(Math.floor(s / 3600))}:${pad(Math.floor(s / 60) % 60)}:${pad(Math.floor(s) % 60)}:${pad(f)}`;
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

/* ---------------------------------------------------------------- */
/* Entrada                                                           */
/* ---------------------------------------------------------------- */

function intro() {
  document.body.classList.remove('is-loading');
  if (!gsap || reduced) return;
  const tl = gsap.timeline({ defaults: { ease: 'expo.out' } });
  tl.fromTo('.hero__phrase',
    { y: 16, opacity: 0, filter: 'blur(10px)' },
    { y: 0, opacity: 1, filter: 'blur(0px)', duration: 1.6 }, 0.5)
    .fromTo('.hero__meta', { opacity: 0 }, { opacity: 1, duration: 1.2 }, 0.8)
    .fromTo('.nav', { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2 }, 0.4);
}
let introDone = false;
const runIntro = () => { if (!introDone) { introDone = true; intro(); setTimeout(startReel, 150); } };
document.fonts?.ready.then(() => setTimeout(runIntro, 120));
setTimeout(runIntro, 1400);

/* ---------------------------------------------------------------- */
/* Palabras que se enfocan (blur reveal)                              */
/* ---------------------------------------------------------------- */

function splitWords(el) {
  const out = [];
  const walk = (node, parent) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 3) {
        const parts = child.textContent.split(/(\s+)/);
        const frag = document.createDocumentFragment();
        for (const part of parts) {
          if (!part) continue;
          if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(' ')); continue; }
          const s = document.createElement('span');
          s.className = 'w';
          s.textContent = part;
          frag.appendChild(s);
          out.push(s);
        }
        parent.replaceChild(frag, child);
      } else if (child.nodeType === 1) {
        walk(child, child);
      }
    }
  };
  walk(el, el);
  return out;
}

/* ---------------------------------------------------------------- */
/* Coreografía de scroll                                              */
/* ---------------------------------------------------------------- */

function choreography() {
  if (!gsap || !ScrollTrigger || reduced) return;

  // HERO: el telón negro sube; el reel se queda detrás, se encoge y se apaga.
  gsap.fromTo('[data-hero-stage]', { scale: 1, filter: 'brightness(1)' }, {
    scale: 0.9, filter: 'brightness(0.3)', ease: 'none',
    scrollTrigger: { trigger: '.statement', start: 'top bottom', end: 'top top', scrub: true },
  });
  gsap.fromTo('[data-hero-content]', { yPercent: 0, opacity: 1, filter: 'blur(0px)' }, {
    yPercent: -30, opacity: 0, filter: 'blur(10px)', ease: 'none',
    scrollTrigger: { trigger: '.statement', start: 'top bottom', end: 'top 35%', scrub: true },
  });
  ScrollTrigger.create({
    trigger: '.statement', start: 'top top',
    onEnter: () => hero.pause?.(),
    onLeaveBack: () => hero.resume?.(),
  });

  // Textos que se enfocan palabra a palabra
  $$('[data-blur-words]').forEach((el) => {
    const words = splitWords(el);
    // Un titular sticky medido mientras está pegado da posiciones falsas: se mide su contenedor
    const trigger = getComputedStyle(el).position === 'sticky' ? el.parentElement : el;
    gsap.fromTo(words,
      { opacity: 0.1, filter: 'blur(12px)', y: 10 },
      {
        opacity: 1, filter: 'blur(0px)', y: 0, ease: 'none', stagger: 0.06,
        scrollTrigger: { trigger, start: 'top 96%', end: 'top 62%', scrub: true },
      });
  });

  // Tarjetas que suben a velocidades distintas y se quedan a media pantalla
  $$('[data-rise]').forEach((el) => {
    const k = parseFloat(el.dataset.rise || '1');
    gsap.fromTo(el, { y: 160 * k }, {
      y: -30 * k, ease: 'none',
      scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom 30%', scrub: true },
    });
  });

  const wide = $('[data-wide]');
  if (wide) {
    gsap.fromTo(wide, { clipPath: 'inset(12% 8% 12% 8% round 28px)' }, {
      clipPath: 'inset(0% 0% 0% 0% round 28px)', ease: 'none',
      scrollTrigger: { trigger: wide, start: 'top bottom', end: 'center center', scrub: true },
    });
    gsap.fromTo($('.wide__media', wide), { yPercent: -6 }, {
      yPercent: 6, ease: 'none',
      scrollTrigger: { trigger: wide, start: 'top bottom', end: 'bottom top', scrub: true },
    });
  }

  // Paneles de sector: se abren desde un marco y se apilan como cortes de montaje.
  // Los disparadores usan marcadores en flujo normal: medir un elemento sticky
  // mientras está pegado da posiciones falsas al refrescar.
  const panels = $$('[data-panel]');
  const marks = panels.map((panel) => {
    const m = document.createElement('div');
    m.className = 'panel-mark';
    m.setAttribute('aria-hidden', 'true');
    panel.before(m);
    return m;
  });
  panels.forEach((panel, i) => {
    const frame = $('.panel__frame', panel);
    const body = $('.panel__body', panel);
    const spec = $('.panel__spec', panel);
    gsap.fromTo(frame,
      { clipPath: 'inset(9% 6% 9% 6% round 28px)' },
      {
        clipPath: 'inset(0% 0% 0% 0% round 0px)', ease: 'none',
        scrollTrigger: { trigger: marks[i], start: 'top bottom', end: 'top top', scrub: true },
      });
    gsap.fromTo([body, spec], { y: 60, opacity: 0, filter: 'blur(10px)' }, {
      y: 0, opacity: 1, filter: 'blur(0px)', ease: 'none',
      scrollTrigger: { trigger: marks[i], start: 'top 55%', end: 'top 5%', scrub: true },
    });
    const next = marks[i + 1];
    if (next) {
      gsap.fromTo(frame, { scale: 1, filter: 'brightness(1)' }, {
        scale: 0.92, filter: 'brightness(0.35)', ease: 'none',
        scrollTrigger: { trigger: next, start: 'top bottom', end: 'top top', scrub: true },
      });
    }
  });

  // Fotografía: mesa de luz horizontal
  const photo = $('[data-photo]');
  const track = $('[data-photo-track]');
  if (photo && track) {
    // La carga diferida del navegador mide en vertical; en una pista horizontal
    // las últimas fotos llegaban sin descargar. Se cargan todas al acercarse.
    const preload = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      preload.disconnect();
      $$('img', track).forEach((img) => { img.loading = 'eager'; img.decode?.().catch(() => {}); });
    }, { rootMargin: '150% 0px' });
    preload.observe(photo);
    // Largo real de la pista: hasta el borde de la última tarjeta. No se usa scrollWidth porque
    // Safari calcula el ancho max-content con el tamaño original de las fotos (no con aspect-ratio)
    // y la pista parecía mucho más larga: el scroll seguía sobre negro tras la última foto.
    const trackLength = () => {
      const last = track.lastElementChild;
      if (!last) return 0;
      const padR = parseFloat(getComputedStyle(track).paddingRight) || 0;
      return last.getBoundingClientRect().right - track.getBoundingClientRect().left + padR;
    };
    const distance = () => Math.max(0, trackLength() - window.innerWidth);
    const setHeight = () => { photo.style.height = `${distance() + window.innerHeight * 1.15}px`; };
    setHeight();
    ScrollTrigger.addEventListener('refreshInit', setHeight);
    // Si cambia el largo real de la pista (fotos que terminan de cargar, fuentes, ventana), recalcular
    let lastW = trackLength();
    let refreshTimer = null;
    const recheck = () => {
      const w = trackLength();
      if (Math.abs(w - lastW) < 2) return;
      lastW = w;
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(() => ScrollTrigger.refresh(), 150);
    };
    const ro = new ResizeObserver(recheck);
    [...track.children].forEach((c) => ro.observe(c));
    $$('img', track).forEach((img) => { if (!img.complete) img.addEventListener('load', recheck, { once: true }); });
    const tween = gsap.to(track, {
      x: () => -distance(), ease: 'none',
      scrollTrigger: {
        trigger: photo, start: 'top top', end: 'bottom bottom', scrub: true, invalidateOnRefresh: true,
        onUpdate: (self) => gsap.set('[data-photo-progress]', { scaleX: self.progress }),
      },
    });
    $$('.shot img', track).forEach((img) => {
      gsap.fromTo(img, { xPercent: -5, scale: 1.12 }, {
        xPercent: 5, scale: 1.12, ease: 'none',
        scrollTrigger: { trigger: img.closest('.shot'), containerAnimation: tween, start: 'left right', end: 'right left', scrub: true },
      });
    });
  }

  // Ficha: aparición escalonada de las piezas del bento
  gsap.fromTo('.bento .tile', { y: 50, opacity: 0 }, {
    y: 0, opacity: 1, duration: 1.2, ease: 'expo.out', stagger: 0.08,
    scrollTrigger: { trigger: '.bento', start: 'top 80%' },
  });

  // Contacto: la foto de fondo se desplaza despacio con el scroll
  const contactPhoto = $('[data-contact-photo]');
  if (contactPhoto) {
    gsap.fromTo(contactPhoto, { yPercent: -5 }, {
      yPercent: 5, ease: 'none',
      scrollTrigger: { trigger: '.contact', start: 'top bottom', end: 'bottom top', scrub: true },
    });
  }

  // Apariciones discretas
  $$('[data-reveal]').forEach((el) => {
    gsap.fromTo(el, { y: 40, opacity: 0, filter: 'blur(8px)' }, {
      y: 0, opacity: 1, filter: 'blur(0px)', duration: 1.2, ease: 'expo.out',
      scrollTrigger: { trigger: el, start: 'top 88%', toggleActions: 'play none none reverse' },
    });
  });

  // Marcas: aparición escalonada y corta
  gsap.fromTo('.brands__item', { y: 16, opacity: 0 }, {
    y: 0, opacity: 1, duration: 0.8, ease: 'expo.out', stagger: 0.05,
    scrollTrigger: { trigger: '.brands__grid', start: 'top 95%' },
  });

}

/* ---------------------------------------------------------------- */
/* Navegación                                                         */
/* ---------------------------------------------------------------- */

function initNav() {
  const nav = $('[data-nav]');
  let lastY = 0;
  const onScroll = (y) => {
    nav.classList.toggle('is-solid', y > window.innerHeight * 0.85);
    const down = y > lastY;
    nav.classList.toggle('is-hidden', down && y > window.innerHeight * 1.2 && !nav.matches(':focus-within'));
    lastY = y;
  };
  if (lenis) lenis.on('scroll', ({ scroll }) => onScroll(scroll));
  else window.addEventListener('scroll', () => onScroll(window.scrollY), { passive: true });

  const links = $$('.nav__links a');
  if (ScrollTrigger) {
    links.forEach((a) => {
      const sec = $(a.getAttribute('href'));
      if (!sec) return;
      // «Flota» abarca el 3D del dron y la flota (data-until): sigue activo en las dos secciones
      const until = a.dataset.until ? $(a.dataset.until) : null;
      ScrollTrigger.create({
        trigger: sec, start: 'top 50%', end: 'bottom 50%', endTrigger: until || sec,
        onToggle: (self) => a.classList.toggle('is-active', self.isActive),
      });
    });
  }
}

/* ---------------------------------------------------------------- */
/* 3D: carga diferida                                                 */
/* ---------------------------------------------------------------- */

function lazy(el, margin, fn) {
  if (!el) return;
  const io = new IntersectionObserver(([e]) => {
    if (e.isIntersecting) { io.disconnect(); fn(); }
  }, { rootMargin: margin });
  io.observe(el);
}

// Los módulos del 3D (Three.js con sus efectos y el modelo) se descargan y evalúan en un momento
// libre tras la carga, no al llegar a la sección: así no se suman a su preparación
if ($('[data-optic]')) {
  const prefetch = () => import('./optic.js').catch(() => {});
  if ('requestIdleCallback' in window) addEventListener('load', () => requestIdleCallback(prefetch, { timeout: 4000 }), { once: true });
  else addEventListener('load', () => setTimeout(prefetch, 2000), { once: true });
}

lazy($('[data-optic]'), '250% 0px', async () => {
  try {
    const { initOptic } = await import('./optic.js');
    await initOptic($('[data-optic]'), { reduced });
    ScrollTrigger?.refresh();
  } catch (err) {
    console.error(err);
    const fb = $('[data-optic-fallback]');
    if (fb) fb.hidden = false;
  }
});

// Dial del gimbal
lazy($('.tile--gimbal'), '-20% 0px', () => $('.tile--gimbal').classList.add('is-in'));

lazy($('#flota'), '100% 0px', async () => {
  try {
    const { initFleet } = await import('./fleet.js');
    await initFleet($$('[data-craft]'), { reduced });
  } catch (err) {
    console.error(err);
  }
});


/* ---------------------------------------------------------------- */
/* Reel con sonido                                                    */
/* ---------------------------------------------------------------- */

function initTheater() {
  const th = $('[data-theater]');
  if (!th || !$('[data-theater-open]')) return;
  const video = $('[data-theater-video]');
  const bar = $('[data-theater-bar]');
  const prog = $('[data-theater-progress]');
  const time = $('[data-theater-time]');
  let lastFocus = null;
  let idleTimer = null;

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const wake = () => {
    th.classList.remove('is-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { if (!video.paused) th.classList.add('is-idle'); }, 2600);
  };

  const open = () => {
    lastFocus = document.activeElement;
    const btn = $('[data-theater-open]');
    // El reel con sonido: data-theater-src en el botón; si no existe, el primer clip del hero.
    const setSrc = (src) => { if (src && video.getAttribute('src') !== src) video.src = src; };
    if (btn.dataset.theaterVideo) {
      const heights = (btn.dataset.theaterHeights || '2160 1440 1080').split(/[\s,]+/).map(Number);
      encodedReel(btn.dataset.theaterVideo, heights).then(setSrc);
    } else {
      setSrc(btn.dataset.theaterSrc || '');
      if (!btn.dataset.theaterSrc && hero.clips[0]) clipSource(hero.clips[0], window).then(setSrc);
    }
    th.hidden = false;
    requestAnimationFrame(() => th.classList.add('is-open'));
    hero.pause?.();
    lenis?.stop();
    video.muted = false;
    video.currentTime = 0;
    video.play().catch(() => { video.muted = true; video.play(); });
    th.classList.toggle('is-muted', video.muted);
    $('[data-theater-close]').focus();
    wake();
  };
  const close = () => {
    th.classList.remove('is-open');
    video.pause();
    lenis?.start();
    setTimeout(() => { th.hidden = true; }, 200);
    if (window.scrollY < window.innerHeight * 0.5) hero.resume?.();
    lastFocus?.focus();
  };

  $('[data-theater-open]').addEventListener('click', open);
  $('[data-theater-close]').addEventListener('click', close);
  $('[data-theater-toggle]').addEventListener('click', () => (video.paused ? video.play() : video.pause()));
  $('[data-theater-mute]').addEventListener('click', () => {
    video.muted = !video.muted;
    th.classList.toggle('is-muted', video.muted);
  });
  video.addEventListener('click', () => (video.paused ? video.play() : video.pause()));
  video.addEventListener('play', () => th.classList.remove('is-paused'));
  video.addEventListener('pause', () => { th.classList.add('is-paused'); wake(); });
  video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    prog.style.transform = `scaleX(${video.currentTime / video.duration})`;
    time.textContent = fmt(video.currentTime);
  });
  bar.addEventListener('click', (e) => {
    const r = bar.getBoundingClientRect();
    if (video.duration) video.currentTime = ((e.clientX - r.left) / r.width) * video.duration;
  });
  th.addEventListener('pointermove', wake);
  document.addEventListener('keydown', (e) => {
    if (th.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === ' ') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
  });
}

/* ---------------------------------------------------------------- */
/* Visor de fotos                                                     */
/* ---------------------------------------------------------------- */

function initLightbox() {
  const lb = $('[data-lightbox]');
  const frame = $('[data-lightbox-frame]');
  const cap = $('[data-lightbox-cap]');
  const shots = $$('[data-shot]');
  let idx = 0;
  let lastFocus = null;
  const img = document.createElement('img');
  img.decoding = 'async';
  img.alt = '';   // se rellena con el texto alternativo de la foto al abrirla
  frame.appendChild(img);

  const show = (i) => {
    idx = (i + shots.length) % shots.length;
    const s = shots[idx];
    const src = $('img', s);
    img.classList.add('is-loading');
    img.onload = () => img.classList.remove('is-loading');
    img.src = src.dataset.full || src.src;
    img.alt = src.alt;
    cap.textContent = [...$$('figcaption > span', s)].map((x) => x.textContent).join('  ·  ');
  };
  const open = (i) => {
    lastFocus = document.activeElement;
    show(i);
    lb.hidden = false;
    requestAnimationFrame(() => lb.classList.add('is-open'));
    lenis?.stop();
    $('[data-lb-close]').focus();
  };
  const close = () => {
    lb.classList.remove('is-open');
    lenis?.start();
    setTimeout(() => { lb.hidden = true; }, 200);
    lastFocus?.focus();
  };
  shots.forEach((s, i) => $('.shot__btn', s).addEventListener('click', () => open(i)));
  $('[data-lb-close]').addEventListener('click', close);
  $('[data-lb-prev]').addEventListener('click', () => show(idx - 1));
  $('[data-lb-next]').addEventListener('click', () => show(idx + 1));
  lb.addEventListener('click', (e) => { if (e.target === lb || e.target === frame) close(); });
  document.addEventListener('keydown', (e) => {
    if (lb.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(idx - 1);
    if (e.key === 'ArrowRight') show(idx + 1);
  });
}

/* ---------------------------------------------------------------- */
/* Titulación: un diafragma que se abre desde el botón                */
/* ---------------------------------------------------------------- */

function initCreds() {
  const dlg = $('[data-creds]');
  const btn = $('[data-creds-open]');
  if (!dlg || !btn) return;
  const scroller = $('.creds__scroll', dlg);
  const items = $$('.creds__head, .creds__gtitle, .creds__doc, .creds__org, .creds__seal', dlg);
  let tl = null;

  const radius = (x, y) => Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)) + 2;
  const open = () => {
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    dlg.style.setProperty('--cx', `${x}px`);
    dlg.style.setProperty('--cy', `${y}px`);
    dlg.hidden = false;
    scroller.scrollTop = 0;
    lenis?.stop();
    tl?.kill();
    if (!gsap || reduced) { dlg.style.clipPath = 'none'; $('[data-creds-close]').focus(); return; }
    tl = gsap.timeline();
    tl.fromTo(dlg, { clipPath: `circle(0px at ${x}px ${y}px)` },
      { clipPath: `circle(${radius(x, y)}px at ${x}px ${y}px)`, duration: 1.1, ease: 'expo.inOut' })
      .fromTo(items, { opacity: 0, y: 18, filter: 'blur(10px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.9, ease: 'expo.out', stagger: 0.04 }, 0.55);
    $('[data-creds-close]').focus({ preventScroll: true });
  };
  const close = () => {
    if (dlg.hidden) return;
    const done = () => { dlg.hidden = true; lenis?.start(); btn.focus({ preventScroll: true }); };
    tl?.kill();
    if (!gsap || reduced) { done(); return; }
    const r = btn.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    tl = gsap.timeline({ onComplete: done });
    tl.to(items, { opacity: 0, duration: 0.18, ease: 'power1.out' })
      .to(dlg, { clipPath: `circle(0px at ${x}px ${y}px)`, duration: 0.55, ease: 'expo.inOut' }, 0.05);
  };
  btn.addEventListener('click', open);
  $('[data-creds-close]').addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (dlg.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'Tab') {
      // Foco atrapado dentro del panel
      const f = $$('button, a[href]', dlg).filter((el) => !el.closest('[hidden]'));
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });
}

/* ---------------------------------------------------------------- */
/* Formulario → correo                                                */
/* ---------------------------------------------------------------- */

const FORM_TO = 'javiercorralandres@gmail.com';

function initForm() {
  const form = $('[data-form]');
  const status = $('[data-form-status]');
  const mail = $('[data-mail]')?.textContent.trim() || '';
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let ok = true;
    $$('[required]', form).forEach((input) => {
      const bad = !input.value.trim() || (input.type === 'email' && !/^\S+@\S+\.\S+$/.test(input.value));
      input.closest('.field').classList.toggle('is-invalid', bad);
      if (bad) ok = false;
    });
    if (!ok) {
      status.textContent = 'Falta tu nombre, un email válido o qué quieres rodar.';
      $('.is-invalid input, .is-invalid textarea', form)?.focus();
      return;
    }
    const d = new FormData(form);
    const body = [
      `Tipo de proyecto: ${d.get('tipo')}`,
      `Nombre: ${d.get('nombre')}`,
      `Email: ${d.get('email')}`,
      `Localización: ${d.get('lugar') || '—'}`,
      `Fecha: ${d.get('fecha') || '—'}`,
      '',
      d.get('mensaje'),
    ].join('\n');
    const subject = `Rodaje · ${d.get('tipo')} · ${d.get('nombre')}`;
    const btn = $('[type="submit"]', form);
    btn.setAttribute('aria-busy', 'true');
    status.textContent = 'Enviando…';
    // FormSubmit por AJAX: el mensaje llega a Javi sin salir de la página.
    // Tras la primera activación se puede cambiar el correo por el código aleatorio que da FormSubmit.
    fetch(`https://formsubmit.co/ajax/${FORM_TO}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        _subject: subject,
        _replyto: d.get('email'),
        _template: 'table',
        _captcha: 'false',
        _honey: d.get('_honey') || '',
        'Tipo de proyecto': d.get('tipo'),
        Nombre: d.get('nombre'),
        Email: d.get('email'),
        'Localización': d.get('lugar') || '—',
        Fecha: d.get('fecha') || '—',
        Mensaje: d.get('mensaje'),
      }),
    })
      .then((r) => r.json().then((j) => { if (!r.ok || String(j.success) !== 'true') throw new Error(j.message); }))
      .then(() => {
        form.reset();
        status.textContent = 'Recibido. Javi te contestará por correo lo antes posible.';
      })
      .catch(() => {
        // Si el servicio falla, no se pierde la consulta: se abre el correo con todo preparado
        window.location.href = `mailto:${mail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        status.textContent = 'No se pudo enviar desde la web; se ha abierto tu correo con la propuesta lista.';
      })
      .finally(() => btn.removeAttribute('aria-busy'));
  });
  form.addEventListener('input', (e) => {
    const f = e.target.closest('.field');
    if (f?.classList.contains('is-invalid') && e.target.value.trim()) f.classList.remove('is-invalid');
  });
}

/* ---------------------------------------------------------------- */

// Botón "Pedir presupuesto": al pulsarlo el diafragma gira y se abre el texto mientras baja a contacto
const cta = $('[data-cta]');
if (cta) {
  let t;
  // En táctil (sin «pasar por encima»): el primer toque muestra «Presupuesto», el segundo lleva al formulario
  const touchUI = window.matchMedia('(hover: none)').matches;
  let hideT;
  cta.addEventListener('click', (e) => {
    if (touchUI && !cta.classList.contains('is-revealed')) {
      e.preventDefault();
      e.stopImmediatePropagation();   // que el scroll suave de los enlaces no baje aún al formulario
      cta.classList.add('is-revealed');
      clearTimeout(hideT);
      hideT = setTimeout(() => cta.classList.remove('is-revealed'), 4000);
      return;
    }
    cta.classList.remove('is-revealed');
    cta.classList.add('is-open');
    clearTimeout(t);
    t = setTimeout(() => cta.classList.remove('is-open'), 2400);
  }, true);
}

// WhatsApp: al pulsar en el móvil, el aro y el "timbre" del icono se ven antes de abrir la app
const waBtn = $('[data-wa]');
waBtn?.addEventListener('pointerdown', () => {
  waBtn.classList.add('is-pressed');
  setTimeout(() => waBtn.classList.remove('is-pressed'), 800);
});

// WhatsApp: aparece tras la portada y se retira en contacto y en el pie (no tapa el formulario ni el crédito)
const wa = $('[data-wa]');
if (wa) {
  const hideIn = new Set();
  const update = () => wa.classList.toggle('is-on', window.scrollY > innerHeight * 0.6 && hideIn.size === 0);
  const zones = new IntersectionObserver((entries) => {
    for (const e of entries) e.isIntersecting ? hideIn.add(e.target) : hideIn.delete(e.target);
    update();
  });
  ['#contacto', '.foot'].forEach((sel) => { const el = $(sel); if (el) zones.observe(el); });
  window.addEventListener('scroll', update, { passive: true });
  update();
}

initNav();
initTheater();
initLightbox();
initCreds();
initForm();
choreography();
window.addEventListener('load', () => {
  // Precarga en reposo del motor 3D (Three.js + modelos) para que la óptica aparezca sin espera
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1500));
  if (!saveData) idle(() => { import('./models.js').catch(() => {}); }, { timeout: 4000 });
  // Siempre empezar en el reel (salvo enlace con ancla)
  if (!location.hash && !userScrolled && window.scrollY < 40) {
    const top = () => { window.scrollTo(0, 0); lenis?.scrollTo(0, { immediate: true, force: true }); };
    top();
    requestAnimationFrame(top);
  }
  ScrollTrigger?.refresh();
});
