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
  // v1.57: the rest of the program's icons, in the same style
  'plus': S(`<circle cx="64" cy="64" r="52" fill="url(#g)"/><path d="M64 36 V92 M36 64 H92" stroke="#fff" stroke-width="13"/>`),
  'minus': S(`<circle cx="64" cy="64" r="52" fill="url(#b)"/><path d="M36 64 H92" stroke="#fff" stroke-width="13"/>`),
  'close': S(`<circle cx="64" cy="64" r="52" fill="url(#w)"/><path d="M44 44 L84 84 M84 44 L44 84" stroke="#ef4f56" stroke-width="12"/>`),
  'check': S(`<circle cx="64" cy="64" r="52" fill="url(#g)"/><path d="M38 66 l18 18 l36 -40" fill="none" stroke="#fff" stroke-width="13"/>`),
  'arrow-up': S(`<path d="M64 10 L108 58 H82 V118 H46 V58 H20 Z" fill="url(#b)"/>`),
  'arrow-down': S(`<path d="M64 118 L108 70 H82 V10 H46 V70 H20 Z" fill="url(#b)"/>`),
  'arrow-left': S(`<path d="M10 64 L58 20 V46 H118 V82 H58 V108 Z" fill="url(#b)"/>`),
  'arrow-right': S(`<path d="M118 64 L70 20 V46 H10 V82 H70 V108 Z" fill="url(#b)"/>`),
  'swap': S(`<path d="M14 42 L46 14 V30 H112 V54 H46 V70 Z" fill="url(#b)"/><path d="M114 86 L82 58 V74 H16 V98 H82 V114 Z" fill="url(#p)"/>`),
  'refresh': S(`<path d="M104 52 A42 42 0 1 0 104 82" fill="none" stroke-width="18"/><path d="M104 52 A42 42 0 1 0 104 82" fill="none" stroke="url(#g)" stroke-width="9"/><path d="M118 20 V62 H76 Z" fill="url(#g)"/>`),
  'expand': S(`<rect x="12" y="12" width="104" height="104" rx="8" fill="url(#w)"/><path d="M28 28 H58 L28 58 Z M100 100 H70 L100 70 Z" fill="url(#b)"/><path d="M38 38 L90 90" stroke-width="8"/>`),
  'contract': S(`<rect x="12" y="12" width="104" height="104" rx="8" fill="url(#w)"/><path d="M58 58 H30 L58 30 Z M70 70 H98 L70 98 Z" fill="url(#b)"/><path d="M24 24 L52 52 M76 76 L104 104" stroke-width="8"/>`),
  'dock': S(`<rect x="12" y="12" width="104" height="104" rx="8" fill="url(#w)"/><rect x="12" y="76" width="56" height="40" fill="url(#lb)"/><path d="M104 24 L56 72 M56 40 V72 H88" fill="none" stroke-width="10"/>`),
  'move': S(`<path d="M64 6 L84 30 H72 V56 H98 V44 L122 64 L98 84 V72 H72 V98 H84 L64 122 L44 98 H56 V72 H30 V84 L6 64 L30 44 V56 H56 V30 H44 Z" fill="url(#b)"/>`),
  'logout': S(`<rect x="10" y="12" width="66" height="104" rx="6" fill="url(#lb)"/><path d="M50 64 H112" stroke-width="12"/><path d="M50 64 H112" stroke="url(#r)" stroke-width="5"/><path d="M94 40 L120 64 L94 88" fill="none" stroke-width="10"/>`),
  'building': S(`<path d="M64 8 L120 36 H8 Z" fill="url(#b)"/><rect x="14" y="36" width="100" height="8" fill="url(#lb)"/><rect x="22" y="48" width="14" height="54" fill="url(#w)"/><rect x="48" y="48" width="14" height="54" fill="url(#w)"/><rect x="74" y="48" width="14" height="54" fill="url(#w)"/><rect x="98" y="48" width="10" height="54" fill="url(#w)"/><rect x="8" y="104" width="112" height="14" fill="url(#b)"/>`),
  'person-search': S(`${person(50, 60, 1.05, 'url(#b)')}<path d="M96 96 L118 118" stroke-width="16"/><circle cx="86" cy="84" r="22" fill="url(#lb)" stroke-width="8"/><path d="M76 78 A10 10 0 0 1 86 72" fill="none" stroke="#fff" stroke-width="5"/>`),
  'person-alert': S(`${person(50, 64, 1.15, 'url(#b)')}<circle cx="98" cy="40" r="22" fill="url(#y)"/><path d="M98 28 V42" stroke-width="7"/><circle cx="98" cy="52" r="3.5" fill="${N}" stroke="none"/>`),
  'person-circle': S(`<circle cx="64" cy="64" r="54" fill="url(#lb)"/><circle cx="64" cy="50" r="18" fill="url(#b)"/><path d="M30 104 C34 80 94 80 98 104" fill="url(#b)"/>`),
  'clipboard-pulse': S(`<rect x="20" y="18" width="88" height="102" rx="8" fill="url(#t)"/><rect x="32" y="32" width="64" height="76" fill="#fff"/><rect x="44" y="10" width="40" height="18" rx="5" fill="url(#lb)"/><path d="M36 72 H50 L58 54 L70 90 L78 72 H92" fill="none" stroke="#d9363e" stroke-width="7"/>`),
  'warning': S(`<path d="M64 10 L122 112 H6 Z" fill="url(#y)"/><path d="M64 44 V80" stroke-width="12"/><circle cx="64" cy="96" r="6" fill="${N}" stroke="none"/>`),
  'info': S(`<circle cx="64" cy="64" r="54" fill="url(#b)"/><circle cx="64" cy="38" r="8" fill="#fff" stroke="none"/><path d="M64 56 V96" stroke="#fff" stroke-width="13"/>`),
  'file-blank': S(`${page()}`),
  'file-music': S(`${page()}<path d="M56 98 V58 L84 52 V90" fill="none" stroke-width="7"/><circle cx="50" cy="98" r="9" fill="url(#p)"/><circle cx="78" cy="90" r="9" fill="url(#p)"/>`),
  'file-play': S(`${page()}<path d="M52 54 L84 74 L52 94 Z" fill="url(#r)"/>`),
  'file-sheet': S(`${page()}<rect x="40" y="48" width="52" height="54" fill="url(#g)"/><path d="M40 66 H92 M40 84 H92 M62 48 V102" stroke="#fff" stroke-width="5"/>`),
  'file-zip': S(`${page()}<path d="M56 12 V30 M56 38 V48 M56 56 V64" stroke-width="8"/><rect x="46" y="66" width="20" height="24" fill="url(#y)"/>`),
  'fire': S(`<path d="M64 8 C70 34 98 46 98 78 C98 104 82 120 64 120 C46 120 30 104 30 80 C30 62 40 52 46 40 C50 54 56 60 62 60 C56 42 58 24 64 8 Z" fill="url(#r)"/><path d="M64 70 C70 82 80 88 80 100 C80 110 72 116 64 116 C56 116 48 110 48 100 C48 90 58 84 64 70 Z" fill="url(#y)" stroke-width="4"/>`),
  'folder-link': S(`<path d="M8 22 H50 L60 34 H120 V108 H8 Z" fill="url(#y)"/><path d="M8 44 H120" fill="none" stroke="#e8a412"/><path d="M40 92 C40 70 56 62 78 62 V50 L100 70 L78 90 V78 C62 78 50 82 40 92 Z" fill="url(#b)"/>`),
  'incognito': S(`<path d="M28 50 L40 16 H88 L100 50 Z" fill="url(#p)"/><path d="M8 54 H120" stroke-width="10"/><circle cx="38" cy="88" r="20" fill="url(#lb)" stroke-width="8"/><circle cx="90" cy="88" r="20" fill="url(#lb)" stroke-width="8"/><path d="M58 86 C62 80 66 80 70 86" fill="none" stroke-width="7"/>`),
  'key': S(`<circle cx="40" cy="64" r="28" fill="url(#y)"/><circle cx="34" cy="64" r="8" fill="#fff"/><path d="M66 58 H118 V74 H106 V88 H92 V74 H66 Z" fill="url(#y)"/>`),
  'moon': S(`<path d="M86 14 C56 18 34 42 34 72 C34 100 56 118 84 118 C100 118 112 112 120 102 C86 104 62 82 62 52 C62 36 72 22 86 14 Z" fill="url(#p)"/><circle cx="100" cy="36" r="5" fill="url(#y)" stroke-width="3"/>`),
  'sun': S(`<circle cx="64" cy="64" r="26" fill="url(#y)"/><path d="M64 8 V24 M64 104 V120 M8 64 H24 M104 64 H120 M24 24 L35 35 M93 93 L104 104 M104 24 L93 35 M35 93 L24 104" stroke="#f2b01e" stroke-width="9"/>`),
  'verified': S(`<path d="M64 6 L80 20 L102 18 L106 40 L122 56 L110 74 L114 96 L92 102 L80 120 L64 110 L48 120 L36 102 L14 96 L18 74 L6 56 L22 40 L26 18 L48 20 Z" fill="url(#b)"/><path d="M42 64 l16 16 l30 -32" fill="none" stroke="#fff" stroke-width="11"/>`),
  'plug': S(`<path d="M44 8 V36 M84 8 V36" stroke-width="10"/><path d="M28 36 H100 V62 C100 82 84 94 64 94 C44 94 28 82 28 62 Z" fill="url(#b)"/><path d="M64 94 V120" stroke-width="10"/><circle cx="64" cy="62" r="7" fill="url(#g)" stroke-width="3"/>`),
  'shield': S(`<path d="${shieldPath}" fill="url(#b)"/><path d="M64 22 V108" stroke="#7fb2ff" stroke-width="6"/>`),
  'shield-ok': S(`<path d="${shieldPath}" fill="url(#b)"/><path d="M42 64 l16 16 l30 -32" fill="none" stroke="#fff" stroke-width="11"/>`),
  'star': S(`<path d="M64 8 L80 44 L120 48 L90 74 L98 114 L64 94 L30 114 L38 74 L8 48 L48 44 Z" fill="url(#y)"/>`),
  'terminal': S(`<rect x="8" y="16" width="112" height="96" rx="8" fill="#2b3550"/><rect x="8" y="16" width="112" height="16" fill="url(#lb)"/><path d="M28 54 L46 70 L28 86" fill="none" stroke="#5fe0a0" stroke-width="9"/><path d="M56 90 H88" stroke="#5fe0a0" stroke-width="9"/>`),
  'zoom-in': S(`<path d="M80 80 L112 112" stroke-width="20"/><path d="M80 80 L112 112" stroke="url(#b)" stroke-width="9"/><circle cx="52" cy="52" r="36" fill="url(#lb)" stroke-width="9"/><path d="M52 34 V70 M34 52 H70" stroke="#22a447" stroke-width="10"/>`),
  'scales': S(`<path d="M64 14 V110 M36 116 H92" stroke-width="10"/><path d="M20 38 H108" stroke-width="8"/><path d="M20 38 L6 76 H34 Z M108 38 L94 76 H122 Z" fill="url(#y)" stroke-width="5"/><circle cx="64" cy="20" r="9" fill="url(#y)"/>`),
  'police-star': S(`<path d="M64 6 L78 34 L110 30 L96 58 L118 84 L86 90 L76 122 L64 100 L52 122 L42 90 L10 84 L32 58 L18 30 L50 34 Z" fill="url(#y)"/><circle cx="64" cy="66" r="18" fill="url(#b)"/><path d="M64 56 L68 64 L76 65 L70 70 L72 78 L64 74 L56 78 L58 70 L52 65 L60 64 Z" fill="#fff" stroke="none"/>`),
  'laptop-shield': S(`<rect x="18" y="16" width="92" height="66" rx="4" fill="url(#lb)"/><path d="M6 88 H122 L112 108 H16 Z" fill="url(#b)"/><path d="M64 28 L84 34 V50 C84 62 76 68 64 74 C52 68 44 62 44 50 V34 Z" fill="url(#g)" stroke-width="5"/>`),
  'phone-voip': S(`<rect x="30" y="6" width="68" height="116" rx="12" fill="url(#b)"/><rect x="40" y="20" width="48" height="76" fill="url(#lb)" stroke-width="4"/><path d="M50 50 C56 40 72 40 78 50 M56 60 C60 54 68 54 72 60" fill="none" stroke="#1aa6c0" stroke-width="6"/><circle cx="64" cy="70" r="4" fill="${N}" stroke="none"/><circle cx="64" cy="108" r="5" fill="#fff" stroke="none"/>`),
  'antenna': S(`<path d="M64 52 L36 120 M64 52 L92 120 M46 96 H82" stroke-width="9" fill="none"/><circle cx="64" cy="48" r="10" fill="url(#r)"/><path d="M40 24 C30 36 30 60 40 72 M88 24 C98 36 98 60 88 72 M24 12 C8 32 8 64 24 84 M104 12 C120 32 120 64 104 84" fill="none" stroke="url(#b)" stroke-width="7"/>`),
  'chain-search': S(`<rect x="8" y="30" width="44" height="30" rx="14" fill="none" stroke="url(#y)" stroke-width="12"/><rect x="8" y="30" width="44" height="30" rx="14" fill="none" stroke-width="4"/><rect x="38" y="30" width="44" height="30" rx="14" fill="none" stroke="url(#y)" stroke-width="12"/><rect x="38" y="30" width="44" height="30" rx="14" fill="none" stroke-width="4"/><path d="M98 98 L120 120" stroke-width="14"/><circle cx="86" cy="86" r="22" fill="url(#lb)" stroke-width="8"/>`),
};
fs.mkdirSync(process.env.OUT, { recursive: true });
for (const [k, v] of Object.entries(I)) fs.writeFileSync(`${process.env.OUT}/${k}.svg`, v);
console.log(Object.keys(I).length);
