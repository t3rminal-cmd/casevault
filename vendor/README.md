# Bundled libraries

Everything CaseVault needs is stored here, so the app never loads code from the internet.

| Library | Version | Used for | License |
|---|---|---|---|
| [pdf.js](https://github.com/mozilla/pdf.js) (`pdfjs-dist`) | 6.3.289 | Reading text from PDFs (legacy build, for older browsers) | Apache-2.0 (`pdfjs/LICENSE`, decoder licenses in `pdfjs/wasm/`) |
| [Tesseract.js](https://github.com/naptha/tesseract.js) | 7.0.0 | OCR for scanned PDFs and photos | Apache-2.0 (`tesseract/LICENSE`) |
| [tesseract.js-core](https://github.com/naptha/tesseract.js-core) | 7.0.0 | OCR engine (WebAssembly) | Apache-2.0 (`tesseract/core/LICENSE`) |
| English OCR model (`@tesseract.js-data/eng`, 4.0.0_best_int) | 1.0.0 | OCR language data | Apache-2.0 |

To update, install the new versions from npm and copy the same files over. Keep the file names, which `js/extract.js` and `sw.js` refer to.
