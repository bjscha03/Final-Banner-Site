// The modern PDF.js bundle requires Promise.withResolvers (missing in Safari 16).
// Use the vendor's compatibility build in both the page and its worker.
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import workerUrl from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
export * from 'pdfjs-dist/legacy/build/pdf.mjs';
