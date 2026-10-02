// CaseVault colour icons drawn for v1.53 in the style of the provided artwork (icons/color/*.png).
//   OUT=dir node scripts/color-icons/make.js   (SVGs)   then   OUT=dir node scripts/color-icons/render.js   (96 px PNGs, needs Playwright)
// CaseVault's own colour icons in the style of the provided set: navy outline, flat blues/purples
// with a soft gradient, 128 x 128.
const fs = require('fs');
const N = '#1f2b4d';
const defs = `<defs>
<linearGradient id="b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5ea1ff"/><stop offset="1" stop-color="#2563eb"/></linearGradient>
<linearGradient id="lb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e3eeff"/><stop offset="1" stop-color="#b9d3ff"/></linearGradient>
<linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#a58bff"/><stop offset="1" stop-color="#6d4ee8"/></linearGradient>
<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fd37f"/><stop offset="1" stop-color="#22a447"/></linearGradient>
<linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff7a7f"/><stop offset="1" stop-color="#d9363e"/></linearGradient>
<linearGradient id="y" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd966"/><stop offset="1" stop-color="#f2b01e"/></linearGradient>
<linearGradient id="t" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fe0f0"/><stop offset="1" stop-color="#1aa6c0"/></linearGradient>
<linearGradient id="w" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#eef2f8"/></linearGradient>
<linearGradient id="k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#e9b77d"/><stop offset="1" stop-color="#c98a4a"/></linearGradient>
</defs>`;
const S = (d) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">${defs}<g stroke="${N}" stroke-width="6" stroke-linejoin="round" stroke-linecap="round">${d}</g></svg>`;
const page = (fill = 'url(#w)') => `<path d="M30 10 H78 L102 34 V118 H30 Z" fill="${fill}"/><path d="M78 10 V34 H102" fill="#d6dfee"/>`;
const lines = (y0, n, x1 = 44, x2 = 88, c = '#9fb3d1') => Array.from({ length: n }, (_, i) => `<path d="M${x1} ${y0 + i * 13} H${x2}" stroke="${c}" stroke-width="6"/>`).join('');
const plusBadge = (cx = 96, cy = 96, f = 'url(#g)') => `<circle cx="${cx}" cy="${cy}" r="22" fill="${f}"/><path d="M${cx} ${cy - 11} V${cy + 11} M${cx - 11} ${cy} H${cx + 11}" stroke="#fff" stroke-width="7"/>`;
const checkBadge = (cx = 96, cy = 96) => `<circle cx="${cx}" cy="${cy}" r="22" fill="url(#g)"/><path d="M${cx - 10} ${cy} l7 7 l13 -14" fill="none" stroke="#fff" stroke-width="7"/>`;
const pencil = (s = 1, dx = 0, dy = 0) => `<g transform="translate(${dx} ${dy}) scale(${s})"><path d="M86 14 L114 42 L50 106 L22 106 L22 78 Z" fill="url(#y)"/><path d="M76 24 L104 52" fill="none"/><path d="M22 78 L50 106" fill="none"/><path d="M22 92 V106 H36 Z" fill="${N}"/></g>`;
const person = (cx, cy, s, f) => `<circle cx="${cx}" cy="${cy - 18 * s}" r="${16 * s}" fill="${f}"/><path d="M${cx - 30 * s} ${cy + 34 * s} C${cx - 30 * s} ${cy + 4 * s} ${cx + 30 * s} ${cy + 4 * s} ${cx + 30 * s} ${cy + 34 * s} Z" fill="${f}"/>`;
const shieldPath = 'M64 8 L110 24 V58 C110 88 90 108 64 120 C38 108 18 88 18 58 V24 Z';
const I = {
  search: S(`<path d="M80 80 L112 112" stroke-width="20"/><path d="M80 80 L112 112" stroke="url(#b)" stroke-width="9"/><circle cx="52" cy="52" r="36" fill="url(#lb)" stroke-width="9"/><path d="M34 42 A22 22 0 0 1 52 30" fill="none" stroke="#fff" stroke-width="7"/>`),
  eye: S(`<path d="M8 64 Q64 6 120 64 Q64 122 8 64 Z" fill="url(#w)"/><circle cx="64" cy="64" r="26" fill="url(#b)"/><circle cx="64" cy="64" r="10" fill="${N}" stroke="none"/><circle cx="56" cy="55" r="6" fill="#fff" stroke="none"/>`),
  'eye-slash': S(`<path d="M8 64 Q64 6 120 64 Q64 122 8 64 Z" fill="url(#w)"/><circle cx="64" cy="64" r="26" fill="url(#b)"/><circle cx="64" cy="64" r="10" fill="${N}" stroke="none"/><path d="M18 112 L110 16" stroke-width="20"/><path d="M18 112 L110 16" stroke="#ef4f56" stroke-width="9"/>`),
  'shield-lock': S(`<path d="${shieldPath}" fill="url(#b)"/><path d="M50 60 V50 A14 14 0 0 1 78 50 V60" fill="none" stroke="#fff" stroke-width="7"/><rect x="42" y="58" width="44" height="34" rx="3" fill="#fff" stroke="#fff" stroke-width="2"/><circle cx="64" cy="73" r="5" fill="${N}" stroke="none"/><path d="M64 76 V84" stroke-width="5"/>`),
  robot: S(`<path d="M64 12 V26" /><circle cx="64" cy="12" r="7" fill="url(#r)"/><rect x="10" y="54" width="12" height="28" fill="url(#b)"/><rect x="106" y="54" width="12" height="28" fill="url(#b)"/><rect x="22" y="28" width="84" height="80" rx="14" fill="url(#lb)"/><circle cx="46" cy="62" r="11" fill="url(#t)"/><circle cx="82" cy="62" r="11" fill="url(#t)"/><path d="M46 88 H82"/>`),
  'file-pdf': S(`${page()}<rect x="18" y="66" width="76" height="34" fill="url(#r)"/><text x="56" y="92" font-family="Arial,Helvetica,sans-serif" font-size="25" font-weight="900" fill="#fff" stroke="none" text-anchor="middle">PDF</text>`),
  'file-word': S(`${page()}<rect x="18" y="62" width="50" height="44" fill="url(#b)"/><text x="43" y="96" font-family="Arial,Helvetica,sans-serif" font-size="34" font-weight="900" fill="#fff" stroke="none" text-anchor="middle">W</text>${lines(64, 3, 78, 90)}`),
  'clipboard-check': S(`<rect x="20" y="18" width="88" height="102" rx="8" fill="url(#p)"/><rect x="32" y="32" width="64" height="76" fill="#fff"/><rect x="44" y="10" width="40" height="18" rx="5" fill="url(#lb)"/><path d="M44 70 l13 13 l28 -30" fill="none" stroke="#22a447" stroke-width="10"/>`),
  download: S(`<path d="M14 82 V112 H114 V82" fill="none" stroke-width="9"/><path d="M50 14 H78 V54 H96 L64 90 L32 54 H50 Z" fill="url(#b)"/>`),
  'pencil-square': S(`<rect x="12" y="24" width="84" height="92" rx="6" fill="url(#w)"/>${lines(48, 4, 26, 62)}${pencil(0.78, 32, 4)}`),
  pencil: S(pencil(1, 0, 4)),
  files: S(`<path d="M18 4 H62 L84 26 V98 H18 Z" fill="url(#lb)"/><path d="M42 26 H86 L108 48 V122 H42 Z" fill="url(#w)"/><path d="M86 26 V48 H108" fill="#d6dfee"/>${lines(70, 3, 56, 94)}`),
  'file-text': S(`${page()}${lines(54, 4)}`),
  'file-ruled': S(`${page()}<rect x="42" y="50" width="48" height="52" fill="url(#lb)"/><path d="M42 67 H90 M42 84 H90 M58 50 V102" />`),
  'file-plus': S(`${page()}${lines(50, 3, 44, 84)}${plusBadge(96, 98)}`),
  collection: S(`<rect x="28" y="8" width="72" height="16" fill="url(#lb)"/><rect x="18" y="24" width="92" height="16" fill="url(#p)"/><rect x="8" y="40" width="112" height="78" rx="6" fill="url(#b)"/><path d="M48 66 H80" stroke="#fff" stroke-width="8"/>`),
  flag: S(`<path d="M26 10 V122" stroke-width="9"/><path d="M30 18 C56 4 72 34 106 20 V72 C72 86 56 56 30 70 Z" fill="url(#r)"/>`),
  'journal-bookmark': S(`<rect x="22" y="8" width="84" height="112" rx="6" fill="url(#b)"/><rect x="22" y="8" width="16" height="112" fill="#1d4ed8"/><path d="M62 8 V52 L74 42 L86 52 V8 Z" fill="url(#r)"/><rect x="52" y="72" width="40" height="14" fill="#fff" stroke="none"/>`),
  signpost: S(`<path d="M64 8 V122" stroke-width="10"/><path d="M64 18 H104 L118 32 L104 46 H64 Z" fill="url(#b)"/><path d="M64 56 H24 L10 70 L24 84 H64 Z" fill="url(#g)"/>`),
  box: S(`<path d="M14 40 L64 18 L114 40 V96 L64 118 L14 96 Z" fill="url(#k)"/><path d="M14 40 L64 62 L114 40 M64 62 V118" fill="none"/><path d="M38 29 L88 51 V70" fill="none" stroke="#fff3d6" stroke-width="8"/>`),
  inbox: S(`<path d="M10 70 L28 22 H100 L118 70 V112 H10 Z" fill="url(#lb)"/><path d="M10 70 H42 L50 84 H78 L86 70 H118 V112 H10 Z" fill="url(#b)"/>`),
  mic: S(`<rect x="42" y="8" width="44" height="72" rx="22" fill="url(#b)"/><path d="M26 58 C26 104 102 104 102 58" fill="none" stroke-width="8"/><path d="M64 96 V118 M44 118 H84" stroke-width="8"/><path d="M54 30 H74 M54 46 H74" stroke="#fff" stroke-width="6"/>`),
  car: S(`<path d="M22 58 L34 26 H94 L106 58" fill="url(#lb)"/><rect x="10" y="56" width="108" height="42" rx="10" fill="url(#b)"/><rect x="18" y="96" width="18" height="18" fill="${N}"/><rect x="92" y="96" width="18" height="18" fill="${N}"/><circle cx="32" cy="76" r="9" fill="url(#y)"/><circle cx="96" cy="76" r="9" fill="url(#y)"/><path d="M52 80 H76" stroke="#fff" stroke-width="6"/>`),
  'check-circle': S(`<circle cx="64" cy="64" r="54" fill="url(#g)"/><path d="M38 66 l18 18 l36 -40" fill="none" stroke="#fff" stroke-width="13"/>`),
  'list-check': S(`<rect x="16" y="10" width="96" height="108" rx="8" fill="url(#w)"/><path d="M28 36 l7 7 l12 -13 M28 66 l7 7 l12 -13 M28 96 l7 7 l12 -13" fill="none" stroke="#22a447" stroke-width="7"/><path d="M62 38 H98 M62 68 H98 M62 98 H98" stroke="#9fb3d1" stroke-width="7"/>`),
  'folder-plus': S(`<path d="M8 22 H50 L60 34 H120 V108 H8 Z" fill="url(#y)"/><path d="M8 44 H120" fill="none" stroke="#e8a412"/>${plusBadge(98, 96)}`),
  pc: S(`<rect x="8" y="12" width="112" height="78" rx="6" fill="url(#lb)"/><rect x="18" y="22" width="92" height="56" fill="url(#b)" stroke="none"/><path d="M64 90 V110 M38 116 H90" stroke-width="9"/>`),
  'bookmark-plus': S(`<path d="M28 8 H92 V120 L60 96 L28 120 Z" fill="url(#r)"/><path d="M60 30 V66 M42 48 H78" stroke="#fff" stroke-width="9"/>`),
  'camera-video': S(`<rect x="8" y="32" width="80" height="64" rx="10" fill="url(#b)"/><path d="M88 54 L120 36 V92 L88 74 Z" fill="url(#lb)"/><circle cx="34" cy="52" r="7" fill="url(#r)"/>`),
  camera: S(`<path d="M40 22 H88 L96 36 H116 V108 H12 V36 H32 Z" fill="url(#lb)"/><circle cx="64" cy="70" r="26" fill="url(#b)"/><circle cx="64" cy="70" r="10" fill="#fff" stroke="none"/><rect x="96" y="46" width="10" height="8" fill="url(#y)" stroke-width="3"/>`),
  printer: S(`<rect x="32" y="10" width="64" height="34" fill="url(#w)"/><rect x="8" y="42" width="112" height="52" rx="8" fill="url(#b)"/><rect x="30" y="74" width="68" height="46" fill="url(#w)"/>${lines(90, 2, 42, 86)}<circle cx="100" cy="58" r="5" fill="url(#g)" stroke="none"/>`),
  clock: S(`<circle cx="64" cy="64" r="54" fill="url(#w)" stroke-width="9"/><circle cx="64" cy="64" r="54" fill="none" stroke="url(#b)" stroke-width="5"/><path d="M64 30 V64 L86 78" fill="none" stroke-width="8"/>`),
  'person-plus': S(`${person(54, 62, 1.25, 'url(#b)')}${plusBadge(100, 40)}`),
  people: S(`${person(86, 58, 1.05, 'url(#p)')}${person(48, 70, 1.15, 'url(#b)')}`),
  'shield-alert': S(`<path d="${shieldPath}" fill="url(#y)"/><path d="M64 34 V74" stroke-width="12"/><circle cx="64" cy="94" r="7" fill="${N}" stroke="none"/>`),
  'bell-red': S(`<path d="M64 12 C40 12 30 32 30 54 V78 L18 94 H110 L98 78 V54 C98 32 88 12 64 12 Z" fill="url(#r)"/><path d="M50 100 C50 118 78 118 78 100" fill="url(#r)"/><path d="M44 46 C44 36 50 28 58 26" fill="none" stroke="#ffd0d2" stroke-width="7"/>`),
  'bar-chart': S(`<path d="M10 116 H118" stroke-width="8"/><rect x="18" y="64" width="22" height="50" fill="url(#b)"/><rect x="53" y="34" width="22" height="80" fill="url(#p)"/><rect x="88" y="14" width="22" height="100" fill="url(#t)"/>`),
  'undo': S(`<path d="M30 46 H82 C104 46 114 62 114 78 C114 96 102 110 82 110 H46" fill="none" stroke-width="12"/><path d="M30 46 H82 C104 46 114 62 114 78 C114 96 102 110 82 110 H46" fill="none" stroke="url(#b)" stroke-width="5"/><path d="M42 18 L12 46 L42 74 Z" fill="url(#b)"/>`),
};
fs.mkdirSync(process.env.OUT, { recursive: true });
for (const [k, v] of Object.entries(I)) fs.writeFileSync(`${process.env.OUT}/${k}.svg`, v);
console.log(Object.keys(I).length);
