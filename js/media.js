// Selección de vídeo y foto: el códec más ligero que el dispositivo
// decodifica por hardware y la resolución justa para su tamaño en pantalla.
//
// Vídeos propios (generados con scripts/encode-media.sh):
//   <video data-video="assets/video/costa/costa" data-heights="2160 1440 1080 720">
// Vídeos provisionales (un único MP4 por calidad):
//   <video data-hd="...1080.mp4" data-uhd="...2160.mp4">

const dpr = Math.min(window.devicePixelRatio || 1, 3);
const conn = navigator.connection;
const isPhone = window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820;

// Techo de resolución según datos y red
function networkCap() {
  if (conn?.saveData) return 720;
  const t = conn?.effectiveType;
  if (t === 'slow-2g' || t === '2g' || t === '3g') return 720;
  if (typeof conn?.downlink === 'number' && conn.downlink > 0 && conn.downlink < 6) return 1080;
  return isPhone ? 1080 : 2160; // en móvil 1080p ya cubre la pantalla y no satura la decodificación
}

const CT = {
  av1: (h) => `video/mp4; codecs="av01.0.${h >= 2160 ? '13' : h >= 1440 ? '12' : '08'}M.10"`,
  hevc: () => 'video/mp4; codecs="hvc1.2.4.L153.B0"',
  h264: () => 'video/mp4; codecs="avc1.640033"',
};
const BITRATE = { 2160: 16e6, 1440: 9e6, 1080: 6e6, 720: 3e6 };
const cache = new Map();

// ¿Se decodifica con fluidez y, salvo H.264, por hardware (eficiente)?
async function decodable(codec, h) {
  const key = codec + h;
  if (cache.has(key)) return cache.get(key);
  const p = (async () => {
    const contentType = CT[codec](h);
    if (navigator.mediaCapabilities?.decodingInfo) {
      try {
        const r = await navigator.mediaCapabilities.decodingInfo({
          type: 'file',
          video: { contentType, width: Math.round((h * 16) / 9), height: h, bitrate: BITRATE[h] || 6e6, framerate: 30 },
        });
        return r.supported && r.smooth && (codec === 'h264' || r.powerEfficient);
      } catch { /* sigue con canPlayType */ }
    }
    return document.createElement('video').canPlayType(contentType) === 'probably';
  })();
  cache.set(key, p);
  return p;
}

// Altura de fuente necesaria para cubrir el elemento (object-fit: cover, 16:9)
function neededHeight(el) {
  const box = (el === window ? null : el.getBoundingClientRect()) || { width: innerWidth, height: innerHeight };
  const w = box.width || innerWidth, h = box.height || innerHeight;
  return Math.max(h, (w * 9) / 16) * dpr;
}

function pickHeight(heights, need) {
  const asc = [...heights].sort((a, b) => a - b);
  const cap = networkCap();
  const allowed = asc.filter((h) => h <= cap);
  const pool = allowed.length ? allowed : [asc[0]];
  return pool.find((h) => h >= need * 0.9) ?? pool[pool.length - 1];
}

// URL para un vídeo propio (base + alturas disponibles)
export async function encodedSource(base, heights, sizeEl) {
  const h = pickHeight(heights, neededHeight(sizeEl));
  for (const codec of ['av1', 'hevc', 'h264']) {
    if (await decodable(codec, h)) return `${base}-${h}.${codec}.mp4`;
  }
  return `${base}-${h}.h264.mp4`;
}

// URL para cualquier <video> de la página
export async function sourceFor(v) {
  const frame = v.parentElement || v;
  if (v.dataset.video) {
    const heights = (v.dataset.heights || '1080').split(/[\s,]+/).map(Number).filter(Boolean);
    return encodedSource(v.dataset.video, heights, frame);
  }
  const need = neededHeight(frame);
  const cap = networkCap();
  if (v.dataset.uhd && need > 1300 && cap >= 1440) return v.dataset.uhd;
  return v.dataset.hd || v.dataset.uhd;
}

// URL para un clip del montaje del hero
export async function clipSource(clip, sizeEl) {
  if (clip.video) return encodedSource(clip.video, clip.heights || [1080], sizeEl);
  const need = neededHeight(sizeEl);
  if (clip.uhd && need > 1300 && networkCap() >= 1440) return clip.uhd;
  return clip.hd || clip.uhd;
}

// Fotos propias: <img data-img="assets/img/costa"> se convierte en <picture>
// con AVIF, srcset en 1100/1600/2800 px y respaldo JPG.
export function upgradePictures(root = document) {
  root.querySelectorAll('img[data-img]').forEach((img) => {
    if (img.closest('picture')) return;
    const base = img.dataset.img;
    const set = (ext) => [1100, 1600, 2800].map((w) => `${base}-${w}.${ext} ${w}w`).join(', ');
    const sizes = img.getAttribute('sizes') || '(max-width: 820px) 85vw, 45vw';
    const pic = document.createElement('picture');
    for (const [ext, type] of [['avif', 'image/avif']]) {
      const s = document.createElement('source');
      s.type = type; s.srcset = set(ext); s.sizes = sizes;
      pic.appendChild(s);
    }
    img.parentNode.insertBefore(pic, img);
    pic.appendChild(img);
    img.srcset = set('jpg');
    img.sizes = sizes;
    img.src = `${base}-1600.jpg`;
    img.dataset.full = `${base}-2800.jpg`;
  });
}
