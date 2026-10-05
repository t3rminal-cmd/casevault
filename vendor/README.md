# Bundled libraries

Everything CaseVault needs is stored here, so the app never loads code from the internet.

| Library | Version | Used for | License |
|---|---|---|---|
| [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | 6.3.289 | Reading text from PDFs (legacy build, for older browsers) | Apache-2.0 (`pdfjs/LICENSE`, decoder licenses in `pdfjs/wasm/`) |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | 7.0.0 | OCR for scanned PDFs and photos | Apache-2.0 (`tesseract/LICENSE`) |
| [tesseract.js-core](https://github.com/naptha/tesseract.js-core) | 7.0.0 | OCR engine (WebAssembly) | Apache-2.0 (`tesseract/core/LICENSE`) |
| English OCR model (`@tesseract.js-data/eng`, 4.0.0_best_int) | 1.0.0 | OCR language data | Apache-2.0 |
| [SheetJS Community Edition](https://sheetjs.com) (`xlsx.full.min.js`) | 0.20.3 | Reading Excel (.xlsx/.xls/.ods) and CSV files | Apache-2.0 (`sheetjs/LICENSE`) |
| [Bootstrap Icons](https://icons.getbootstrap.com) | 1.13.1 | The icons, as inline SVG. Only the icons CaseVault uses are kept, in `js/icons-data.js` (made by `scripts/make-icons.js`) | MIT (`bootstrap-icons/LICENSE`) |
| [Poppins](https://github.com/itfoundry/Poppins) (`@fontsource/poppins`, Latin subset) | 5.3.0 | The app's font (regular, medium, semibold, bold) | SIL Open Font License 1.1 (`poppins/OFL.txt`) |

### SheetJS provenance

SheetJS no longer publishes new versions to the main npm registry (npm's `xlsx` stops at 0.18.5, which has known security issues: CVE-2023-30533 and CVE-2024-22363). Official releases are only on `cdn.sheetjs.com`. The bundled 0.20.3 build was taken from the npm package `@e965/xlsx@0.20.3`, a mirror that republishes the official CDN tarballs. Its version banner (`/*! xlsx.js (C) 2013-present SheetJS */`, `version="0.20.3"`) and Apache-2.0 license match the upstream release.

SHA-256 of `sheetjs/xlsx.full.min.js`: `cc015130aa8521e7f088f88898eba949ccdcbfb38df0bd129b44b7273c3a6f41`

To use the file straight from SheetJS instead, download `https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js` and replace `sheetjs/xlsx.full.min.js` (same name).

### Icons

To use another icon, add its name (from icons.getbootstrap.com) to `NAMES` in `scripts/make-icons.js`, then run `npm pack bootstrap-icons`, unpack it, and `node scripts/make-icons.js package/icons`. `tests/icons.test.js` fails if the app asks for an icon that isn't in the file.
